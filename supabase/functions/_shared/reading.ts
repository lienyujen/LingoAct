// 閱讀與測驗: a passage written for the class's own level, marked up with what
// they have not met yet.
//
// Two things are worth saying about how the level is held here, because both
// were learned the hard way on the quiz generator.
//
// First, the vocabulary is CHECKED, not asked for. overLevelWords reads the
// finished passage against 國教院's published lists and the offenders go back to
// the model by name. A passage is longer than a question stem, so this matters
// more, not less.
//
// Second, the grammar points are NAMED FROM THE PUBLISHED LIST. Asked to
// "explain the grammar" a model invents categories, labels the same pattern
// three different ways across one passage, and cheerfully attributes 把 to a
// sentence that has no 把 in it. It is given the points TBCL actually lists for
// this level and the ones just above, and anything it returns that is not on
// that list is dropped.
import { callAiJson } from './ai.ts'
import { GRAMMAR_BY_LEVEL } from './tbcl-levels.generated.ts'
import { ceilingFor, overLevelComplaint, overLevelWords } from './tbcl-check.ts'
import { wordLevel } from './tbcl-levels.generated.ts'
import { dispatchLevelCode, levelInstruction, resolveLevel, tbclLevelOf } from './proficiency.ts'
import { resolveTrack, trackInstruction } from './teaching.ts'
import { applyRegionalWordPinyin, regionalPronunciationInstruction } from './mandarin-pronunciation.ts'
import type { MandarinAccent } from './mandarin-pronunciation.ts'
import { HSK_GRAMMAR, applyHskWordPinyin, hskPinyinInstruction, hskLevelOf, hskWordLevel, hskOverLevelWords, hskOverLevelComplaint } from './hsk.ts'

export type ReadingAnnotationGloss = Record<string, string>

export type ReadingVocabulary = {
  word: string
  level: number
  pos: string
  gloss: ReadingAnnotationGloss
}

export type ReadingGrammar = {
  point: string
  level: number
  example: string
  span: string
  note: ReadingAnnotationGloss
}

export type ReadingPassage = {
  title: string
  body: string
  // The passage cut into words, each with its 正詞法 pinyin. One segmentation
  // serves both the 生詞 colouring and the readings, because both are decided
  // per word rather than per character.
  words: ReadingWord[]
  vocabulary: ReadingVocabulary[]
  grammar: ReadingGrammar[]
}

// Words per level, from 國教院's 華語文能力基準應用參考指引 and the length of the
// reading texts TOCFL actually sets at each band. A passage far under these is
// not a reading exercise, and one far over stops being one for a beginner.
const PASSAGE_LENGTH: Record<number, { min: number; max: number }> = {
  1: { min: 60, max: 120 },
  2: { min: 100, max: 180 },
  3: { min: 150, max: 250 },
  4: { min: 250, max: 400 },
  5: { min: 350, max: 600 },
  6: { min: 500, max: 800 },
  7: { min: 700, max: 1200 },
}

// The four things a reading question can actually ask for, in the terms
// Taiwanese reading assessment already uses. Named individually because
// "five questions about this passage" produced five of the first one: find the
// sentence, copy it back. That is the cheapest question to write and the least
// worth asking.
export const COMPREHENSION = {
  retrieve: {
    label: '擷取訊息',
    instruction: '擷取訊息：答案明明白白寫在文章裡，學生要能找到它。問時間、地點、人物、數量、順序、誰做了什麼。',
  },
  understand: {
    label: '理解文意',
    instruction: '理解文意：答案要跨句子合起來才看得出來，或需要從上下文推出一個詞、一個代名詞指的是什麼。不能只靠抄一句話回答。',
  },
  infer: {
    label: '邏輯推論',
    instruction: '邏輯推論：文章沒有直說，但從已寫的內容推得出來——原因、結果、動機、接下來可能發生什麼、作者為什麼這樣安排。答案必須有文章裡的根據，不能靠常識猜。',
  },
  evaluate: {
    label: '分析評鑑',
    instruction: '分析評鑑：請學生評估或判斷——這樣寫有什麼效果、哪個說法比較有道理、作者的立場是什麼、這段話適合放在哪裡、你同不同意為什麼。答案可以不只一種，但要說得出理由。',
  },
} as const

