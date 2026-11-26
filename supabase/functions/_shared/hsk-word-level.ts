import { chineseReadingKey } from './chinese-word-matching.ts'
import { HSK_WORDS_BY_LEVEL, HSK_WORD_SENSES } from './hsk-word-levels.generated.ts'

let levels: Map<string, number> | undefined

export function hskWordLevel(word: string, reading = '') {
  const senses = reading && HSK_WORD_SENSES[word]
  if (Array.isArray(senses)) {
    const key = chineseReadingKey(reading)
    const level = senses.reduce((best, [pinyin, band]) => (
      chineseReadingKey(pinyin) === key ? Math.min(best, band) : best
    ), 8)
    if (level < 8) return level
  }
  levels ??= new Map(HSK_WORDS_BY_LEVEL.flatMap((words, index) => words.split(' ').map((entry) => [entry, index + 1])))
  return levels.get(word) || 0
}

export function hskLevelOf(framework: string | null | undefined, code: string | null | undefined) {
  if (framework !== 'hsk' || !code) return 0
  return code === '7-9' ? 7 : /^[1-6]$/.test(code) ? Number(code) : 0
}
