import { callAiJson, geminiModels, geminiThinkingConfig, errorDetail } from './ai.ts'
import { getAdminClient } from './supabase.ts'
import { levelCeiling, stemLength, stemLengthComplaint } from './proficiency.ts'

type RequestedType = 'random' | 'multiple_choice' | 'fill_blank' | 'short_answer' | 'ordering' | 'matching' | 'writing' | 'flashcard'
type ItemType = Exclude<RequestedType, 'random' | 'writing' | 'flashcard'>

const flashcardTranslationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item_id: { type: 'string' },
          prompt_text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['item_id', 'prompt_text', 'options'],
      },
    },
  },
  required: ['items'],
}

export async function translateFlashcardItems(
  items: Array<{ id: string; prompt_text: string; options: string[]; prompt_is_word?: boolean }>,
  languageName: string,
) {
  const translated = new Map<string, { item_id?: string; prompt_text?: string; options?: string[] }>()
  for (let start = 0; start < items.length; start += 10) {
    const result = await callAiJson(
      `Translate the explanatory side of these vocabulary flashcards into ${languageName}. If prompt_is_word is true, keep prompt_text unchanged and translate every option. If it is false, translate prompt_text and keep every option unchanged. Preserve item_id, option count, option order, names, numbers, and meaning exactly. Return only the requested JSON.`,
      { items: items.slice(start, start + 10) },
      flashcardTranslationSchema,
      null,
      'realtime',
    )
    if (result.status !== 'success') throw new Error('Flashcard translation failed.')
    const batch = (result.output as { items?: Array<{ item_id?: string; prompt_text?: string; options?: string[] }> }).items || []
    for (const item of batch) if (typeof item.item_id === 'string') translated.set(item.item_id, item)
  }
  return translated
}

const itemTypes = new Set<ItemType>(['multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching'])

// Ordering items arrive from the model in the right order and must not reach the
// class that way: quiz_items.options is readable by students, while the answer
// key table is not. Shuffling here is what keeps the puzzle a puzzle.
//
// avoidIdentity is for 排序 and 配對, where the model's own order IS the answer
// and leaving it alone would put the answer on screen. A 選擇題 must NOT use it:
// the model's order is not the answer there, it merely tends to start with it,
// and forbidding the identity permutation would bias the answer away from the
// first slot instead of spreading it evenly.
function shuffledIndices(length: number, avoidIdentity = false) {
  const order = Array.from({ length }, (_, index) => index)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  if (!avoidIdentity) return order
  const unchanged = order.every((value, index) => value === index)
  if (unchanged && order.length > 1) [order[0], order[1]] = [order[1], order[0]]
  return order
}

const translatedFieldsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt_text: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    pair_prompts: { type: 'array', items: { type: 'string' } },
  },
  required: ['prompt_text', 'options', 'pair_prompts'],
}

function quizGenerationSchema(_flashcard: boolean) {
  return {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      // Ten, and not because ten is enough: Gemini rejects a responseFormat
      // schema whose maxItems is higher — 10 is accepted, 20 and 30 both come
      // back 400 INVALID_ARGUMENT. A deck larger than this is built by asking
      // again and appending, which is what 再出 N 張 does.
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          type: { type: 'string', enum: ['multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching'] },
          prompt_text: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          // 配對 only: the left-hand column. Every other type leaves it empty.
          pair_prompts: { type: 'array', items: { type: 'string' } },
          accepted_answers: { type: 'array', items: { type: 'string' } },
          // 單字卡 only, ignored on every other type: the word this card
          // teaches, exactly as it is written on the card. Which side it is on
          // is worked out by matching rather than declared — see below.
          target_word: { type: 'string' },
          rubric: { type: 'string' },
          translation_en: translatedFieldsSchema,
        },
        required: [
          'type', 'prompt_text', 'options', 'pair_prompts', 'accepted_answers', 'target_word', 'rubric', 'translation_en',
        ],
      },
    },
  },
  required: ['title', 'items'],
  }
}

const gradingSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evaluations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item_id: { type: 'string' },
          score: { type: 'number' },
          feedback_zh_tw: { type: 'string' },
          feedback_en: { type: 'string' },
        },
        required: ['item_id', 'score', 'feedback_zh_tw', 'feedback_en'],
      },
    },
    overall_feedback_zh_tw: { type: 'string' },
    overall_feedback_en: { type: 'string' },
  },
  required: ['evaluations', 'overall_feedback_zh_tw', 'overall_feedback_en'],
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

function extractGeminiText(response: Record<string, unknown>) {
  const candidates = Array.isArray(response.candidates) ? response.candidates : []
  const candidate = candidates[0] as { content?: { parts?: Array<{ text?: string }> } } | undefined
  return candidate?.content?.parts?.map((part) => part.text || '').join('') || ''
}

function cleanStrings(value: unknown, limit = 10) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => typeof item === 'string' ? item.trim() : '').filter(Boolean))].slice(0, limit)
}

// 單字卡: whether this card's prompt is the word itself rather than its gloss.
//
// Compared after stripping the quotation marks a model reaches for around a
// vocabulary item, so 「差異」 and 差異 are the same card. A prompt that merely
// CONTAINS the word — 「差異」的意思是什麼？ — is deliberately not a match: the
// reading belongs on the word, and annotating the question around it would put
// 注音 on 的意思是什麼 as well.
function promptIsTargetWord(promptText: string, targetWord: unknown) {
  if (typeof targetWord !== 'string') return false
  const bare = (value: string) => value.replace(/[「」『』（）()\s]/g, '')
  const word = bare(targetWord)
  return word.length > 0 && bare(promptText) === word
}

function normalizedAnswer(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/[\s.,，。！？!?、;；:'"「」『』（）()]/g, '')
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function retryDelay(attempt: number) {
  return 900 * (2 ** attempt) + Math.floor(Math.random() * 400)
}

function retryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500
}

async function requestQuizGeneration(
  apiKey: string,
  model: string,
  body: string,
  attempts: number,
  timeoutMilliseconds: number,
) {
  let failureMessage = 'network request failed'
  let failureStatus: number | null = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(timeoutMilliseconds),
      })
      if (response.ok) return { response, failureMessage: '', failureStatus: null }

      failureStatus = response.status
      failureMessage = (await response.text()).slice(0, 1000) || `request failed with status ${response.status}`
      if (!retryableStatus(response.status)) break
    } catch (error) {
      failureStatus = null
      failureMessage = error instanceof Error ? error.message : 'network request failed'
    }

    if (attempt < attempts - 1) await wait(retryDelay(attempt))
  }

  return { response: null, failureMessage, failureStatus }
}