export type ComprehensionKey = keyof typeof COMPREHENSION

export function comprehensionInstruction(keys: string[], count: number) {
  const chosen = (keys.length ? keys : Object.keys(COMPREHENSION))
    .filter((key): key is ComprehensionKey => key in COMPREHENSION)
  if (!chosen.length) return ''
  const lines = chosen.map((key) => `- ${COMPREHENSION[key].instruction}`)
  const spread = chosen.length > 1
    ? `Spread the ${count} questions across these ${chosen.length} kinds rather than writing ${count} of the easiest one. If they do not divide evenly, put the extra on the harder kinds.`
    : `All ${count} questions are of this one kind.`
  return [
    '這一份閱讀測驗要測的是下列能力，每一題都要標定其中一種：',
    ...lines,
    spread,
    '不要出可以不看文章、光靠常識就答得出來的題目。',
  ].join('\n')
}

export function passageLength(tbcl: number) {
  return PASSAGE_LENGTH[tbcl] || PASSAGE_LENGTH[4]
}

// The levels worth annotating, which is not the same as every level the class
// has passed. Annotating 的 for a B1 reader is noise, and sending all 496 points
// to have most of them ignored costs a third of this call's input.
//
// Widened downwards when the window comes back empty: the grammar table stops
// at level 5, so a class at 6 or 7 asked for levels 5 to 8 and would have been
// handed nothing at all.
function grammarLevels(ceiling: number, table = GRAMMAR_BY_LEVEL) {
  for (let floor = Math.max(1, ceiling - 1); floor >= 1; floor -= 1) {
    const levels: number[] = []
    for (let level = floor; level <= Math.min(7, table === HSK_GRAMMAR ? ceiling : ceiling + 1); level += 1) {
      if ((table[level] || []).length) levels.push(level)
    }
    if (levels.length) return levels
  }
  return []
}

// Names only — the examples would triple the prompt and the model does not need
// them to recognise the pattern.
function grammarMenu(ceiling: number, table = GRAMMAR_BY_LEVEL) {
  const points: string[] = []
  for (const level of grammarLevels(ceiling, table)) {
    for (const entry of table[level] || []) points.push(`${entry.point}（第${level}級）`)
  }
  return points
}

function grammarIndex(ceiling: number, table = GRAMMAR_BY_LEVEL) {
  const index = new Map<string, { level: number; example: string }>()
  for (const level of grammarLevels(ceiling, table)) {
    for (const entry of table[level] || []) {
      if (!index.has(entry.point)) index.set(entry.point, { level, example: entry.example })
    }
  }
  return index
}

const glossSchema = (locales: string[]) => ({
  type: 'object',
  properties: Object.fromEntries(locales.map((locale) => [locale, { type: 'string' }])),
  required: locales,
  additionalProperties: false,
})

const passageSchema = () => ({
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          pinyin: { type: 'string' },
        },
        required: ['text', 'pinyin'],
        additionalProperties: false,
      },
    },
    // No note here. What a pattern does is the same sentence whatever passage
    // it turns up in, so it is written once into grammar_notes and looked up —
    // which takes the most expensive part of this response out of every
    // dispatch after the first, and stops one class being told something
    // slightly different from the next.
    grammar: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          point: { type: 'string' },
          span: { type: 'string' },
        },
        required: ['point', 'span'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'body', 'words', 'grammar'],
  additionalProperties: false,
})

