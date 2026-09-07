// Translates the teacher interface's English strings into the teaching
// languages that have no hand-written column, and rewrites
// src/lib/presenterLocales.generated.ts.
//
// Run after changing any English string:
//   node scripts/generate-presenter-locales.mjs
//
// The sibling of generate-participant-locales.mjs, and deliberately a separate
// catalogue: the student page follows the 導引語 and this follows the 教學語, so
// the two tables answer to different settings and are read by different people.
// The tone differs too — one talks to a teenager mid-exercise, the other to a
// teacher running the room.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = path.join(root, 'src/lib/presenterI18n.ts')
const outputPath = path.join(root, 'src/lib/presenterLocales.generated.ts')

const targets = [
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'vi', name: 'Vietnamese' },
]

function geminiKey() {
  const envPath = path.join(root, 'supabase/.env')
  if (!fs.existsSync(envPath)) throw new Error('supabase/.env not found — it holds GEMINI_API_KEY.')
  const line = fs.readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => l.startsWith('GEMINI_API_KEY='))
  const key = line ? line.slice('GEMINI_API_KEY='.length).trim() : ''
  if (!key || key.startsWith('your-')) throw new Error('GEMINI_API_KEY in supabase/.env is missing or still a placeholder.')
  return key
}

function englishStrings() {
  const source = fs.readFileSync(sourcePath, 'utf8')
  const start = source.indexOf('\n  en: {')
  if (start < 0) throw new Error('could not find the English column in presenterI18n.ts')
  const open = source.indexOf('{', start)
  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') { depth -= 1; if (depth === 0) { end = i; break } }
  }
  if (end < 0) throw new Error('unbalanced braces in the English column')
  // eslint-disable-next-line no-new-func
  return new Function(`return ${source.slice(open, end + 1)}`)()
}

// The catalogue outgrew one request: past roughly two hundred keys the model
// starts returning a shorter object than it was given, and the check below
// reports it as missing keys. Asking in batches is slower and reliable.
const BATCH = 120

async function translate(key, strings, target) {
  const keys = Object.keys(strings)
  const translated = {}
  for (let at = 0; at < keys.length; at += BATCH) {
    const slice = Object.fromEntries(keys.slice(at, at + BATCH).map((k) => [k, strings[k]]))
    Object.assign(translated, await translateBatch(key, slice, target))
  }
  const missing = keys.filter((k) => typeof translated[k] !== 'string')
  if (missing.length) throw new Error(`${target.code}: ${missing.length} keys missing, first is "${missing[0]}"`)
  return translated
}

async function translateBatch(key, strings, target) {
  const prompt = [
    `Translate this UI string catalogue for LingoAct into ${target.name}.`,
    'These are read by the TEACHER running a live language class, not by students — the register is',
    'a professional tool, not a lesson. Keep every translation as short as the English, because they',
    'render as buttons, tab labels and inline hints in a narrow control panel. Preserve leading and',
    'trailing spaces exactly, keep {placeholders} exactly as they appear, keep punctuation natural',
    'for the target language, and do not translate the product name LingoAct or the term',
    '"Exit Ticket". Return a JSON object with exactly the same keys as the input and translated',
    'string values, nothing else.',
    '',
    JSON.stringify(strings, null, 2),
  ].join('\n')

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent',
    {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    },
  )
  if (!response.ok) throw new Error(`${target.code}: Gemini returned ${response.status} ${(await response.text()).slice(0, 200)}`)
  const payload = await response.json()
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  return JSON.parse(text)
}

const key = geminiKey()
const strings = englishStrings()
console.log(`English catalogue: ${Object.keys(strings).length} keys`)

const generated = {}
for (const target of targets) {
  process.stdout.write(`  ${target.code} (${target.name})... `)
  generated[target.code] = await translate(key, strings, target)
  console.log(`${Object.keys(generated[target.code]).length} keys`)
}

const banner = `// Generated by scripts/generate-presenter-locales.mjs — do not edit by hand.
//
// Traditional Chinese and English live in presenterI18n.ts because they are
// proofread; these are machine translations of the English column. Keeping them
// in a separate file means regenerating cannot damage the hand-written source,
// and a missing key here simply falls back to English rather than breaking.
export const generatedPresenterLocales: Record<string, Record<string, string>> = `

fs.writeFileSync(outputPath, `${banner}${JSON.stringify(generated, null, 2)}\n`)
console.log(`wrote ${path.relative(root, outputPath)}`)
