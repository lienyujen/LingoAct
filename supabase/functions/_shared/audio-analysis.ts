import { getAdminClient } from './supabase.ts'
import { geminiThinkingConfig, requestGemini } from './ai.ts'

const audioAnalysisCoreSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['pronunciation', 'oral_response'] },
    detected_language: { type: 'string' },
    transcript: { type: 'string' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    summary: { type: 'string' },
    relevance: { type: 'string' },
    clarity: { type: 'string' },
    completeness: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    improvements: { type: 'array', items: { type: 'string' } },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'mode', 'detected_language', 'transcript', 'score', 'summary', 'relevance',
    'clarity', 'completeness', 'strengths', 'improvements', 'limitations',
  ],
}

const audioAnalysisSchema = {
  ...audioAnalysisCoreSchema,
  properties: {
    ...audioAnalysisCoreSchema.properties,
    translations: {
      type: 'object',
      additionalProperties: false,
      properties: { en: audioAnalysisCoreSchema },
      required: ['en'],
    },
  },
  required: [...audioAnalysisCoreSchema.required, 'translations'],
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function extractText(data: Record<string, unknown>) {
  const candidates = Array.isArray(data.candidates) ? data.candidates : []
  const candidate = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined
  return candidate?.content?.parts?.map((part) => part.text || '').join('') || ''
}

// 注音 is stored as variation selectors sitting after each Han character, which
// is what makes the reading render inside the glyph. They mean nothing to a
// model reading the sentence, so the reference text is cleaned before it goes
// out — the question keeps them, because the class needs them to see the 注音.
const VARIATION_SELECTORS = /[\u{E0100}-\u{E01EF}︀-️]/gu

export async function analyzeAudioResponse(input: {
  mode: 'pronunciation' | 'oral_response'
  promptText: string | null
  learningFocus?: string | null
  // Absent for a read-aloud dispatched from 聽力播音室: the words are on the
  // question, and there is no slide behind them.
  screenshotUrl: string | null
  audioBytes: Uint8Array
  audioMimeType: string
}) {
  let imagePart: Record<string, unknown> | null = null
  if (input.screenshotUrl) {
    const imageResponse = await fetch(input.screenshotUrl)
    if (!imageResponse.ok) throw new Error(`Could not download screenshot (${imageResponse.status}).`)
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer())
    imagePart = {
      inlineData: {
        mimeType: imageResponse.headers.get('content-type') || 'image/png',
        data: bytesToBase64(imageBytes),
      },
    }
  }
  const reference = (input.promptText || '').replace(VARIATION_SELECTORS, '') || null

  // Two shapes of question reach this. One shows the class a slide and asks
  // them to read what is on it; the other puts the words on the question and
  // gives them a model recording to copy. Telling the model to read a screenshot
  // that was never sent is how it ends up reporting that it cannot tell what
  // should have been read.
  const source = imagePart ? '題目文字與截圖' : '題目文字'
  const modeInstruction = input.mode === 'pronunciation'
    ? `這是發音正確度評測。應朗讀的內容就是${source}所指定的文字，請以它為準，再自動辨識錄音語言，評估讀音、流暢度、漏讀、誤讀與可理解度。relevance 請描述錄音與指定朗讀內容的一致性，completeness 請描述是否完整朗讀。`
    : `這是口語回應評測。先從${source}判讀問題，再自動辨識錄音語言，評估回答與問題的關聯性、表達清楚度與內容完整度；不要把口音本身視為錯誤。`

  const response = await requestGemini(JSON.stringify({
      systemInstruction: {
        parts: [{
          text: `你是 LingoAct 的口語學習評測助理。請先使用繁體中文提供具體、尊重且可行的個別回饋，再於 translations.en 提供結構相同且忠實的英文翻譯；英文版不可另行評分或推論。${modeInstruction} transcript 必須忠實轉寫學員實際說出的內容。score 為 0 到 100 的整體表現分數。若音質不足、語音太短或無法辨識，請保守評分並在 limitations 說明，不可捏造內容。`,
        }],
      },
      contents: [{
        role: 'user',
        parts: [
          { text: JSON.stringify({ mode: input.mode, presenter_question: reference,
            feedback_focus: input.learningFocus ? 'Give feedback specifically on this teaching focus; it is not part of the text to read: ' + input.learningFocus : null }) },
          ...(imagePart ? [imagePart] : []),
          { inlineData: { mimeType: input.audioMimeType, data: bytesToBase64(input.audioBytes) } },
        ],
      }],
      generationConfig: {
        thinkingConfig: geminiThinkingConfig('realtime'),
        responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: audioAnalysisSchema } },
      },
    }), 'realtime', { primaryTimeoutMs: 25_000, fallbackTimeoutMs: 25_000 })
  const output = extractText(await response.json())
  if (!output) throw new Error('Gemini returned no audio analysis.')
  return JSON.parse(output)
}

export async function removeRecording(storagePath: string) {
  await getAdminClient().storage.from('lingoact-recordings').remove([storagePath])
}
