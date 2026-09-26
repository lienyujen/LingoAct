// Turns 國教院's published TBCL tables into a module the grader can check against.
//
//   node scripts/build-tbcl-levels.mjs --source <folder>
//
// The folder holds the three spreadsheets as downloaded from
// https://coct.naer.edu.tw/page.jsp?ID=4 (文件下載 → 參考指引、技術報告及字詞表):
//
//   hanzi.xlsx    臺灣華語文能力基準漢字表        3,100 characters, 7 levels
//   words.xlsx    三等七級詞語表                 14,452 words, 7 levels
//   grammar.xlsx  臺灣華語文能力基準語法點表        496 grammar points, 7 levels
//
// They are not committed: they are the National Academy for Educational
// Research's documents, they are republished there whenever they are revised,
// and the URLs above are the authority. What is committed is the derived index
// this writes, because the edge functions need it at runtime and a deployment
// cannot go and fetch a spreadsheet.
//
// Why a table at all, when the prompt already names the level: because naming
// it does not work. The level was described in prose, in detail, and the only
// thing ever checked after generation was how LONG a stem was — so vocabulary
// drifted above the class and nothing noticed. A word either is on the list for
// a level or it is not, and that is checkable.
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function arg(name, fallback = null) {
  const at = process.argv.indexOf(`--${name}`)
  return at > -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}

const source = arg('source')
if (!source) {
  console.error('usage: --source <folder holding hanzi.xlsx, words.xlsx, grammar.xlsx>')
  process.exit(1)
}

const cell = (value) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object' && 'richText' in value) return value.richText.map((t) => t.text).join('')
  if (typeof value === 'object' && 'text' in value) return String(value.text)
  return String(value).trim()
}

// 「第1級」…「第7級」, and 「第4*級」: the published tables asterisk some entries,
// which is a note about the entry, not a different level. Reading the asterisk
// as "no level" silently dropped 1,093 words and 212 of the 496 grammar points,
// most of them exactly the everyday ones.
const levelOf = (text) => {
  const found = /第\s*([1-7])\s*\*?\s*級/.exec(text || '')
  return found ? Number(found[1]) : 0
}

async function rowsOf(file) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(path.join(source, file))
  const sheet = workbook.worksheets[0]
  const rows = []
  sheet.eachRow((row, number) => {
    if (number === 1) return
    rows.push((row.values || []).slice(1).map(cell))
  })
  return rows
}

// --- characters -------------------------------------------------------------
const characterLevel = new Map()
for (const row of await rowsOf('hanzi.xlsx')) {
  const character = row[1]
  const level = levelOf(row[3])
  if (!character || !level) continue
  // The first level a character appears at is the level it is learned at.
  if (!characterLevel.has(character) || characterLevel.get(character) > level) {
    characterLevel.set(character, level)
  }
}

// --- words ------------------------------------------------------------------
// 爸爸/爸 is one entry holding two written forms; both are the same word at the
// same level, and a learner meets either.
const wordLevel = new Map()
for (const row of await rowsOf('words.xlsx')) {
  const level = levelOf(row[3])
  if (!level) continue
  const forms = (row[1] || '').split('/').map((form) => form.trim()).filter(Boolean)
  for (const form of forms) {
    if (!wordLevel.has(form) || wordLevel.get(form) > level) wordLevel.set(form, level)
  }
}

// --- characters the 漢字表 does not cover ------------------------------------
// The character table is 3,100 characters and the word table reaches further:
// 臺 and 台 are on neither list as characters, while 臺灣 is a level 1 word. A
// character absent from the character table therefore counts as "beyond the
// benchmark", and 臺北 came back flagged for a beginner who can certainly read
// it. Where a character appears in a listed word, that word’s level is the
// best evidence available for the character, and it comes from the same
// authority.
let derived = 0
for (const [word, level] of wordLevel) {
  for (const character of word) {
    if (!/[一-鿿]/.test(character)) continue
    if (!characterLevel.has(character)) { characterLevel.set(character, level); derived += 1 }
    else if (characterLevel.get(character) > level) characterLevel.set(character, level)
  }
}

