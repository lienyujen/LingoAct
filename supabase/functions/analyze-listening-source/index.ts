import { corsHeaders, errorDetail, geminiThinkingConfig, jsonResponse, requestGemini } from '../_shared/ai.ts'
import { levelInstruction, resolveLevel, tbclLevelOf } from '../_shared/proficiency.ts'
import { ceilingFor, overLevelComplaint, overLevelWords } from '../_shared/tbcl-check.ts'
import { getAdminClient, presenterAuthorized } from '../_shared/supabase.ts'
import { resolveTrack, trackInstruction } from '../_shared/teaching.ts'

// Reading the teacher's source and shaping it for this particular class.
//
// Synthesis is a separate call on purpose. Vision and speech together run close
// to the gateway's wall clock limit, and more importantly the teacher gets to
// correct the transcript first: a character the model misread would otherwise be
// broadcast to the whole class as the thing they are meant to be hearing.

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['passage', 'dialogue'] },
    language: { type: 'string' },
    script: { type: 'string', enum: ['traditional', 'simplified', 'none'] },
    speakers: { type: 'array', items: { type: 'string' } },
    speaker_genders: { type: 'array', items: { type: 'string', enum: ['male', 'female', 'boy', 'girl', 'unknown'] } },
    transcript: { type: 'string' },
  },
  required: ['kind', 'language', 'script', 'speakers', 'speaker_genders', 'transcript'],
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ message: 'Method not allowed.' }, 405)

  try {
    const input = await req.json()
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : ''
    const presenterToken = typeof input.presenterToken === 'string' ? input.presenterToken : ''
    const screenshotId = typeof input.screenshotId === 'string' ? input.screenshotId : ''
    const teachingTrack = typeof input.teachingTrack === 'string' ? input.teachingTrack : 'huayu'
    const requestedKind = input.requestedKind === 'dialogue' ? 'dialogue' : 'passage'
    const levelFramework = typeof input.levelFramework === 'string' ? input.levelFramework : null
    const levelCode = typeof input.levelCode === 'string' ? input.levelCode : null
    const track = resolveTrack(teachingTrack)
    const resolvedLevel = resolveLevel(levelFramework, levelCode)
    if (!sessionId || !screenshotId) return jsonResponse({ message: '缺少辨識所需資料。' }, 400)

    const supabase = getAdminClient()
    if (!await presenterAuthorized(supabase, input, sessionId, presenterToken)) {
      return jsonResponse({ message: '講者權限驗證失敗。' }, 403)
    }

    const { data: screenshot } = await supabase
      .from('screenshots')
      .select('public_url')
      .eq('id', screenshotId)
      .eq('session_id', sessionId)
      .maybeSingle()
    if (!screenshot?.public_url) return jsonResponse({ message: '找不到這張截圖。' }, 404)

    const imageResponse = await fetch(screenshot.public_url)
    if (!imageResponse.ok) return jsonResponse({ message: '無法讀取截圖檔案。' }, 502)
    const mimeType = imageResponse.headers.get('content-type') || 'image/png'
    const image = bytesToBase64(new Uint8Array(await imageResponse.arrayBuffer()))

    const instruction = [
      'You are preparing listening material for a language class.',
      trackInstruction(teachingTrack),
      levelInstruction(levelFramework, levelCode),
      'This is material the class will hear rather than read, which makes the level harder to hold, not easier: a listener cannot go back over a sentence that was too long or a word they have not met.',
      '',
      `The teacher chose ${requestedKind === 'dialogue' ? 'a dialogue' : 'a listening passage'}. Return exactly that kind; do not decide another format.`,
      'First read all useful information in the image, including printed text, labels, people, actions, objects and setting.',
      'Then turn that source into natural listening material in the language being taught, at the class level above. Preserve the source meaning and facts, but rewrite vocabulary, sentence length and organisation when needed for the learners.',
      requestedKind === 'dialogue'
        ? 'Write a natural two-speaker dialogue. Prefix every turn with a short speaker name and a colon. List the same two names in speakers, in first-speaking order. Return one speaker_genders entry per speaker: boy or girl for a clearly child role, male or female for a clearly adult role, and unknown when age or gender is ambiguous. Use names, titles, roles, and visible people as evidence; never guess from an ambiguous name.'
        : 'Write one coherent passage that sounds natural when read aloud. Keep speakers and speaker_genders empty.',
      'If the image mainly contains text, use OCR to recover its content before adapting it. If it mainly shows a visual situation, use only details actually visible in the image; do not invent unsupported facts.',
      '',
      'Report "language" as a lowercase code such as zh-tw, en, ja, ko, es, fr, de or vi.',
      'Report "script" as "traditional" or "simplified" for Chinese, and "none" for every other language.',
      `Set kind to "${requestedKind}" and language to "${track.language}".`,
    ].join('\n')

    const response = await requestGemini(
      JSON.stringify({
        systemInstruction: { parts: [{ text: instruction }] },
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: image } }] }],
        generationConfig: {
          thinkingConfig: geminiThinkingConfig('realtime'),
          responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } },
        },
      }),
      'realtime',
      { primaryTimeoutMs: 30_000, fallbackTimeoutMs: 25_000 },
    )
    const payload = await response.json()
    const raw = payload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || ''
    if (!raw) return jsonResponse({ message: 'AI 沒有回傳辨識結果。' }, 502)

    let result: { kind: string; language: string; script: string; speakers: string[]; speaker_genders: string[]; transcript: string }
    try {
      result = JSON.parse(raw)
    } catch {
      return jsonResponse({ message: 'AI 回傳的辨識結果無法解析。' }, 502)
    }

    let transcript = (result.transcript || '').trim()
    if (!transcript) return jsonResponse({ message: '這張截圖沒有可以朗讀的內容。' }, 422)

    // Checked against 國教院's published lists, not merely asked for — the same
    // loop the reading passage runs. Material students only hear is the case
    // where an unmet word does the most damage, because there is nothing on
    // screen to work it out from.
    const tbcl = tbclLevelOf(levelFramework, levelCode)
    const ceiling = tbcl ? ceilingFor(tbcl, 0) : 0
    if (ceiling && resolvedLevel) {
      const above = overLevelWords(transcript, ceiling)
      if (above.length > 3) {
        console.warn(`Listening material used ${above.length} words above ${resolvedLevel.level.label}: ${above.slice(0, 12).map((entry) => entry.word).join(' ')}`)
        try {
          const retryResponse = await requestGemini(
            JSON.stringify({
              systemInstruction: {
                parts: [
                  { text: instruction },
                  { text: overLevelComplaint(above, resolvedLevel.level.label, ceiling) },
                ],
              },
              contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: image } }] }],
              generationConfig: {
                thinkingConfig: geminiThinkingConfig('realtime'),
                responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema } },
              },
            }),
            'realtime',
            { primaryTimeoutMs: 30_000, fallbackTimeoutMs: 25_000 },
          )
          const retryPayload = await retryResponse.json()
          const retryRaw = retryPayload?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || ''
          const retried = retryRaw ? JSON.parse(retryRaw) as typeof result : null
          const retriedText = (retried?.transcript || '').trim()
          // Kept only if it is actually better. A retry that traded one set of
          // hard words for another is not worth the wait or the call.
          if (retriedText && overLevelWords(retriedText, ceiling).length < above.length) {
            transcript = retriedText
            result = retried as typeof result
          }
        } catch (retryError) {
          // The first transcript is still usable material; a failed second
          // attempt must not cost the teacher the first one.
          console.warn('listening level retry failed', retryError instanceof Error ? retryError.message : retryError)
        }
      }
    }

    return jsonResponse({
      kind: requestedKind,
      language: track.language,
      script: result.script === 'none' ? null : result.script,
      speakers: Array.isArray(result.speakers) ? result.speakers.filter((name) => typeof name === 'string') : [],
      speakerGenders: Array.isArray(result.speaker_genders)
        ? result.speaker_genders.map((gender) => ['male', 'female', 'boy', 'girl'].includes(gender) ? gender : 'unknown')
        : [],
      transcript: transcript.slice(0, 4000),
    })
  } catch (error) {
    console.error('analyze-listening-source failed', error)
    return jsonResponse({ message: errorDetail(error, '辨識截圖內容失敗。') }, 502)
  }
})
