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
import { levelInstruction, resolveLevel, tbclLevelOf } from './proficiency.ts'
import { trackInstruction } from './teaching.ts'

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
function grammarLevels(ceiling: number) {
  for (let floor = Math.max(1, ceiling - 1); floor >= 1; floor -= 1) {
    const levels: number[] = []
    for (let level = floor; level <= Math.min(7, ceiling + 1); level += 1) {
      if ((GRAMMAR_BY_LEVEL[level] || []).length) levels.push(level)
    }
    if (levels.length) return levels
  }
  return []
}

// Names only — the examples would triple the prompt and the model does not need
// them to recognise the pattern.
function grammarMenu(ceiling: number) {
  const points: string[] = []
  for (const level of grammarLevels(ceiling)) {
    for (const entry of GRAMMAR_BY_LEVEL[level] || []) points.push(`${entry.point}（第${level}級）`)
  }
  return points
}

function grammarIndex(ceiling: number) {
  const index = new Map<string, { level: number; example: string }>()
  for (const level of grammarLevels(ceiling)) {
    for (const entry of GRAMMAR_BY_LEVEL[level] || []) {
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

const passageSchema = (locales: string[]) => ({
  type: 'object',
  properties: {
    title: { type: 'string' },
    body: { type: 'string' },
    vocabulary: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          word: { type: 'string' },
          pos: { type: 'string' },
          gloss: glossSchema(locales),
        },
        required: ['word', 'pos', 'gloss'],
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
  required: ['title', 'body', 'vocabulary', 'grammar'],
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
  // Which languages the annotations are written in. zh-TW and en always, plus
  // whatever this class's students can choose.
  locales: string[]
}

export async function generateReadingPassage(input: ReadingInput): Promise<ReadingPassage | null> {
  const tbcl = tbclLevelOf(input.levelFramework, input.levelCode)
  const ceiling = tbcl ? ceilingFor(tbcl, input.levelStretch) : 0
  const resolved = resolveLevel(input.levelFramework, input.levelCode)
  const label = resolved?.level.label || '這個班的程度'
  const length = passageLength(tbcl || 4)
  const menu = grammarMenu(ceiling || 4)
  const index = grammarIndex(ceiling || 4)
  const locales = [...new Set(['zh_tw', 'en', ...input.locales])]

  const stretchNote = input.levelStretch > 0
    ? `The teacher has asked for i+${input.levelStretch}: a few words and structures up to ${input.levelStretch} level(s) above are wanted, because being stretched a little is how a reader grows. Keep them few, keep them carryable from context, and list every one of them in vocabulary.`
    : 'The teacher has NOT asked to stretch this class. Everything in the passage should be inside the level; list anything that unavoidably is not.'

  const instruction = [
    '你是 LingoAct 的閱讀教材編寫助理。根據教師提供的素材與方向，為這個班寫一篇他們讀得懂的短文，並標注出他們還沒學過的詞與語法點。',
    trackInstruction(input.teachingLanguage),
    levelInstruction(input.levelFramework, input.levelCode),
    stretchNote,
    `Length: between ${length.min} and ${length.max} characters. This is the range 華語文能力基準應用參考指引 and TOCFL use for reading at ${label}.`,
    'The passage must read as a whole piece — a notice, a message, a short account, a description — not a list of sentences that happen to use the target words.',
    input.image
      ? '附上的圖片就是教師提供的素材。如果圖片上是文字（課本頁面、投影片、公告），請把它當作要改寫的原文；如果圖片是照片或插圖，請把它當作這篇文章要描述或討論的對象。不要描述圖片的排版或畫質，只用它的內容。'
      : '',
    'vocabulary: every word in the passage that a learner at this level has NOT met, with its part of speech in Chinese (名詞、動詞、形容詞、副詞、量詞、連接詞…) and a short gloss in each requested language. A word the class already knows does not belong here; padding this list makes the colouring useless.',
    `grammar: the structures worth pointing out, each named EXACTLY as it appears in this list and not otherwise: ${menu.join('、')}.`,
    'For each grammar point give span: the exact stretch of the passage, copied character for character, where the pattern appears. If you cannot copy it exactly, leave the point out.',
    'Do not invent a grammar point that is not on the list, and do not attribute a pattern to a sentence that does not contain it.',
  ].join('\n')

  const ask = async (complaint = '') => {
    const result = await callAiJson(
      complaint ? `${instruction}\n\n${complaint}` : instruction,
      { source: input.source, direction: input.direction, languages: locales },
      passageSchema(locales),
      input.image || null,
      // A passage is longer and has to hold together, which is what the deeper
      // profile is for; a quiz item is a sentence and uses the realtime one.
      'deep',
    )
    return result.status === 'success' ? result.output as Record<string, unknown> : null
  }

  let output = await ask()
  if (!output) return null

  // The same loop the quiz generator uses, for the same reason.
  if (ceiling) {
    const above = overLevelWords(String(output.body || ''), ceiling)
    // Words the model itself listed as new are the point of the exercise; only
    // the ones it used without saying so are a failure.
    const declared = new Set(
      (Array.isArray(output.vocabulary) ? output.vocabulary : [])
        .map((entry) => String((entry as Record<string, unknown>).word || '')),
    )
    const undeclared = above.filter((entry) => !declared.has(entry.word))
    if (undeclared.length > 3) {
      console.warn(`Reading passage used ${undeclared.length} unlisted words above ${label}: ${undeclared.slice(0, 12).map((e) => e.word).join(' ')}`)
      const retried = await ask(overLevelComplaint(undeclared, label, ceiling))
      if (retried) {
        const stillAbove = overLevelWords(String(retried.body || ''), ceiling)
          .filter((entry) => !declared.has(entry.word))
        if (stillAbove.length < undeclared.length) output = retried
      }
    }
  }

  const body = String(output.body || '').trim()
  if (!body) return null

  return {
    title: String(output.title || '').trim(),
    body,
    vocabulary: (Array.isArray(output.vocabulary) ? output.vocabulary : [])
      .map((raw) => {
        const entry = raw as Record<string, unknown>
        const word = String(entry.word || '').trim()
        if (!word || !body.includes(word)) return null
        return {
          word,
          // The level 國教院 lists it at, or 0 when it is on no list — a name,
          // a loanword, a term the benchmark never covered.
          level: wordLevel(word),
          pos: String(entry.pos || '').trim(),
          gloss: (entry.gloss || {}) as ReadingAnnotationGloss,
        }
      })
      .filter((entry): entry is ReadingVocabulary => entry !== null),
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