// --- grammar ----------------------------------------------------------------
const grammarByLevel = new Map()
for (const row of await rowsOf('grammar.xlsx')) {
  const level = levelOf(row[3])
  const point = row[1]
  if (!level || !point) continue
  if (!grammarByLevel.has(level)) grammarByLevel.set(level, [])
  grammarByLevel.get(level).push({ point, example: row[4] || '' })
}

// --- emit -------------------------------------------------------------------
// Grouped by level and joined, rather than one JSON key per word: 14,452 keys
// cost about four times what the joined form does, and the module is parsed on
// every cold start of an edge function.
const byLevel = (map) => {
  const groups = new Map()
  for (const [item, level] of map) {
    if (!groups.has(level)) groups.set(level, [])
    groups.get(level).push(item)
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, items]) => `  ${level}: '${items.sort().join(' ')}',`)
    .join('\n')
}

const grammarBlock = [...grammarByLevel.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([level, points]) => {
    const listed = points
      .map((entry) => `    { point: ${JSON.stringify(entry.point)}, example: ${JSON.stringify(entry.example)} },`)
      .join('\n')
    return `  ${level}: [\n${listed}\n  ],`
  })
  .join('\n')

const out = `// Generated by scripts/build-tbcl-levels.mjs — do not edit by hand.
//
// 臺灣華語文能力基準 (TBCL), published by 國家教育研究院 at
// https://coct.naer.edu.tw/page.jsp?ID=4 — 漢字表, 三等七級詞語表 and 語法點表.
// Re-run the script against freshly downloaded spreadsheets to update this.
//
// Levels are 1 to 7: 基礎 1-3, 進階 4-5, 精熟 6-7.

// Space-separated so the module parses as three strings rather than as
// seventeen thousand object keys; the sets are built once on first use.
const CHARACTERS_BY_LEVEL: Record<number, string> = {
${byLevel(characterLevel)}
}

const WORDS_BY_LEVEL: Record<number, string> = {
${byLevel(wordLevel)}
}

export const GRAMMAR_BY_LEVEL: Record<number, Array<{ point: string; example: string }>> = {
${grammarBlock}
}

const buildIndex = (source: Record<number, string>) => {
  const index = new Map<string, number>()
  for (const [level, items] of Object.entries(source)) {
    for (const item of items.split(' ')) if (item) index.set(item, Number(level))
  }
  return index
}

let characterIndex: Map<string, number> | null = null
let wordIndex: Map<string, number> | null = null

/** The TBCL level a character is learned at, or 0 if it is on no list. */
export function characterLevel(character: string): number {
  characterIndex ??= buildIndex(CHARACTERS_BY_LEVEL)
  return characterIndex.get(character) ?? 0
}

/** The TBCL level a word is learned at, or 0 if it is on no list. */
export function wordLevel(word: string): number {
  wordIndex ??= buildIndex(WORDS_BY_LEVEL)
  return wordIndex.get(word) ?? 0
}

export const TBCL_CHARACTER_COUNT = ${characterLevel.size}
export const TBCL_WORD_COUNT = ${wordLevel.size}
export const TBCL_GRAMMAR_COUNT = ${[...grammarByLevel.values()].reduce((sum, list) => sum + list.length, 0)}
`

const target = path.join(root, 'supabase/functions/_shared/tbcl-levels.generated.ts')
fs.writeFileSync(target, out)
const size = (fs.statSync(target).size / 1024).toFixed(0)

console.log(`characters : ${characterLevel.size} (${derived} derived from the word table)`)
console.log(`words      : ${wordLevel.size}`)
console.log(`grammar    : ${[...grammarByLevel.values()].reduce((sum, list) => sum + list.length, 0)} points`)
for (const level of [1, 2, 3, 4, 5, 6, 7]) {
  const words = [...wordLevel.values()].filter((value) => value === level).length
  const chars = [...characterLevel.values()].filter((value) => value === level).length
  console.log(`  level ${level}: ${String(chars).padStart(4)} chars, ${String(words).padStart(5)} words, ${grammarByLevel.get(level)?.length || 0} grammar points`)
}
console.log(`\nwritten: supabase/functions/_shared/tbcl-levels.generated.ts (${size} KB)`)
