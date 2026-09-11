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

// Menu labels where brevity is part of the product wording, not merely a
// translation preference. Keep these fixed when the rest of the catalogue is
// regenerated so the model cannot grow the old explanatory labels back.
const fixed = {
  ja: { flashcards: '単語カードを配信', typeFlashcard: '単語カード', sentenceWall: '文づくり・作文ウォール', sentenceWallShort: '文づくり・作文ウォール', readingAnnotationHint: 'リスニング練習、音読練習、単語カードで使用します。リスニングと音読では文に、単語カードでは学習する語彙に表示されます。' },
  ko: { flashcards: '단어 카드 보내기', typeFlashcard: '단어 카드', sentenceWall: '문장 쓰기 벽', sentenceWallShort: '문장 쓰기 벽', readingAnnotationHint: '듣기 연습, 낭독 연습, 단어 카드에 사용됩니다. 듣기와 낭독에서는 문장에, 단어 카드에서는 학습할 어휘에 표시됩니다.' },
  es: { flashcards: 'Enviar tarjetas de vocabulario', typeFlashcard: 'Tarjetas de vocabulario', sentenceWall: 'Muro de escritura de frases', sentenceWallShort: 'Muro de escritura de frases', readingAnnotationHint: 'Se usa en prácticas de comprensión auditiva, lectura en voz alta y tarjetas de vocabulario. En comprensión auditiva y lectura se muestra en las frases; en las tarjetas, en el vocabulario estudiado.' },
  fr: { flashcards: 'Envoyer des cartes de vocabulaire', typeFlashcard: 'Cartes de vocabulaire', sentenceWall: 'Mur d’écriture de phrases', sentenceWallShort: 'Mur d’écriture de phrases', readingAnnotationHint: 'Utilisé pour l’écoute, la lecture à voix haute et les cartes de vocabulaire. L’écoute et la lecture annotent les phrases ; les cartes annotent le vocabulaire étudié.' },
  de: { flashcards: 'Wortkarten senden', typeFlashcard: 'Wortkarten', sentenceWall: 'Satz-Schreibwand', sentenceWallShort: 'Satz-Schreibwand', readingAnnotationHint: 'Wird bei Hörübungen, Vorleseübungen und Wortkarten verwendet. Hör- und Vorleseübungen markieren Sätze; Wortkarten markieren den Lernwortschatz.' },
  vi: { flashcards: 'Gửi thẻ từ vựng', typeFlashcard: 'Thẻ từ vựng', sentenceWall: 'Tường viết câu', sentenceWallShort: 'Tường viết câu', readingAnnotationHint: 'Dùng trong bài luyện nghe, luyện đọc thành tiếng và thẻ từ vựng. Bài nghe và bài đọc đánh dấu trên câu; thẻ từ đánh dấu trên từ vựng cần học.' },
}

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
  generated[target.code] = { ...await translate(key, strings, target), ...fixed[target.code] }
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
