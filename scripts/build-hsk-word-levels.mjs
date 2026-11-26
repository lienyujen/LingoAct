// Run after importing the official HSK syllabus. The reader only needs word
// levels and the readings that distinguish levels, so ship those separately.
import { writeFileSync } from 'node:fs'
import { HSK_SYLLABUS } from '../supabase/functions/_shared/hsk-syllabus.generated.ts'

const entries = new Map()
for (const { word, level, pinyin } of HSK_SYLLABUS.vocabulary) {
  const senses = entries.get(word) || []
  senses.push([pinyin, level])
  entries.set(word, senses)
}

const words = Array.from({ length: 7 }, () => [])
const readings = {}
for (const [word, senses] of entries) {
  words[Math.min(...senses.map(([, level]) => level)) - 1].push(word)
  if (new Set(senses.map(([, level]) => level)).size > 1) readings[word] = senses
}

writeFileSync(new URL('../supabase/functions/_shared/hsk-word-levels.generated.ts', import.meta.url),
  '// Generated from the official HSK 2025-11 syllabus by scripts/build-hsk-word-levels.mjs.\n'
  + `export const HSK_WORDS_BY_LEVEL = ${JSON.stringify(words.map((group) => group.sort().join(' ')))}\n`
  + `export const HSK_WORD_SENSES: Record<string, Array<[string, number]>> = ${JSON.stringify(readings)}\n`)