export async function generateCustomQuiz(input: {
  // A screenshot or a file the teacher shared; both reach Gemini the same way.
  // A listening clip arrives as text instead: the class never sees the slide, so
  // the transcript is the only material the questions may be built from.
  sourceUrl?: string
  sourceText?: string
  direction: string
  requestedCount: number | null
  requestedType: RequestedType
  // Level expectations and the answer-leak rule, which vary by how far along the
  // learners are and so cannot be baked into the system instruction.
  extraInstruction?: string
  // The class's own language, named for the model. Settled when the session was
  // created, so the teacher does not have to say it in every 出題方向.
  teachingLanguage?: string
  // What the class is EXPLAINED in, named for the model. A 單字卡 gloss is for
  // understanding rather than for practising, so it goes in this and not in the
  // language being taught.
  guidanceLanguage?: string
  // The class's ladder, for the stem-length check after generation. Passing the
  // codes rather than the resolved ceiling keeps the level's own vocabulary at
  // the call site, where the session row is.
  levelFramework?: string | null
  levelCode?: string | null
}) {
  if (!input.sourceUrl && !input.sourceText) throw new Error('No quiz source was supplied.')
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const [model, fallbackModel] = geminiModels('realtime')
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.')

  let sourcePart: Record<string, unknown> | null = null
  if (input.sourceUrl) {
    const imageResponse = await fetch(input.sourceUrl)
    if (!imageResponse.ok) throw new Error(`Could not download the quiz source (${imageResponse.status}).`)
    const mimeType = imageResponse.headers.get('content-type') || 'image/png'
    sourcePart = { inlineData: { mimeType, data: bytesToBase64(new Uint8Array(await imageResponse.arrayBuffer())) } }
  }

  const countInstruction = input.requestedCount
    ? `必須產生恰好 ${input.requestedCount} 題。`
    : '題數由出題方向決定；若沒有指定，請依素材產生 5 題，最多 10 題。'
  const flashcard = input.requestedType === 'flashcard'
  const writing = input.requestedType === 'writing'
  // The class's language decides this, and the teacher's direction can still
  // override it — a 華語文 teacher does sometimes want an English gloss. Reading
  // it out of the direction text was the wrong way round: it made the default
  // "whatever the material happens to be in", so a Japanese class working from
  // a Chinese textbook page got Chinese questions.
  const requestedLanguage = /(?:英文|英語|english)/i.test(input.direction)
    ? 'English'
    : input.teachingLanguage || 'auto'
  // A vocabulary card is bilingual by nature and was being written in one
  // language: a TBCL 1 learner cannot read a Chinese definition of 差異, so the
  // three options came out harder than the word they were glossing.
  const guidanceName = input.guidanceLanguage || requestedLanguage
  const typeInstruction = flashcard
    ? [
        '這是單字卡練習，不是測驗。每一張卡片都必須是 multiple_choice，題幹只放要辨認的提示，選項放 3 到 4 個候選答案，accepted_answers 只放唯一正確的那一個。卡片之間互相獨立，不要互相參照；重點是能不能立刻反應出來，所以題幹要短，不要考長篇理解。',
        `一張卡片一定分成「詞彙」與「解釋」兩邊。詞彙是要學的那個詞，用 ${requestedLanguage} 寫；解釋是它的意思，用 ${guidanceName} 寫，讓學生看得懂。解釋要說出這個詞是什麼意思，不要只換一個同義詞。`,
        '方向由教師的出卡方向決定：看詞選解釋就把詞彙放題幹、三到四個解釋放選項；看解釋選詞就把解釋放題幹、三到四個詞彙放選項。',
        'target_word 一律填這張卡要學的那個詞（只填詞，不要填解釋、不要加標點或引號）。系統用它來判斷詞彙在哪一邊，並只在那一邊加標音。',
        '看詞選解釋時，題幹就只放那個詞本身，不要包成問句。「差異」比「「差異」的意思是什麼？」好：卡片本來就是在問意思，多出來的字只會被一起標上注音。',
        '不論方向，同一張卡的選項必須是同一類的東西——三個都是解釋，或三個都是詞彙——否則正確答案一眼就看得出來。',
      ].join('\n')
    : writing
    ? '這是寫作練習，不是測驗。每一題都必須是 short_answer，題幹是一個要學生動筆寫的欄位：寫清楚這一欄要寫什麼、大約多長、可以用到哪些詞語或句型。不要出有標準答案的題目，accepted_answers 與 rubric 一律留空。'
    : input.requestedType === 'random'
      ? '可依出題方向與素材混合使用選擇、填充與簡答題。'
      : `每一題都必須是 ${input.requestedType}。`
  const languageInstruction = requestedLanguage === 'auto'
    ? '題目、選項、答案與評分準則必須使用教師在出題方向中指定的語言；若未指定，使用出題方向與教材的主要語言。'
    : `本課程的教學語言是 ${requestedLanguage}；題目標題、題幹、選項、答案與評分準則都必須使用 ${requestedLanguage}，除非教師在出題方向中另外指定。`

  const requestPayload = {
    systemInstruction: {
      parts: [{
        text: `你是 LingoAct 的測驗設計助理。請根據教師提供的教材和出題方向建立適合課堂即時作答的測驗。${languageInstruction} translation_en 一律提供忠實自然的英文版本；若主文已是英文則保持相同意思。${countInstruction}${typeInstruction} 選擇題須有 2 至 6 個互不重複的選項，accepted_answers 只能包含正確選項原文。填充題請在題幹使用 ____ 標示作答處，accepted_answers 提供可接受答案與常見同義答案。簡答題提供參考答案於 accepted_answers，並在 rubric 寫出具體評分準則。排序題請把要重組的片段依「正確順序」放進 options（3 至 8 段，可以是詞語、句子或段落），accepted_answers 留空即可，系統會自動打亂後再呈現給學生；題幹寫清楚要學生依什麼邏輯排列。配對題請把左欄（要被配對的項目，3 至 6 個，例如生詞、圖說、人物）依序放進 pair_prompts，並把每個左欄項目對應的正確答案「依相同順序」放進 options；系統會打亂 options 後呈現。左右兩欄都不得重複，且每個右欄項目只對應一個左欄項目。不得捏造教材無法支持的專有事實；若教材資訊有限，應依教師的出題方向設計可合理回答的理解題。`,
      }],
    },
    contents: [{
      role: 'user',
      parts: [
        { text: JSON.stringify({ direction: input.direction, requested_count: input.requestedCount, requested_type: input.requestedType, requested_language: requestedLanguage }) },
        ...(sourcePart ? [sourcePart] : []),
        ...(input.sourceText ? [{ text: `教材原文如下：
${input.sourceText}` }] : []),
      ],
    }],
  }
  // The class's language and level belong in the system instruction, not beside
  // the material. As a user part they sat between the teacher's direction and
  // the textbook page and read as context; the material won, and a TBCL level 1
  // class got questions pitched at the page.
  if (input.extraInstruction) requestPayload.systemInstruction.parts.push({ text: input.extraInstruction })

  function requestBodyForModel(complaint = '') {
    // The current Generate Content API accepts JSON Schema through
    // responseFormat for both Gemini 3.x and Gemini 2.5. responseSchema is a
    // different, restricted schema dialect and rejects JSON Schema keywords.
    const generationConfig = {
      thinkingConfig: geminiThinkingConfig('realtime'),
      responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: quizGenerationSchema(flashcard) } },
    }
    const payload = complaint
      ? {
          ...requestPayload,
          contents: [{
            ...requestPayload.contents[0],
            parts: [...requestPayload.contents[0].parts, { text: complaint }],
          }],
        }
      : requestPayload
    return JSON.stringify({ ...payload, generationConfig })
  }

  async function generate(complaint = '') {
    const body = requestBodyForModel(complaint)
    let result = await requestQuizGeneration(apiKey!, model, body, 1, 12_000)
    if (!result.response && fallbackModel && fallbackModel !== model && (result.failureStatus === null || retryableStatus(result.failureStatus))) {
      console.warn(`Gemini quiz generation unavailable on ${model}; retrying with ${fallbackModel}.`)
      result = await requestQuizGeneration(apiKey!, fallbackModel, body, 1, 18_000)
    }
    if (!result.response) {
      const status = result.failureStatus ? ` (${result.failureStatus})` : ''
      throw new Error(`Gemini quiz generation failed${status}: ${result.failureMessage}`)
    }
    const text = extractGeminiText(await result.response.json())
    if (!text) throw new Error('Gemini returned no quiz.')
    return JSON.parse(text) as { title?: unknown; items?: unknown }
  }

  // The level ceiling is checked, not merely asked for. Told 「TBCL 第1級」 the
  // model returned 「都市化帶來了什麼好處？」 with 「經濟成長與生活便利」 among
  // the options: it knows the framework by name and drifts to the material's own
  // difficulty anyway. A stem far over the limit is the visible end of that
  // drift, so it earns one more attempt with the failure named.
  const ceiling = levelCeiling(input.levelFramework ?? null, input.levelCode ?? null)
  function overLength(candidate: { items?: unknown }) {
    if (!ceiling || !Array.isArray(candidate.items)) return []
    return candidate.items
      .map((raw, index) => {
        const promptText = (raw as Record<string, unknown>).prompt_text
        if (typeof promptText !== 'string') return null
        const length = stemLength(promptText, ceiling.unit)
        return length > ceiling.maxStem ? { index, length } : null
      })
      .filter((entry): entry is { index: number; length: number } => entry !== null)
  }

  let output = await generate()
  const offenders = overLength(output)
  if (offenders.length) {
    console.warn(`Quiz stems over the ${ceiling?.label} limit on the first attempt: ${offenders.map((o) => `#${o.index + 1}=${o.length}`).join(' ')}`)
    try {
      const retried = await generate(stemLengthComplaint(input.levelFramework ?? null, input.levelCode ?? null, offenders))
      // Kept only if it is actually better. A second attempt that comes back
      // worse is a worse quiz, not a fresher one.
      if (overLength(retried).length < offenders.length) output = retried
    } catch (error) {
      // The first attempt is a usable quiz; losing it over a length limit would
      // leave the class with nothing at all.
      console.warn(`Level retry failed, keeping the first attempt: ${errorDetail(error, 'unknown error')}`)
    }
  }
  if (!Array.isArray(output.items)) throw new Error('AI returned an invalid quiz item list.')
  if (output.items.length < 1 || output.items.length > 10) throw new Error('AI returned an unsupported question count.')
  if (input.requestedCount && output.items.length !== input.requestedCount) throw new Error('AI did not follow the requested question count.')

  const basePoints = Math.floor(100 / output.items.length)
  const remainder = 100 % output.items.length
  const items = output.items.map((raw, index) => {
    const item = raw as Record<string, unknown>
    const type = item.type as ItemType
    if (!itemTypes.has(type)) throw new Error(`AI returned an invalid type for item ${index + 1}.`)
    const effectiveType = writing ? 'short_answer' : flashcard ? 'multiple_choice' : input.requestedType
    if (effectiveType !== 'random' && type !== effectiveType) throw new Error('AI did not follow the requested question type.')
    const promptText = typeof item.prompt_text === 'string' ? item.prompt_text.trim().slice(0, 2000) : ''
    if (!promptText) throw new Error(`Item ${index + 1} has no prompt.`)
    // Ordering items carry more pieces than a multiple choice has options.
    const options = cleanStrings(item.options, type === 'ordering' ? 8 : 6)
    const pairPrompts = type === 'matching' ? cleanStrings(item.pair_prompts, 6) : []
    const acceptedAnswers = cleanStrings(item.accepted_answers, 12)
    if (type === 'multiple_choice') {
      if (options.length < 2) throw new Error(`Item ${index + 1} needs at least two options.`)
      if (!acceptedAnswers.length || acceptedAnswers.some((answer) => !options.includes(answer))) {
        throw new Error(`Item ${index + 1} has an invalid answer key.`)
      }
    }
    if (type === 'ordering' && options.length < 3) throw new Error(`Item ${index + 1} needs at least three fragments to order.`)
    if (type === 'matching') {
      if (pairPrompts.length < 3) throw new Error(`Item ${index + 1} needs at least three things to match.`)
      // One right-hand item per left-hand item, or the pairing is ambiguous and
      // the deterministic grading below would mark a defensible answer wrong.
      if (options.length !== pairPrompts.length) throw new Error(`Item ${index + 1} has mismatched columns.`)
    }
    if (type === 'fill_blank' && !acceptedAnswers.length) throw new Error(`Item ${index + 1} needs an accepted answer.`)
    const rawTranslations = { en: item.translation_en }
    // Every type with options gets them in a different order from the one the
    // model produced; what differs is why.
    //
    // 排序 and 配對: the order IS the answer, so the shuffled copy is what the
    // class sees and the original travels to the key table.
    //
    // 選擇題: the key is the option's own text, so reordering only moves the
    // answer on screen — and it has to be moved. The model puts the right
    // answer first almost every time, which turned a 單字卡 deck into "tap the
    // top one" and taught the class nothing about the words.
    //
    // The permutation is applied to the translation as well, or an English
    // reader would be reading options that no longer line up with the Chinese.
    const withOptions = type === 'multiple_choice' || type === 'ordering' || type === 'matching'
    const permutation = withOptions && options.length > 1
      ? shuffledIndices(options.length, type !== 'multiple_choice')
      : null
    const shownOptions = withOptions
      ? (permutation ? permutation.map((from) => options[from]) : options)
      : []
    const translations = Object.fromEntries(Object.entries(rawTranslations).map(([locale, raw]) => {
      const translation = (raw || {}) as Record<string, unknown>
      const translatedPrompt = typeof translation.prompt_text === 'string' ? translation.prompt_text.trim().slice(0, 2000) : ''
      const translatedOptions = cleanStrings(translation.options, 8)
      const translatedPairPrompts = cleanStrings(translation.pair_prompts, 6)
      const alignedOptions = translatedOptions.length === options.length ? translatedOptions : options
      return [locale, {
        prompt_text: translatedPrompt || promptText,
        options: withOptions
          ? (permutation ? permutation.map((from) => alignedOptions[from]) : alignedOptions)
          : [],
        pair_prompts: translatedPairPrompts.length === pairPrompts.length ? translatedPairPrompts : pairPrompts,
      }]
    }))

    return {
      id: crypto.randomUUID(),
      position: index + 1,
      type,
      // Only a 單字卡 has a word side; anything else leaves it false and the
      // annotation never looks at it.
      prompt_is_word: flashcard && promptIsTargetWord(promptText, item.target_word),
      prompt_text: promptText,
      options: shownOptions,
      pair_prompts: pairPrompts,
      points: basePoints + (index < remainder ? 1 : 0),
      translations,
      // The correct sequence — for 配對, the right-hand item for each left-hand
      // one in left-hand order — lives in the key table, which students cannot read.
      accepted_answers: type === 'ordering' || type === 'matching' ? options : acceptedAnswers,
      rubric: typeof item.rubric === 'string' ? item.rubric.trim().slice(0, 2000) : '',
    }
  })

  return {
    title: typeof output.title === 'string' && output.title.trim()
      ? output.title.trim().slice(0, 200)
      : requestedLanguage === 'English' ? 'AI Custom Quiz' : 'AI 自訂測驗',
    items,
  }
}

