import { buildVoicePlan, contentHash, durationMs, synthesize, wavFromPcm } from './listening.ts'
import { getAdminClient } from './supabase.ts'
import { resolveTrack } from './teaching.ts'

type Card = {
  id: string
  prompt_text: string
  prompt_is_word?: boolean
  audio_url?: string | null
  audio_status?: string
  accepted_answers: string[]
}

async function storeCardAudio(sessionId: string, card: Card, language: string) {
  if (card.audio_url) return card.audio_url
  const word = card.prompt_is_word ? card.prompt_text : card.accepted_answers[0]
  if (!word) return null

  const supabase = getAdminClient()
  // The row is the lock. If several students open an old deck together, only
  // one request may claim this card and spend a TTS call; the others simply see
  // it as still preparing and pick up the stored URL on their next refresh.
  const { data: claimed, error: claimError } = await supabase.from('quiz_items')
    .update({ audio_status: 'processing' }).eq('id', card.id).eq('audio_status', 'pending').select('id').maybeSingle()
  if (claimError) throw claimError
  if (!claimed) return null

  try {
  const hash = await contentHash(word, language, null, 'passage')
  const { data: existing } = await supabase.from('listening_clips')
    .select('public_url').eq('session_id', sessionId).eq('content_hash', hash).maybeSingle()
  let publicUrl = existing?.public_url || ''

  if (!publicUrl) {
    const plan = buildVoicePlan('passage', language, null, [], [], word)
    plan.instruction = `${plan.instruction} Pronounce only the supplied word or phrase once. Do not add any other words.`
    const pcm = await synthesize(word, plan)
    const wav = wavFromPcm(pcm)
    const storagePath = `${sessionId}/flashcards/${hash}.wav`
    const { error: uploadError } = await supabase.storage.from('lingoact-listening')
      .upload(storagePath, wav, { contentType: 'audio/wav', upsert: false })
    if (uploadError && !uploadError.message.toLowerCase().includes('already exists')) throw uploadError
    publicUrl = supabase.storage.from('lingoact-listening').getPublicUrl(storagePath).data.publicUrl
    const { error: insertError } = await supabase.from('listening_clips').insert({
      session_id: sessionId,
      source: 'text',
      kind: 'passage',
      language,
      script: null,
      transcript: word,
      storage_path: storagePath,
      public_url: publicUrl,
      duration_ms: durationMs(pcm.length),
      voices: { instruction: plan.instruction, speakers: [] },
      content_hash: hash,
    })
    if (insertError && insertError.code !== '23505') throw insertError
  }

  const { error: updateError } = await supabase.from('quiz_items')
    .update({ audio_url: publicUrl, audio_status: 'ready' }).eq('id', card.id)
  if (updateError) throw updateError
  return publicUrl
  } catch (error) {
    await supabase.from('quiz_items').update({ audio_status: 'pending' }).eq('id', card.id)
    throw error
  }
}

export async function ensureFlashcardAudio(sessionId: string, quizId: string, teachingTrack: string | null | undefined) {
  const supabase = getAdminClient()
  const { data: items, error: itemError } = await supabase.from('quiz_items')
    .select('id, prompt_text, prompt_is_word, audio_url, audio_status').eq('quiz_id', quizId).order('position')
  if (itemError) throw itemError
  if (!items?.length) return
  const { data: keys, error: keyError } = await supabase.from('quiz_item_keys')
    .select('item_id, accepted_answers').in('item_id', items.map((item) => item.id))
  if (keyError) throw keyError
  const keyByItem = new Map((keys || []).map((key) => [key.item_id, key.accepted_answers as string[]]))
  const cards = (items || []).map((item) => ({ ...item, accepted_answers: keyByItem.get(item.id) || [] }))
  const language = resolveTrack(teachingTrack).language
  const results = await Promise.allSettled(cards.map((card) => storeCardAudio(sessionId, card, language)))
  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length) console.warn(`flashcard audio: ${failed.length}/${cards.length} clips failed`)
}