export type ReadingInput = {
  // The teacher's own text, when they pasted one.
  source: string
  // A capture for the model to read for itself. Text on a slide becomes the
  // material; a photograph becomes what the passage is about. The model is told
  // which of those it is looking at rather than left to guess, because a
  // textbook page and a picture of a night market want different passages.
  image?: { mimeType: string; base64: string } | null
  direction: string
  teachingLanguage: string | null
  levelFramework: string | null
  levelCode: string | null
  levelStretch: number
  // The same selection drives the visible readings and any recording made
  // from the passage. Standard Guoyu and Taiwanese share MOE lexical readings;
  // their spoken cadence remains different in the TTS prompt.
  accent: MandarinAccent
  // Which languages the annotations are written in. zh-TW and en always, plus
  // whatever this class's students can choose.
  locales: string[]
}

export type ReadingWord = { text: string; pinyin: string }

// 正詞法, written once.
//
// A passage, a read-aloud sentence and a listening transcript are all Chinese
// text that has to be spelled as words rather than as syllables, and a learner
// who sees 星期六 as "xīng qí liù" in one place and "xīngqīliù" in another has
// been taught that the rule is arbitrary. `field` is only the name of the
// property holding the text in that particular schema.
export function orthographyRules(field: string) {
  return [
    `words: 把 ${field} 逐詞切開放進 words，順序與原文相同。所有 text 接起來必須和 ${field} 完全一樣，包含標點；標點自成一項，pinyin 留空字串。`,
    '每個詞的 pinyin 依《漢語拼音正詞法基本規則》(GB/T 16159) 書寫，不是逐字注音：',
    '一、一個 text 放一個詞，不是一個詞組。詞和詞之間要分開放，不可以併成一項。',
    '   「每天早上」是兩個詞：每天 (měitiān)、早上 (zǎoshang)，不可以寫成一項 měitiānzǎoshang。',
    '   「以後都」是兩個詞：以後 (yǐhòu)、都 (dōu)。一個 text 很少超過三個漢字，超過就要再想想是不是兩個詞。',
    '二、一個詞的內部連寫，不留空格：zīliàojiā（資料夾）、jīntiān（今天）、dǎkāi（打開）、shuāyá（刷牙）。',
    '三、專有名詞首字母大寫；人名姓與名分寫且各自大寫：Xiǎo Míng（小明）、Běijīng（北京）。一般句首大寫由系統處理。冒號後若是完整獨立句子或直接引語，第一個詞首字母也必須大寫；對話「王小姐：我喜歡這裡。」的我寫 Wǒ。冒號後只是列舉或解釋片語則保持小寫，例如「三種動物：狗、貓和兔子」的狗寫 gǒu；專有名詞仍保留大寫。',
    '四、動詞與賓語分寫（kàn xìn、chī fàn）；動詞與動態助詞連寫（kànzhe、kànle、kànguò）。',
    '五、數詞與量詞分寫（qī gè）；11 到 99 的整數連寫（shíwǔ）。',
    '六、結構助詞的、地、得分寫；語氣詞嗎、呢、吧分寫。',
    "七、a、o、e 開頭的音節接在別的音節後面時，前面加隔音符號：dàng'àn（檔案）、Xī'ān（西安）。",
    '八、聲調一律用調號標出，不用數字。阿拉伯數字與外文照原樣留在 text，pinyin 留空字串。',
  ]
}

