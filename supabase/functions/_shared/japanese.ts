// Classroom ranges are editorial teaching guidance, not official JLPT lists.
export const KANA_LEVELS = [
  { code: 'hiragana', label: '平假名', band: 0, maxStem: 24, ceiling: 'Practise hiragana recognition and readings. Use short, familiar words written only in hiragana. Do not introduce kanji or require katakana. Give one clear instruction at a time.' },
  { code: 'katakana', label: '片假名', band: 0, maxStem: 24, ceiling: 'Practise katakana recognition through familiar loanwords. Keep the target words in katakana; no kanji is required.' },
  { code: 'voicing', label: '清音與濁音', band: 0, maxStem: 28, ceiling: 'Practise kana contrasts involving dakuten and handakuten, such as か/が, は/ば/ぱ. Use short meaningful words, no kanji. Do not confuse this with pitch accent.' },
  { code: 'mora', label: '拗音與促音', band: 0, maxStem: 28, ceiling: 'Practise contracted sounds, small っ, long vowels and mora timing using short kana words and audio where available. Keep kanji out. Distinguish きゃ from きや and きて from きって.' },
  { code: 'mixed', label: '假名綜合練習', band: 0, maxStem: 32, ceiling: 'Combine hiragana and katakana in very short everyday expressions. Review voicing, contracted sounds, long vowels and small っ. No kanji or unintroduced complex grammar.' },
]
export const JF_LEVELS = [
  { code: 'A1', label: '入門・A1', band: 1, maxStem: 35, ceiling: 'Can exchange basic greetings, introduce oneself, and request a familiar item with short supported expressions. Use common beginner words, simple です/ます sentences and concrete situations.' },
  { code: 'A2', label: '初級・A2', band: 2, maxStem: 50, ceiling: 'Can manage routine shopping, ordering, directions, and simple arrangements. Use short linked sentences, familiar settings, simple reasons and requests. Scaffold unfamiliar kanji.' },
  { code: 'B1', label: '中級・B1', band: 3, maxStem: 75, ceiling: 'Can describe experiences, explain plans and reasons, and solve familiar travel or everyday problems. Use connected discourse and an achievable information-gap task.' },
  { code: 'B2', label: '中高級・B2', band: 4, maxStem: 100, ceiling: 'Can explain and defend viewpoints, compare alternatives and negotiate an outcome in a reasonably complex situation. Require evidence, reasons and appropriate interpersonal register.' },
  { code: 'C1', label: '高級・C1', band: 5, maxStem: 130, ceiling: 'Can handle complex academic, social and professional discourse, implied intentions and nuanced register. Keep the task focused and assess communicative success rather than ornate language.' },
  { code: 'C2', label: '精熟・C2', band: 6, maxStem: 160, ceiling: 'Can synthesize complex sources and communicate precise distinctions fluently and appropriately. Require a meaningful task and evidence. These are editorial summaries within the JF six-level framework, not copied official Can-do statements.' },
]

export const JAPANESE_GRAMMAR = [
  '助詞「は・が」', '助詞「を・に・で・へ」', '存在表現「あります・います」', 'です・ます体', '普通体',
  '名詞・形容詞の修飾', '動詞の活用', 'て形と接続', '過去・否定', '時と順序', '理由・原因',
  '希望・依頼・許可', '可能表現', '比較', '条件表現', '受身・使役', '授受表現', '敬語と場面', '文のつながり',
]

export const JAPANESE_TEACHING = [
  'Japanese teaching material stays in Japanese: passages, titles, questions, options, reference answers and task instructions. Separate explanations may use the selected guidance language. Preserve teacher-supplied and student-authored text verbatim unless rewriting was explicitly requested.',
  'Use teacher-supplied taught vocabulary, grammar, textbook unit and Can-do goal as the first constraint. Do not claim a proprietary textbook alignment or an official JLPT vocabulary/kanji/grammar list.',
  'JLPT N5–N1 describes a receptive examination target; do not infer speaking or writing certification or convert a grade into a fixed CEFR/JF level. Any vocabulary counts or grammar selections are editorial heuristics, not official cutoffs.',
  'Use です/ます by default for beginner narration. Follow an explicit teacher request for plain form or role-dependent register. In dialogue, keep each role and relationship consistent; do not add keigo merely because the level is higher.',
  'For speaking feedback, prioritize intelligibility, task completion and appropriate language. Discuss long vowels, small っ, ん and contracted sounds only when supported by audio. Do not invent precise pitch-accent scores or claim to have measured a Tokyo accent.',
  'For writing coaching, ask about missing content, particles, tense, conjugation or register; do not hand over a rewritten sentence. Preserve the student draft and let the student revise.',
].join('\n')

// pinyin is the legacy transport field; Japanese stores kana readings here so
// existing word-ruby displays and student permissions can be reused unchanged.
export const JAPANESE_READINGS = [
  'Segment the Japanese text into lexical spans. Return every span in order, including kana, punctuation and whitespace. Joining text fields must reproduce the exact original text without normalization or rewriting.',
  'The legacy field pinyin contains a HIRAGANA reading in this Japanese response, never Chinese pinyin or romaji. Add a reading only to a span containing kanji. Kana-only text, punctuation and whitespace have an empty reading.',
  'Choose readings in this exact context. Group 今日 as きょう and 大人 as おとな; never force one reading per kanji. Keep okurigana with the inflected word, e.g. 借りました / かりました. Preserve full-width letters, digits and Japanese character forms.',
].join('\n')

export function settleJapaneseWords(raw: unknown, text: string): { text: string; pinyin: string }[] {
  if (!Array.isArray(raw)) return []
  const words = raw.filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === 'object')).map(entry => ({
    text: typeof entry.text === 'string' ? entry.text : '',
    pinyin: typeof entry.pinyin === 'string' ? entry.pinyin.trim() : '',
  }))
  if (!words.length || words.some(word => !word.text) || words.map(word => word.text).join('') !== text) return []
  if (words.some(word => word.pinyin && (!/\p{Script=Han}/u.test(word.text) || !/^[\p{Script=Hiragana}ー・\s]+$/u.test(word.pinyin)))) return []
  return words
}

export function japaneseReadingTarget(framework: string | null, code: string | null, stretch: number) {
  const index = framework === 'kana' ? 0 : framework === 'jf' ? Math.max(1, JF_LEVELS.findIndex(level => level.code === code) + 1)
    : ({ N5: 1, N4: 2, N3: 3, N2: 4, N1: 5 }[code || 'N5'] || 1)
  const ranges = [[15, 60], [70, 160], [140, 280], [250, 450], [400, 700], [550, 900], [650, 1100]]
  const [min, max] = ranges[index] || ranges[1]
  return { min, max, instruction: stretch ? `i+${stretch}: keep the selected level. Add a small amount of context-supported unfamiliar vocabulary or a more demanding task; never advance an entire JLPT or JF level.` : 'Keep language load within the selected range.' }
}
