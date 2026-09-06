import { corsHeaders, errorDetail, jsonResponse } from '../_shared/ai.ts'
import { getAdminClient, hashPresenterToken } from '../_shared/supabase.ts'
import { buildVoicePlan, contentHash, durationMs, synthesize, wavFromPcm } from '../_shared/listening.ts'
import type { ChineseScript, ClipKind } from '../_shared/listening.ts'

const KINDS: ClipKind[] = ['passage', 'dialogue', 'scene']

// The bucket's own ceiling. At 24 kHz mono this is a little over three minutes,
// which is longer than any single listening item should be anyway.
const MAX_BYTES = 10 * 1024 * 1024

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ message: 'Method not allowed.' }, 405)

  try {
    const input = await req.json()
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : ''
    const presenterToken = typeof input.presenterToken === 'string' ? input.presenterToken : ''
    const transcript = typeof input.transcript === 'string' ? input.transcript.trim() : ''
    const kind = KINDS.includes(input.kind) ? input.kind as ClipKind : 'passage'
    const language = (typeof input.language === 'string' ? input.language : 'zh-tw').toLowerCase()
    const script = input.script === 'traditional' || input.script === 'simplified' ? input.script as ChineseScript : null
    const screenshotId = typeof input.screenshotId === 'string' ? input.screenshotId : null
    const speakers = Array.isArray(input.speakers)
      ? input.speakers.filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
      : []

    if (!sessionId || !presenterToken || !transcript) return jsonResponse({ message: '缺少語音合成所需資料。' }, 400)
    if (transcript.length > 4000) return jsonResponse({ message: '文字超過 4000 字，請分段轉換。' }, 400)

    const supabase = getAdminClient()
    const tokenHash = await hashPresenterToken(presenterToken)
    const { data: keyRecord } = await supabase
      .from('presenter_session_keys')
      .select('session_id')
      .eq('session_id', sessionId)
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (!keyRecord) return jsonResponse({ message: '講者權限驗證失敗。' }, 403)

    // Asking for the same words twice is the common case: a teacher tweaks a
    // question, not the passage. Returning the clip already paid for keeps the
    // second press of the button free.
    const hash = await contentHash(transcript, language, script, kind)
    const { data: existing } = await supabase
      .from('listening_clips')
      .select('*')
      .eq('session_id', sessionId)
      .eq('content_hash', hash)
      .maybeSingle()
    if (existing) return jsonResponse({ clip: existing, reused: true })

    const plan = buildVoicePlan(kind, language, script, speakers)
    const pcm = await synthesize(transcript, plan)
    const wav = wavFromPcm(pcm)
    if (wav.length > MAX_BYTES) {
      return jsonResponse({ message: '這段內容太長，語音超過 10MB。請分成兩段再轉換。' }, 413)
    }

    const storagePath = `${sessionId}/${hash}.wav`
    const { error: uploadError } = await supabase.storage
      .from('lingoact-listening')
      .upload(storagePath, wav, { contentType: 'audio/wav', upsert: true })
    if (uploadError) throw uploadError

    const { data: publicUrl } = supabase.storage.from('lingoact-listening').getPublicUrl(storagePath)

    const { data: clip, error: insertError } = await supabase
      .from('listening_clips')
      .insert({
        session_id: sessionId,
        screenshot_id: screenshotId,
        source: screenshotId ? 'screenshot' : 'text',
        kind,
        language,
        script,
        transcript,
        storage_path: storagePath,
        public_url: publicUrl.publicUrl,
        duration_ms: durationMs(pcm.length),
        voices: { instruction: plan.instruction, speakers: plan.speakers },
        content_hash: hash,
      })
      .select('*')
      .single()
    if (insertError) throw insertError

    return jsonResponse({ clip, reused: false })
  } catch (error) {
    console.error('synthesize-listening failed', error)
    return jsonResponse({ message: errorDetail(error, '語音合成失敗。') }, 502)
  }
})
