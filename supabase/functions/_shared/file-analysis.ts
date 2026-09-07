import { geminiThinkingConfig, requestGemini } from './ai.ts'

// Gemini reads these directly. Office formats (docx/pptx/xlsx) are deliberately
// absent: they would need conversion, and a confident-sounding analysis of bytes
// the model cannot actually read is worse than saying it was not analysed.
const analyzableMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
])

const analyzableExtensions = /\.(png|jpe?g|webp|heic|heif|pdf|txt|md|csv)$/i

export function isAnalyzableFile(mimeType: string, fileName: string) {
  return analyzableMimeTypes.has(mimeType.toLowerCase()) || analyzableExtensions.test(fileName)
}

const fileAnalysisSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect', 'unscored'] },
    score: { type: ['number', 'null'] },
    summary_zh_tw: { type: 'string' },
    summary_en: { type: 'string' },
    strengths_zh_tw: { type: 'array', items: { type: 'string' } },
    strengths_en: { type: 'array', items: { type: 'string' } },
    improvements_zh_tw: { type: 'array', items: { type: 'string' } },
    improvements_en: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'verdict', 'score',
    'summary_zh_tw', 'summary_en',
    'strengths_zh_tw', 'strengths_en',
    'improvements_zh_tw', 'improvements_en',
  ],
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function extractText(data: Record<string, unknown>) {
  const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates
  return candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''
}

// The question is usually a picture, not a sentence: a maths problem dispatched
// from a screenshot has its working, diagram and numbers on screen and nothing
// in prompt_text. Marking without it would be marking an answer to a question
// the model never saw, so the screenshot travels with every submission.
export async function analyzeFileResponse(input: {
  promptText: string | null
  // One student's submission, which may run to several photographed pages.
  files: Array<{ fileName: string; mimeType: string; fileBytes: Uint8Array }>
  questionImage?: { mimeType: string; bytes: Uint8Array } | null
  // 拍照描述: the description that came with the photograph, written or spoken.
  // Its presence changes what is being marked — the language, not the answer —
  // because the photograph is of a real thing and has no right or wrong.
  caption?: { text: string | null; audio: { mimeType: string; bytes: Uint8Array } | null } | null
  // Only meaningful alongside a caption: what the class is learning and how far
  // along it is, so the feedback lands at a level they can act on.
  classInstruction?: string
}) {
  const describing = Boolean(input.caption?.text || input.caption?.audio)
  const marking = Boolean(input.questionImage) || Boolean(input.promptText)
  const parts: Array<Record<string, unknown>> = [
    { text: JSON.stringify({
      presenter_question: input.promptText,
      file_names: input.files.map((file) => file.fileName),
      page_count: input.files.length,
      task: describing ? 'photo_description' : 'homework',
      written_caption: input.caption?.text || null,
    }) },
  ]
  if (input.questionImage) {
    parts.push({ text: '以下是教師派送的題目畫面：' })
    parts.push({ inlineData: { mimeType: input.questionImage.mimeType, data: bytesToBase64(input.questionImage.bytes) } })
  }
  parts.push({
    text: input.files.length > 1
      ? `以下是這位學生繳交的作答，共 ${input.files.length} 個檔案，屬於同一份作答，請合起來看：`
      : '以下是這位學生繳交的作答：',
  })
  for (const file of input.files) {
    if (input.files.length > 1) parts.push({ text: file.fileName })
    parts.push({ inlineData: { mimeType: file.mimeType, data: bytesToBase64(file.fileBytes) } })
  }
  if (input.caption?.audio) {
    parts.push({ text: '以下是這位學生對照片所錄的口說說明：' })
    parts.push({ inlineData: { mimeType: input.caption.audio.mimeType, data: bytesToBase64(input.caption.audio.bytes) } })
  }

  // 拍照描述 is marked on the language, not on the answer. The photograph is of
  // something real — a desk, a tree, a bus stop — so there is nothing to get
  // right or wrong about it, and a verdict of "incorrect" on someone's desk is
  // meaningless. What is worth saying is whether the description matches what
  // is in the picture and whether the language reaches for this class's level.
  const describingInstruction = [
    '這是語言課的「拍照描述」：學生拍下真實的東西，再用學習中的語言說明它。照片本身沒有對錯，要評的是語言。',
    '請先看照片，再讀（或聽）學生的說明，判斷：說明的內容跟照片相不相符、有沒有做到教師交代的事、用詞與句型是否清楚正確。',
    'verdict 用來表示說明的完成度：correct 說明清楚完整且與照片相符；partial 有做到但漏了要求的項目或語言上有影響理解的錯誤；incorrect 說明與照片不符或幾乎沒有描述；unscored 檔案或錄音無法判讀。',
    '若說明是錄音，transcript 不必輸出，但 summary 要說明你聽到的內容大意。發音口音本身不是錯誤。',
    'improvements 請給具體、能立刻改的語言建議（某個詞用錯、少了哪個成分、可以再加什麼細節），不要只說「可以更詳細」。',
    input.classInstruction || '',
  ].filter(Boolean).join('\n')

  const response = await requestGemini(JSON.stringify({
    systemInstruction: {
      parts: [{
        text: describing ? describingInstruction + '\n請以繁體中文給出具體、尊重且可行的個別回饋，再提供結構相同且忠實的英文版本；英文版是翻譯，不可另行推論。所有結論都要根據看得到、聽得到的內容，不可臆測。'
          : '你是 LingoAct 的作業批改助理。學員上傳了檔案回應教師的題目；若有多個檔案，那是同一份作答的不同頁或不同部分，請合併判讀後只給一份整體批改，不要逐頁分別評分。'
          + '若有題目畫面，請先讀懂題目再批改學生的作答；沒有題目畫面時，依 presenter_question 與檔案內容判斷。'
          + 'verdict 為整體判定：correct 完全正確、partial 部分正確或方向對但有錯、incorrect 明顯錯誤、'
          + 'unscored 為開放式題目（作文、心得、專題）或資訊不足以判定對錯。'
          + 'score 為 0 到 100 的整數；開放式題目仍可依完成度與品質評分，真的無法評分時填 null。'
          + '請以繁體中文給出具體、尊重且可行的個別回饋，再提供結構相同且忠實的英文版本；英文版是翻譯，不可另行推論。'
          + 'summary 說明學生答了什麼、對在哪裡或錯在哪一步；strengths 指出做得好的地方；improvements 提出可改進之處。'
          + '所有結論都要根據看得到的內容，不可臆測看不到的部分；字跡不清或檔案不完整時，請在 summary 誠實說明並以 unscored 處理，不可捏造。',
      }],
    },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      thinkingConfig: geminiThinkingConfig('realtime'),
      responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: fileAnalysisSchema } },
    },
  }), 'realtime', {
    primaryTimeoutMs: Math.min(60_000, (marking ? 45_000 : 40_000) + (input.files.length - 1) * 8_000),
    fallbackTimeoutMs: 28_000,
  })

  const output = extractText(await response.json())
  if (!output) throw new Error('Gemini returned no file analysis.')
  const parsed = JSON.parse(output)
  // Older deployments and open-ended work both come back without a usable mark;
  // normalising here keeps every reader from having to guess what null means.
  if (!['correct', 'partial', 'incorrect', 'unscored'].includes(parsed.verdict)) parsed.verdict = 'unscored'
  parsed.score = typeof parsed.score === 'number' && Number.isFinite(parsed.score)
    ? Math.max(0, Math.min(100, Math.round(parsed.score)))
    : null
  return parsed
}
