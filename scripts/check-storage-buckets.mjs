// Refuses a bucket name that no bucket has.
//
//   node scripts/check-storage-buckets.mjs
//
// LingoAct was forked from InterAct, and the buckets were renamed with it.
// ParticipantBoard.tsx kept uploading to 'interact-files' in two places — a
// bucket that exists in the other app and not in this one. It type-checked, it
// linted, and it failed only in front of a class, as 貼文失敗，請再試一次: the
// server had signed an upload for lingoact-files while the page pushed the
// bytes at a bucket that was not there.
//
// Nothing in the type system knows a bucket name, so this does. Every bucket
// named anywhere in the source has to be one schema.sql actually creates.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schema = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8').split('\r\n').join('\n')

const declared = new Set(
  [...schema.matchAll(/insert into storage\.buckets[^;]*?values\s*\(\s*'([^']+)'/gs)].map((match) => match[1]),
)
if (!declared.size) {
  console.error('check-storage-buckets: found no buckets in schema.sql — the pattern this reads must have changed.')
  process.exit(1)
}

// A bucket name looks like <app>-<what>. That shape is what makes a stale one
// from the other app visible without having to list them.
const BUCKET_SHAPE = /^[a-z][a-z0-9]*-(files|screenshots|recordings|images|uploads)$/

function* sources(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* sources(full)
    else if (/\.(ts|tsx|mjs|cjs)$/.test(entry.name)) yield full
  }
}

const problems = []
for (const file of [...sources(path.join(root, 'src')), ...sources(path.join(root, 'supabase/functions'))]) {
  const text = fs.readFileSync(file, 'utf8').split('\r\n').join('\n')
  const found = new Map()
  const note = (name, index) => {
    if (!BUCKET_SHAPE.test(name) || declared.has(name)) return
    if (!found.has(name)) found.set(name, text.slice(0, index).split('\n').length)
  }
  for (const match of text.matchAll(/'([a-z][a-z0-9-]*)'/g)) note(match[1], match.index)
  for (const match of text.matchAll(/storage\/v1\/object\/public\/([a-z0-9-]+)\//g)) note(match[1], match.index)
  for (const [name, line] of found) {
    problems.push(`${path.relative(root, file).split(path.sep).join('/')}:${line} uses '${name}', which no bucket is called.`)
  }
}

if (problems.length) {
  console.error(`${problems.length} unknown storage bucket name(s):\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error(`\nBuckets that exist: ${[...declared].join(', ')}.`)
  console.error('These reach a class as an upload that fails and a message telling them to try again.')
  process.exit(1)
}

console.log(`storage buckets: every name in the source is one of ${[...declared].join(', ')}.`)
