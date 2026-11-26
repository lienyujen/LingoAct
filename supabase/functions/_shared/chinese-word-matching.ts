export type ChineseWordLevel = (word: string, reading?: string) => number

export function chineseReadingKey(reading: string) {
  return reading.normalize('NFC').toLowerCase().replace(/[\s'’\-]/gu, '')
}

// Productive forms may be useful to explain as grammar without treating the
// whole form as a vocabulary entry. An exact entry always takes precedence.
function isChineseGrammarForm(word: string, lookup: ChineseWordLevel, reading = '') {
  return /^第[一二兩两三四五六七八九十百千萬万億亿零〇]+$/u.test(word)
    || word === '有人'
    || word === '好看' // TBCL 語法點「好／難 + V」
    || (word.endsWith('了') && (!reading || chineseReadingKey(reading).endsWith('le'))
      && (word === '了' || lookup(word.slice(0, -1)) > 0))
}

export function readingVocabularyLevel(word: string, reading: string, classLevel: number, lookup: ChineseWordLevel) {
  const level = lookup(word, reading)
  if (level) return level >= classLevel ? level : null
  return isChineseGrammarForm(word, lookup, reading) ? null : 0
}

// ICU or the pinyin tokenizer may split a listed word (e.g. 图书馆).
// Recover entries spanning whole adjacent segments, without matching
// individual characters at arbitrary offsets inside other words.
export function* matchChineseVocabulary(tokens: ReadonlyArray<{ text: string; pinyin?: string }>, lookup: ChineseWordLevel) {
  const isHan = /^\p{Script=Han}+$/u
  for (let at = 0; at < tokens.length; at += 1) {
    const { text: token, pinyin = '' } = tokens[at]
    if (!isHan.test(token)) continue
    let word = token
    let level = lookup(word, pinyin)
    let reading = pinyin
    let end = at
    let candidate = token
    for (let next = at + 1; next < tokens.length && candidate.length < 12; next += 1) {
      const part = tokens[next].text
      if (!isHan.test(part)) break
      candidate += part
      const candidateLevel = lookup(candidate)
      if (candidateLevel || (!level && isChineseGrammarForm(candidate, lookup))) {
        word = candidate
        level = candidateLevel
        reading = ''
        end = next
      }
    }
    if (level || !isChineseGrammarForm(word, lookup, reading)) yield { word, level }
    at = end
  }
}

export function chineseVocabularySegments(text: string, locale: string, lookup: ChineseWordLevel) {
  const tokens = [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)]
  return matchChineseVocabulary(tokens.map(({ segment }) => ({ text: segment })), lookup)
}