export async function gradeCustomQuizAttempt(attemptId: string) {
  const supabase = getAdminClient()
  try {
    const { data: attempt, error: attemptError } = await supabase.from('quiz_attempts').select('*').eq('id', attemptId).single()
    if (attemptError || !attempt) throw attemptError || new Error('Quiz attempt not found.')

    // 寫作教練 hands the writing straight back to the teacher. Marking it would
    // be the most expensive call this app makes, and it is not what was asked
    // for — so the attempt is simply complete, with no score to report.
    const { data: quiz, error: quizError } = await supabase.from('quizzes').select('graded, requested_type').eq('id', attempt.quiz_id).single()
    if (quizError || !quiz) throw quizError || new Error('Quiz not found.')
    if (quiz.graded === false) {
      if (quiz.requested_type === 'picture_writing') {
        const { data: items, error: itemError } = await supabase.from('quiz_items').select('id, points').eq('quiz_id', attempt.quiz_id)
        if (itemError || !items?.length) throw itemError || new Error('Quiz items are unavailable.')
        for (const item of items) {
          const { error } = await supabase.from('quiz_item_answers').update({
            score: item.points,
            feedback: { zh_tw: '已完成排序寫作。', en: 'Sequence writing completed.' },
          }).eq('attempt_id', attemptId).eq('item_id', item.id)
          if (error) throw error
        }
        const totalScore = items.reduce((sum, item) => sum + Number(item.points || 0), 0)
        const { error: completeError } = await supabase.from('quiz_attempts').update({
          status: 'graded', total_score: totalScore,
          feedback: { zh_tw: '已完成繳交。', en: 'Submission completed.' },
          error_message: null, graded_at: new Date().toISOString(),
        }).eq('id', attemptId)
        if (completeError) throw completeError
        await supabase.from('answers').update({ answer_text: '[排序寫作已完成]' })
          .eq('question_id', attempt.question_id).eq('participant_id', attempt.participant_id)
        return
      }
      const { error: submitError } = await supabase.from('quiz_attempts').update({
        status: 'submitted',
        total_score: null,
        error_message: null,
        graded_at: new Date().toISOString(),
      }).eq('id', attemptId)
      if (submitError) throw submitError
      await supabase.from('answers').update({ answer_text: '[寫作已送出]' })
        .eq('question_id', attempt.question_id).eq('participant_id', attempt.participant_id)
      return
    }
    const [{ data: items, error: itemError }, { data: answers, error: answerError }] = await Promise.all([
      supabase.from('quiz_items').select('*').eq('quiz_id', attempt.quiz_id).order('position'),
      supabase.from('quiz_item_answers').select('*').eq('attempt_id', attemptId),
    ])
    if (itemError || answerError || !items?.length) throw itemError || answerError || new Error('Quiz items are unavailable.')
    const itemIds = items.map((item) => item.id)
    const { data: keys, error: keyError } = await supabase.from('quiz_item_keys').select('*').in('item_id', itemIds)
    if (keyError || keys?.length !== items.length) throw keyError || new Error('Quiz keys are incomplete.')

    const keyByItem = new Map((keys || []).map((key) => [key.item_id, key]))
    const answerByItem = new Map((answers || []).map((answer) => [answer.item_id, answer]))
    const pictureWriting = quiz.requested_type === 'picture_writing'
    const gradingInput = items.map((item) => {
      const key = keyByItem.get(item.id)
      const answer = answerByItem.get(item.id)
      return {
        item_id: item.id,
        type: item.type,
        prompt_text: item.prompt_text,
        options: item.options,
        points: item.points,
        accepted_answers: key?.accepted_answers || [],
        rubric: key?.rubric || '',
        submitted_answer: pictureWriting ? answer?.answer_text || '' : answer?.answer_values?.length ? answer.answer_values : answer?.answer_text || '',
      }
    })

    const aiGradingInput = gradingInput.filter((item) => pictureWriting || !['multiple_choice', 'ordering', 'matching'].includes(item.type))
    let output: {
      evaluations?: Array<{ item_id?: string; score?: number; feedback_zh_tw?: string; feedback_en?: string }>
      overall_feedback_zh_tw?: string
      overall_feedback_en?: string
    } = { evaluations: [] }
    if (aiGradingInput.length) {
      const result = await callAiJson(
        pictureWriting
          ? '你是 LingoAct 的形成性寫作評分助理。學生自行決定四格圖片順序，沒有標準順序，不得因順序與原圖不同扣分。依每格文字能否形成完整連貫的故事、內容發展與語言表達，按 rubric 與配分評分。每題分數不得小於 0 或超過 points。以台灣繁體中文提供簡潔、具體且鼓勵性的回饋，並提供忠實英文翻譯。'
          : '你是 LingoAct 的形成性評量評分助理。依每題配分、參考答案與 rubric 評分。填充題接受語意相同且沒有概念錯誤的答案；簡答題依 rubric 給部分分。每題分數不得小於 0 或超過該題 points。以台灣繁體中文提供簡潔、具體且鼓勵性的回饋，並提供忠實英文翻譯。不得因文法或用字風格與參考答案不同而扣除內容正確答案的分數。',
        { items: aiGradingInput },
        gradingSchema,
        null,
        'realtime',
      )
      if (result.status !== 'success') throw new Error(String((result.output as { message?: string }).message || 'AI grading failed.'))
      output = result.output as typeof output
    }
    const evaluationByItem = new Map((output.evaluations || []).map((evaluation) => [evaluation.item_id, evaluation]))
    let totalScore = 0

    for (const item of items) {
      const answer = answerByItem.get(item.id)
      const key = keyByItem.get(item.id)
      if (!answer || !key) throw new Error('Quiz answer data is incomplete.')
      const evaluation = evaluationByItem.get(item.id)
      let score = 0
      let feedbackZhTw = ''
      let feedbackEn = ''
      if (item.type === 'matching') {
        // Position by position: answer_values holds the student's choice for
        // each left-hand item, in the order the left column was shown.
        const expected = key.accepted_answers || []
        const submitted = answer.answer_values || []
        let correctPairs = 0
        for (let at = 0; at < expected.length; at += 1) {
          if (submitted[at] === expected[at]) correctPairs += 1
        }
        // Part marks, because getting four of five pairs right is not the same
        // as getting none, and a vocabulary drill should show that difference.
        score = expected.length ? Math.round((item.points * correctPairs) / expected.length * 100) / 100 : 0
        feedbackZhTw = correctPairs === expected.length
          ? '全部配對正確。'
          : `配對正確 ${correctPairs}/${expected.length} 組。`
        feedbackEn = correctPairs === expected.length
          ? 'All pairs matched correctly.'
          : `${correctPairs} of ${expected.length} pairs matched.`
      } else if (item.type === 'ordering' && pictureWriting) {
        if (!evaluation) throw new Error('AI grading result is incomplete.')
        score = Math.max(0, Math.min(item.points, Number(evaluation.score) || 0))
        feedbackZhTw = String(evaluation.feedback_zh_tw || '')
        feedbackEn = String(evaluation.feedback_en || '')
      } else if (item.type === 'ordering') {
        // Order is the whole answer, so this compares sequences rather than sets.
        const expected = key.accepted_answers || []
        const submitted = answer.answer_values || []
        const correct = expected.length === submitted.length && expected.every((value: string, at: number) => value === submitted[at])
        score = correct ? item.points : 0
        // 圖片排序 has nothing readable to name the panels by — the values are
        // opaque ids precisely so that a student reading them learns nothing —
        // so the wrong-order feedback says only that, and the teacher shows the
        // sequence as pictures.
        const pictures = Array.isArray(item.option_images) && item.option_images.length > 0
        feedbackZhTw = correct ? '順序正確。' : pictures ? '順序不對。' : `順序不對，正確順序：${expected.join(' → ')}`
        feedbackEn = correct ? 'Correct order.' : pictures ? 'Wrong order.' : `Wrong order. Correct sequence: ${expected.join(' → ')}`
      } else if (item.type === 'multiple_choice') {
        const expected = [...new Set(key.accepted_answers || [])].sort()
        const submitted = [...new Set(answer.answer_values || [])].sort()
        const correct = expected.length === submitted.length && expected.every((value, index) => value === submitted[index])
        score = correct ? item.points : 0
        feedbackZhTw = correct ? '回答正確。' : `回答錯誤，正確答案：${expected.join('、')}`
        feedbackEn = correct ? 'Correct.' : `Incorrect. Correct answer: ${expected.join(', ')}`
      } else {
        if (!evaluation) throw new Error('AI grading result is incomplete.')
        score = Math.max(0, Math.min(item.points, Number(evaluation.score) || 0))
        feedbackZhTw = String(evaluation.feedback_zh_tw || '')
        feedbackEn = String(evaluation.feedback_en || '')
      }
      if (item.type === 'fill_blank') {
        const submitted = normalizedAnswer(answer.answer_text || '')
        if ((key.accepted_answers || []).some((value: string) => normalizedAnswer(value) === submitted)) score = item.points
      }
      score = Math.round(score * 100) / 100
      totalScore += score
      const { error } = await supabase.from('quiz_item_answers').update({
        score,
        feedback: {
          zh_tw: feedbackZhTw,
          en: feedbackEn,
        },
      }).eq('id', answer.id)
      if (error) throw error
    }

    totalScore = Math.round(totalScore * 100) / 100
    const overallFeedbackZhTw = aiGradingInput.length
      ? String(output.overall_feedback_zh_tw || '')
      : `本次自動評分 ${totalScore}/100。`
    const overallFeedbackEn = aiGradingInput.length
      ? String(output.overall_feedback_en || '')
      : `Auto-marked score: ${totalScore}/100.`
    const { error: updateError } = await supabase.from('quiz_attempts').update({
      status: 'graded',
      total_score: totalScore,
      feedback: {
        zh_tw: overallFeedbackZhTw,
        en: overallFeedbackEn,
      },
      error_message: null,
      graded_at: new Date().toISOString(),
    }).eq('id', attemptId)
    if (updateError) throw updateError
    await supabase.from('answers').update({ answer_text: '[自訂測驗評分完成]' })
      .eq('question_id', attempt.question_id).eq('participant_id', attempt.participant_id)
  } catch (error) {
    const detail = errorDetail(error, 'AI grading failed.')
    console.error('custom quiz grading failed', detail)
    const supabase = getAdminClient()
    const { data: attempt } = await supabase.from('quiz_attempts').select('question_id, participant_id').eq('id', attemptId).maybeSingle()
    await supabase.from('quiz_attempts').update({
      status: 'failed',
      error_message: detail.slice(0, 1000),
      graded_at: new Date().toISOString(),
    }).eq('id', attemptId)
    if (attempt) {
      await supabase.from('answers').update({ answer_text: '[自訂測驗評分失敗]' })
        .eq('question_id', attempt.question_id).eq('participant_id', attempt.participant_id)
    }
  }
}