// The segmentation has to be OF this text. Joining the pieces back together
// must give it again, or the readings would sit over the wrong words — better
// no pinyin than pinyin on the wrong syllables. Whitespace is excused because
// a model reflows line breaks and that changes nothing about the reading.
export function settleWords(raw: unknown, text: string): ReadingWord[] {
  const segmented = (Array.isArray(raw) ? raw : [])
    .map((entry) => {
      const word = entry as Record<string, unknown>
      return { text: String(word.text || ''), pinyin: String(word.pinyin || '').trim() }
    })
    .filter((entry) => entry.text)
  const rejoined = segmented.map((entry) => entry.text).join('')
  if (!segmented.length) return []
  if (rejoined.replace(/\s/g, '') !== text.replace(/\s/g, '')) {
    console.warn(`Word segmentation did not reassemble: ${rejoined.slice(0, 80)}`)
    return []
  }
  // Keep the passage's own whitespace so the reader can index these words
  // against its body, even when the model flattened paragraph breaks.
  const aligned: ReadingWord[] = []
  let cursor = 0
  for (const word of segmented) {
    const letters = [...word.text.replace(/\s/g, '')]
    if (!letters.length) continue
    const whitespaceStart = cursor
    while (cursor < text.length && /\s/u.test(text[cursor])) cursor += 1
    if (cursor > whitespaceStart) aligned.push({ text: text.slice(whitespaceStart, cursor), pinyin: '' })
    const start = cursor
    for (const letter of letters) {
      while (cursor < text.length && /\s/u.test(text[cursor])) cursor += 1
      cursor += letter.length
    }
    aligned.push({ text: text.slice(start, cursor), pinyin: word.pinyin })
  }
  if (cursor < text.length) aligned.push({ text: text.slice(cursor), pinyin: '' })
  return applyOrthography(aligned)
}

// 正詞法 rules a program can apply itself, applied after the model answers.
//
// Capitalising the first word of a sentence needs no Chinese at all: it needs
// to know where sentences end, which the punctuation says. Asking the model
// for it and hoping is how a whole passage came back in lower case. Anything
// deterministic is done here; the model is left with the part that genuinely
// needs to understand the language, which is where the words divide.
const SENTENCE_END = /[。．！!？?…]/

