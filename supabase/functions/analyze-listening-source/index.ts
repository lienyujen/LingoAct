import { corsHeaders, errorDetail, geminiThinkingConfig, jsonResponse, requestGemini } from '../_shared/ai.ts'
import { getAdminClient, hashPresenterToken } from '../_shared/supabase.ts'

// Reading the teacher's slide, and stopping there.
//
// Synthesis is a separate call on purpose. Vision and speech together run close
// to the gateway's wall clock limit, and more importantly the teacher gets to
// correct the transcript first: a character the model misread would otherwise be
// broadcast to the whole class as the thing they are meant to be hearing.

const schema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', enum: ['passage', 'dialogue', 'scene'] },
    language: { type: 'string' },
    script: { type: 'string', enum: ['traditional', 'simplified', 'none'] },
    speakers: { type: 'array', items: { type: 'string' } },
    transcript: { type: 'string' },
  },
  required: ['kind', 'language', 'script', 'speakers', 'transcript'],
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
    const teachingLanguage = typeof input.teachingLanguage === 'string' ? input.teachingLanguage : 'zh-tw'
    if (!sessionId || !presenterToken || !screenshotId) return jsonResponse({ message: '缺少辨識所需資料。' }, 400)

    const supabase = getAdminClient()
    const tokenHash = await hashPresenterToken(presenterToken)
    const { data: keyRecord } = await supabase
      .from('presenter_session_keys')
      .select('session_id')
      .eq('session_id', sessionId)
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (!keyRecord) return jsonResponse({ message: '講者權限驗證失敗。' }, 403)

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
      `The class is being taught in the language with code "${teachingLanguage}".`,
      '',
      'Look at the image and decide what it is:',
      '- "dialogue" when it shows a conversation between two or more people. List the speaker names in the order they first speak, and write the transcript with each line prefixed by that speaker name and a colon.',
      '- "passage" when it is continuous prose, a reading text, or a list of sentences. Transcribe it as it stands.',
      '- "scene" when it is a picture, photograph, diagram or chart rather than text meant to be read aloud. Do not transcribe labels; instead write what a teacher would say to introduce this image to the class, in the language being taught, in three to six sentences.',
      '',
      'Report "language" as a lowercase code such as zh-tw, en, ja, ko, es, fr, de or vi.',
      'Report "script" as "traditional" or "simplified" for Chinese, and "none" for every other language.',
      'Transcribe exactly what is written, including punctuation. Do not translate, summarise, correct or add anything.',
      'Leave "speakers" empty unless kind is "dialogue".',
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

    let result: { kind: string; language: string; script: string; speakers: string[]; transcript: string }
    try {
      result = JSON.parse(raw)
    } catch {
      return jsonResponse({ message: 'AI 回傳的辨識結果無法解析。' }, 502)
    }

    const transcript = (result.transcript || '').trim()
    if (!transcript) return jsonResponse({ message: '這張截圖沒有可以朗讀的內容。' }, 422)

    return jsonResponse({
      kind: result.kind,
      language: (result.language || teachingLanguage).toLowerCase(),
      script: result.script === 'none' ? null : result.script,
      speakers: Array.isArray(result.speakers) ? result.speakers.filter((name) => typeof name === 'string') : [],
      transcript: transcript.slice(0, 4000),
    })
  } catch (error) {
    console.error('analyze-listening-source failed', error)
    return jsonResponse({ message: errorDetail(error, '辨識截圖內容失敗。') }, 502)
  }
})
