export type ChineseWordLevel = (word: string, reading?: string) => number
export type ChineseWordPiece = { text: string; pinyin?: string }

export function chineseReadingKey(reading: string) {
  return reading.normalize('NFC').toLowerCase().replace(/[\s'’\-]/gu, '')
}

export function chineseWordKey(word: string) {
  return word.trim().normalize('NFKC').replace(/[\u200b\ufeff\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/gu, '')
}

const isHan = /^\p{Script=Han}+$/u

// Productive forms may be useful to explain as grammar without treating the
// whole form as a vocabulary entry. An exact entry always takes precedence.
function isChineseGrammarForm(word: string, lookup: ChineseWordLevel, reading = '') {
  return /^第[一二兩两三四五六七八九十百千萬万億亿零〇]+$/u.test(word)
    || word === '有人'
    || word === '好看' // TBCL 語法點「好／難 + V」
    || (word.endsWith('了') && (!reading || chineseReadingKey(reading).endsWith('le'))
      && (word === '了' || lookup(word.slice(0, -1)) > 0))
}

const segmenters = new Map<string, Intl.Segmenter>()
function segment(text: string, locale: string) {
  let segmenter = segmenters.get(locale)
  if (!segmenter) {
    segmenter = new Intl.Segmenter(locale, { granularity: 'word' })
    segmenters.set(locale, segmenter)
  }
  return [...segmenter.segment(text)]
}

// Pinyin generation and ICU can disagree on word boundaries. An official
// entry wins over either split. For an unlisted AI span, consult the independent
// tokenizer before treating a run of several words as a new vocabulary item.
export function* matchChineseVocabulary(tokens: ReadonlyArray<ChineseWordPiece>, lookup: ChineseWordLevel, locale = 'zh-TW') {
  let offset = 0
  const parts = tokens.flatMap((token) => {
    const at = offset
    offset += token.text.length
    const key = chineseWordKey(token.text)
    if (isHan.test(key) && (lookup(key) || isChineseGrammarForm(key, lookup, token.pinyin))) {
      return [{ ...token, at, key }]
    }
    const split = segment(token.text, locale)
    if (split.length < 2 && isHan.test(key)) return [{ ...token, at, key }]
    return split.map(({ segment: text, index }) => ({ text, at: at + index, key: chineseWordKey(text), pinyin: '' }))
  })

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index]
    if (!isHan.test(part.key) || /^\s|\s$/u.test(part.text)) continue
    let word = part.text
    let level = lookup(part.key, part.pinyin)
    let key = part.key
    let reading = part.pinyin
    let end = index
    let candidate = part.text
    for (let next = index + 1; next < parts.length && candidate.length < 20; next += 1) {
      const piece = parts[next]
      if (!isHan.test(piece.key) || /^\s|\s$/u.test(piece.text)) break
      candidate += piece.text
      const candidateKey = chineseWordKey(candidate)
      const candidateLevel = lookup(candidateKey)
      if (candidateLevel || (!level && isChineseGrammarForm(candidateKey, lookup))) {
        word = candidate
        key = candidateKey
        level = candidateLevel
        reading = ''
        end = next
      }
    }
    if (level || !isChineseGrammarForm(key, lookup, reading)) yield { word, level, at: part.at }
    index = end
  }
}

export function chineseVocabularySegments(text: string, locale: string, lookup: ChineseWordLevel, readings?: ReadonlyArray<ChineseWordPiece>) {
  const tokens = readings?.map(({ text }) => text).join('') === text
    ? readings
    : segment(text, locale).map(({ segment: text }) => ({ text }))
  return matchChineseVocabulary(tokens, lookup, locale)
}

// Older passages may predate the framework snapshot. Use the session's setting
// only when the passage has none of its own.
export function readingVocabularyContext<T extends { level_framework?: string | null; level_code?: string | null }>(
  passage: T,
  session: { level_framework?: string | null; level_code?: string | null } | null | undefined,
): T {
  if (passage.level_framework || !session?.level_framework) return passage
  return { ...passage, level_framework: session.level_framework, level_code: session.level_code }
}