function applyOrthography(words: ReadingWord[]) {
  const text = words.map((word) => word.text).join('')
  const starts = new Set<number>()
  const labels = [...text.matchAll(/(?:^|\n)([^\n：:。！？!?]{1,24})[：:]/gu)]
    .map((match) => match[1].trim())
  const speakerTitle = /(?:先生|小姐|女士|老師|老师|同學|同学|學生|学生|醫師|医师|醫生|医生|教授)$/u
  const dialogue = labels.some((label) => speakerTitle.test(label)
    || (label.length <= 12 && labels.filter((other) => other === label).length > 1))
  // A dialogue label starts a new utterance, even when the previous label was
  // itself the first word of the sentence. A colon introducing a list does not.
  for (const match of text.matchAll(/[：:]/gu)) {
    const at = match.index as number
    const prefix = text.slice(0, at).split(/[\n。！？!?]/u).at(-1)?.trim() || ''
    const quoted = /^\s*[「“"『]/u.test(text.slice(at + 1))
    const speaker = speakerTitle.test(prefix) || (dialogue && prefix.length <= 12 && labels.includes(prefix))
    const reported = /(?:說|说|問|问|回答|答道|表示|喊道|寫道|写道)$/u.test(prefix)
    if (quoted || speaker || reported) starts.add(at + 1)
  }
  let atSentenceStart = true
  let offset = 0
  return words.map((word) => {
    const end = offset + word.text.length
    if (starts.has(offset)) atSentenceStart = true
    if (!word.pinyin) {
      // Punctuation carries no reading, but it does say where the next
      // sentence begins.
      if (SENTENCE_END.test(word.text) || [...starts].some((at) => at > offset && at <= end)) atSentenceStart = true
      offset = end
      return word
    }
    const pinyin = atSentenceStart
      ? word.pinyin.charAt(0).toLocaleUpperCase() + word.pinyin.slice(1)
      : word.pinyin
    atSentenceStart = SENTENCE_END.test(word.text)
    offset = end
    return { ...word, pinyin }
  })
}

// Segments that are almost certainly two words written as one.
//
// 國教院's list is not a complete dictionary — 每天 and 很多 are not on it —
// so "absent from the list" cannot mean "not a word". Length can: its entries
// are overwhelmingly one to three characters, and a four-character run that it
// does not list is nearly always a phrase. 每天早上 came back as one word
// spelled měitiānzǎoshang, which is exactly the shape this catches.
function overJoined(words: ReadingWord[]) {
  return words
    .filter((word) => /^[\p{Script=Han}]{4,}$/u.test(word.text) && !wordLevel(word.text))
    .map((word) => `${word.text}（${word.pinyin}）`)
}

// The words this class is learning, including its current level.
//
// 國教院's list decides, not the model. A word listed above the class is 超綱
// and keeps its level so the colour can say how far above; a word on no list
// at all is 0, which the reader draws on a pale green ground — a name, a
// loanword, a compound the benchmark never covered. 閱讀是讀詞不是讀字, so an
// unlisted word counts as new even when every character in it is easy: 資料夾
// is not 資料 + 夾 to someone meeting it for the first time.
export function newWords(words: ReadingWord[], classLevel: number, lookup = wordLevel) {
  const seen = new Set<string>()
  const out: Array<{ word: string; level: number }> = []
  for (const { text } of words) {
    const word = (text || '').trim()
    if (!word || seen.has(word) || !HAN_WORD.test(word)) continue
    const level = lookup(word)
    if (level && level < classLevel) continue
    seen.add(word)
    out.push({ word, level })
  }
  return out
}

const HAN_WORD = /^[\p{Script=Han}]+$/u

// What each new word means, asked for once the list is settled.
//
// A separate call because the list cannot exist until the passage does, and
// asking the model to both choose and explain is what produced a passage with
// one mark in it. This one only explains.
async function glossNewWords(
  entries: Array<{ word: string; level: number }>,
  locales: string[],
  languageName: string,
): Promise<ReadingVocabulary[]> {
  if (!entries.length) return []
  const result = await callAiJson(
    [
      `這些是一篇${languageName}短文裡學生還沒學過的詞。請只做兩件事：給詞類，並翻譯。`,
      '詞類用中文寫（名詞、動詞、形容詞、副詞、量詞、連接詞、代詞…）。',
      '翻譯要短，說出這個詞在這篇文章裡的意思，不要只換一個同義詞。',
      '不要增加或刪除任何詞，回傳的順序與輸入相同。',
    ].join('\n'),
    { words: entries.map((entry) => entry.word), languages: locales },
    {
      type: 'object',
      additionalProperties: false,
      required: ['words'],
      properties: {
        words: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['word', 'pos', 'gloss'],
            properties: { word: { type: 'string' }, pos: { type: 'string' }, gloss: glossSchema(locales) },
          },
        },
      },
    },
    null,
    'realtime',
  )

  const rows = result.status === 'success'
    ? ((result.output as { words?: unknown }).words as Array<Record<string, unknown>> | undefined) || []
    : []
  const byWord = new Map(rows.map((row) => [String(row.word || ''), row]))
  // A word the gloss call dropped is still a word the class has not met, so it
  // keeps its mark and its colour and simply has nothing to say when tapped.
  return entries.map(({ word, level }) => {
    const row = byWord.get(word)
    return {
      word,
      level,
      pos: String(row?.pos || '').trim(),
      gloss: (row?.gloss || {}) as ReadingAnnotationGloss,
    }
  })
}

