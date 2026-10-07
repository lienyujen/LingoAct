import { HSK_SYLLABUS } from './hsk-syllabus.generated.ts'
import type { OverLevelWord } from './tbcl-check.ts'

const levels = new Map<string, number>()
const pronunciations = new Map<string, Set<string>>()
for (const entry of HSK_SYLLABUS.vocabulary) {
  levels.set(entry.word, Math.min(levels.get(entry.word) || 8, entry.level))
  if (/^[A-Za-z\u00C0-\u024F\u1E00-\u1EFF'’\s-]+$/u.test(entry.pinyin)) {
    if (!pronunciations.has(entry.word)) pronunciations.set(entry.word, new Set())
    pronunciations.get(entry.word)!.add(entry.pinyin)
  }
}
// Only unambiguous entries are fixed. Homographs retain the contextual reading.
export function applyHskWordPinyin<T extends { text: string; pinyin: string }>(words: T[]): T[] {
  return words.map((word) => {
    const readings = pronunciations.get(word.text)
    if (readings?.size !== 1) return word
    let pinyin = [...readings][0]
    if (/^\p{Lu}/u.test(word.pinyin)) pinyin = pinyin[0].toUpperCase() + pinyin.slice(1)
    return { ...word, pinyin }
  })
}
export function hskPinyinInstruction(text: string) {
  const entries = [...pronunciations].filter(([word]) => text.includes(word))
    .sort((a, b) => b[0].length - a[0].length).slice(0, 128)
  return [HSK_PRONUNCIATION, 'Reference readings from the official HSK syllabus (for multiple readings choose by context):',
    entries.map(([word, readings]) => `${word}: ${[...readings].join(' / ')}`).join('; ')].join('\n')
}
export function hskWordLevel(word: string) { return levels.get(word) || 0 }
export function hskLevelOf(framework: string | null | undefined, code: string | null | undefined) {
  if (framework !== 'hsk' || !code) return 0
  return code === '7-9' ? 7 : /^[1-6]$/.test(code) ? Number(code) : 0
}
export const HSK_PRONUNCIATION = 'Use standard Mainland Putonghua pronunciations and Hanyu Pinyin orthography. Use contextual readings for polyphonic characters. Do not use Taiwan pronunciation or cross-strait vocabulary substitutions. Keep the original text unchanged.'
export const HSK_GRAMMAR: Record<number, { point: string; example: string }[]> = {}
for (const entry of HSK_SYLLABUS.grammar) {
  (HSK_GRAMMAR[entry.level] ||= []).push({ point: entry.point, example: entry.pattern })
}
export function hskOverLevelWords(text: string, ceiling: number): OverLevelWord[] {
  if (!text || ceiling <= 0) return []
  const result = new Map<string, number>()
  for (const entry of new Intl.Segmenter('zh-CN', { granularity: 'word' }).segment(text)) {
    const word = entry.segment
    if (!entry.isWordLike || !/^[\p{Script=Han}]+$/u.test(word)) continue
    const listed = hskWordLevel(word)
    if (listed) {
      if (listed > ceiling) result.set(word, listed)
      continue
    }
    const hardest = Math.max(...[...word].map((character) => HSK_SYLLABUS.characters[character as keyof typeof HSK_SYLLABUS.characters] || 8))
    if (hardest > ceiling) result.set(word, hardest === 8 ? 0 : hardest)
  }
  return [...result].map(([word, level]) => ({ word, level })).sort((a, b) => (b.level || 8) - (a.level || 8))
}
export function hskOverLevelComplaint(offenders: OverLevelWord[], label: string, ceiling: number) {
  return `These words exceed ${label}: ${offenders.slice(0, 24).map(({ word, level }) => `${word} (${level ? `HSK ${level === 7 ? '7–9' : level}` : 'unlisted'})`).join(', ')}. Rewrite with vocabulary and grammar at HSK ${ceiling === 7 ? '7–9' : ceiling} or below. Do not use TBCL or TOCFL to judge them. Preserve the JSON shape and item count.`
}
