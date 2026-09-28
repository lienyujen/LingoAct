// Refuses a table name the page asks for that the schema does not create.
//
//   node scripts/check-client-tables.mjs
//
// The same shape of bug as check-storage-buckets: a string no type system
// looks at. check-schema-columns already asks this of the edge functions, but
// the pages query Postgres directly too — .from('questions'), and realtime
// subscriptions that name a table in a filter — and nothing asked whether
// those names exist. A table renamed on the way over from the app this one was
// forked from would type-check, lint, and then fail in front of a class.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schema = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8').split('\r\n').join('\n')
const declared = new Set([...schema.matchAll(/create table if not exists public\.([a-z_]+)/g)].map((match) => match[1]))
if (!declared.size) {
  console.error('check-client-tables: found no tables in schema.sql — the pattern this reads must have changed.')
  process.exit(1)
}

function* sources(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* sources(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full
  }
}

const problems = []
for (const file of sources(path.join(root, 'src'))) {
  const text = fs.readFileSync(file, 'utf8').split('\r\n').join('\n')
  const seen = new Map()
  const note = (name, index) => {
    if (declared.has(name) || seen.has(name)) return
    seen.set(name, text.slice(0, index).split('\n').length)
  }
  // supabase.from('table'), and .from('table') on a builder held in a variable.
  for (const match of text.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)) note(match[1], match.index)
  // Realtime: { table: 'questions' } inside a postgres_changes subscription.
  for (const match of text.matchAll(/\btable:\s*'([a-z_]+)'/g)) note(match[1], match.index)
  for (const [name, line] of seen) {
    problems.push(`${path.relative(root, file).split(path.sep).join('/')}:${line} queries '${name}', which schema.sql does not create.`)
  }
}

if (problems.length) {
  console.error(`${problems.length} unknown table name(s) in the pages:\n`)
  for (const problem of problems) console.error(`  ${problem}`)
  console.error('\nThese reach a class as a request that fails against a table that is not there.')
  process.exit(1)
}

console.log(`client tables: every table the pages query is one of the ${declared.size} schema.sql creates.`)