export async function generateReadingPassage(input: ReadingInput): Promise<ReadingPassage | null> {
  input = { ...input, levelCode: dispatchLevelCode(input.levelFramework, input.levelCode, input.direction) }
  if (input.levelFramework === 'hsk' && !hskLevelOf(input.levelFramework, input.levelCode)) throw new Error('An HSK level is required for reading.')
  const hsk = input.levelFramework === 'hsk'
  const tbcl = hsk ? hskLevelOf(input.levelFramework, input.levelCode) : tbclLevelOf(input.levelFramework, input.levelCode)
  const checkWords = hsk ? hskOverLevelWords : overLevelWords
  const complaint = hsk ? hskOverLevelComplaint : overLevelComplaint
  const ceiling = tbcl ? ceilingFor(tbcl, input.levelStretch) : 0
  const resolved = resolveLevel(input.levelFramework, input.levelCode)
  const label = resolved?.level.label || '這個班的程度'
  const length = passageLength(tbcl || 4)
  const menu = grammarMenu(ceiling || 4, hsk ? HSK_GRAMMAR : GRAMMAR_BY_LEVEL)
  const index = grammarIndex(ceiling || 4, hsk ? HSK_GRAMMAR : GRAMMAR_BY_LEVEL)
  const locales = [...new Set([hsk ? 'zh_cn' : 'zh_tw', 'en', ...input.locales])]

  const stretchNote = input.levelStretch > 0
    ? `The teacher has asked for i+${input.levelStretch}: a few words and structures up to ${input.levelStretch} level(s) above are wanted, because being stretched a little is how a reader grows. Keep them few, keep them carryable from context, and list every one of them in vocabulary.`
    : 'The teacher has NOT asked to stretch this class. Everything in the passage should be inside the level; list anything that unavoidably is not.'

  const instruction = [
    '你是 LingoAct 的閱讀教材編寫助理。根據教師提供的素材與方向，為這個班寫一篇他們讀得懂的短文，並標注出他們還沒學過的詞與語法點。',
    trackInstruction(input.teachingLanguage),
    levelInstruction(input.levelFramework, input.levelCode),
    stretchNote,
    hsk ? `Length: between ${length.min} and ${length.max} characters, a classroom practice target rather than an official HSK exam limit.`
      : `Length: between ${length.min} and ${length.max} characters. This is the range 華語文能力基準應用參考指引 and TOCFL use for reading at ${label}.`,
    'The passage must read as a whole piece — a notice, a message, a short account, a description — not a list of sentences that happen to use the target words.',
    input.image
      ? '附上的圖片就是教師提供的素材。如果圖片上是文字（課本頁面、投影片、公告），請把它當作要改寫的原文；如果圖片是照片或插圖，請把它當作這篇文章要描述或討論的對象。不要描述圖片的排版或畫質，只用它的內容。'
      : '',
    hsk ? hskPinyinInstruction(`${input.source}\n${input.direction}`) : regionalPronunciationInstruction(`${input.source}\n${input.direction}`, input.accent),
    ...orthographyRules('body'),
    `grammar: the structures worth pointing out, each named EXACTLY as it appears in this list and not otherwise: ${menu.join('、')}.`,
    'For each grammar point give span: the exact stretch of the passage, copied character for character, where the pattern appears. If you cannot copy it exactly, leave the point out.',
    'Do not invent a grammar point that is not on the list, and do not attribute a pattern to a sentence that does not contain it.',
  ].join('\n')

  const ask = async (complaint = '') => {
    const result = await callAiJson(
      complaint ? `${instruction}\n\n${complaint}` : instruction,
      { source: input.source, direction: input.direction, languages: locales },
      passageSchema(),
      input.image || null,
      // A passage is longer and has to hold together, which is what the deeper
      // profile is for; a quiz item is a sentence and uses the realtime one.
      'deep',
    )
    return result.status === 'success' ? result.output as Record<string, unknown> : null
  }

  let output = await ask()
  if (!output) return null

  const TOO_MANY_ABOVE = 6
  const complaints: string[] = []
  if (ceiling) {
    const above = checkWords(String(output.body || ''), ceiling)
    if (above.length > TOO_MANY_ABOVE) {
      console.warn(`Reading passage used ${above.length} words above ${label}: ${above.slice(0, 12).map((e) => e.word).join(' ')}`)
      complaints.push(complaint(above, label, ceiling))
    }
  }
  const joined = overJoined((Array.isArray(output.words) ? output.words : []) as ReadingWord[])
  if (joined.length) {
    console.warn(`Reading segmentation ran words together: ${joined.slice(0, 8).join(' ')}`)
    complaints.push(`這幾項把兩個詞併成一個了：${joined.slice(0, 12).join('、')}。請照《漢語拼音正詞法基本規則》重新切開，例如 每天早上 要切成 每天 (měitiān) 和 早上 (zǎoshang)，以後都 要切成 以後 (yǐhòu) 和 都 (dōu)。`)
  }
  if (complaints.length) {
    const retried = await ask(complaints.join('\n'))
    if (retried && !overJoined((Array.isArray(retried.words) ? retried.words : []) as ReadingWord[]).length) output = retried
  }

  const body = String(output.body || '').trim()
  if (!body) return null

  // The segmentation has to be OF this passage, so it is checked the way the
  // sentence-ordering chunks are: joining the pieces must give the body back.
  // A list that does not reassemble would put the readings over the wrong
  // words and mark words the passage does not contain.
  const words = hsk ? applyHskWordPinyin(settleWords(output.words, body)) : applyRegionalWordPinyin(body, settleWords(output.words, body), input.accent)

  // 國教院's list decides which of them are new, and a second call says what
  // they mean. Without a usable segmentation there is nothing to judge, so the
  // passage goes out unmarked rather than marked wrongly.
  const vocabulary = await glossNewWords(
    newWords(words, tbcl || 4, hsk ? hskWordLevel : wordLevel),
    locales,
    resolveTrack(input.teachingLanguage).promptLanguage,
  )

  return {
    title: String(output.title || '').trim(),
    body,
    words,
    vocabulary,
    // Dropped unless the point is one TBCL actually lists and the span is
    // really in the passage: an annotation pointing at the wrong sentence is
    // worse than no annotation.
    grammar: (Array.isArray(output.grammar) ? output.grammar : [])
      .map((raw) => {
        const entry = raw as Record<string, unknown>
        const point = String(entry.point || '').replace(/（第[1-7]級）$/, '').trim()
        const span = String(entry.span || '').trim()
        const known = index.get(point)
        if (!known || !span || !body.includes(span)) return null
        // The note is filled in by the caller from grammar_notes.
        return { point, level: known.level, example: known.example, span, note: {} }
      })
      .filter((entry): entry is ReadingGrammar => entry !== null),
  }
}

// Notes for points this deployment has not explained yet. One call for all of
// them together, and only for the ones actually missing — so a class on its
// tenth passage almost never makes this call at all.
export async function writeMissingGrammarNotes(
  points: Array<{ point: string; level: number; example: string }>,
  locales: string[],
): Promise<Record<string, ReadingAnnotationGloss>> {
  if (!points.length) return {}
  const schema = {
    type: 'object',
    properties: {
      notes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            point: { type: 'string' },
            note: {
              type: 'object',
              properties: Object.fromEntries(locales.map((locale) => [locale, { type: 'string' }])),
              required: locales,
              additionalProperties: false,
            },
          },
          required: ['point', 'note'],
          additionalProperties: false,
        },
      },
    },
    required: ['notes'],
    additionalProperties: false,
  }

  const result = await callAiJson(
    [
      '你是華語文法說明助理。下面是臺灣華語文能力基準的語法點，每一個附了官方例句。',
      '請為每一個語法點寫一到兩句說明：這個句型在做什麼、什麼時候用。寫給學語言的人看，不是寫給語言學家看。',
      '用每一個要求的語言各寫一份，意思相同。不要重述例句，不要加上級別或術語。',
    ].join('\n'),
    { points, languages: locales },
    schema,
    null,
    'realtime',
  )
  if (result.status !== 'success') return {}
  const written = (result.output as { notes?: unknown }).notes
  if (!Array.isArray(written)) return {}
  return Object.fromEntries(
    written
      .map((raw) => {
        const entry = raw as Record<string, unknown>
        const point = String(entry.point || '').trim()
        return point ? [point, (entry.note || {}) as ReadingAnnotationGloss] as const : null
      })
      .filter((entry): entry is readonly [string, ReadingAnnotationGloss] => entry !== null),
  )
}
