// Refuses a schema that cannot be applied: a table named above its own
// create table, or a dollar-quote that lost a dollar.
//
//   node scripts/check-schema-order.mjs
//
// supabase/schema.sql is applied as a single transaction, so a statement that
// touches a table before it exists does not merely fail — it rolls back every
// table created before it, and a brand new project comes out of a deployment
// that reported success with nothing in it at all. The setup screen's next
// move then reads public.sessions and gets a 404, which says "this project has
// no tables" and nothing about why. Re-running cannot help: the same statement
// fails in the same place every time.
//
// A migration written beside the feature it belongs to, rather than below the
// table it alters, is all it takes. That is how the listening_clips grants came
// to sit three hundred lines above `create table public.listening_clips`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'supabase/schema.sql')
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

const CREATE = /^create table if not exists public\.([a-z_]+)/
const REFERENCE = /public\.([a-z_]+)/g

const createdAt = new Map()
lines.forEach((line, index) => {
  const found = line.match(CREATE)
  // The first create wins: a later `if not exists` for the same table is a
  // no-op on a fresh database, so it cannot be what makes the name valid.
  if (found && !createdAt.has(found[1])) createdAt.set(found[1], index + 1)
})

// Every dollar-quote in this file is a pair of identical tags — $$ or $board$.
// A lone $ is not valid SQL here (the file uses no positional parameters), and
// it is a mistake with one specific cause worth naming: String.replace() reads
// $$ in its REPLACEMENT string as an escaped single $, so a script that appends
// SQL through .replace(old, sqlContainingDollarQuotes) silently halves every
// one of them. That is how `do $$ begin` shipped as `do $ begin` and took a
// whole deployment down at line 1025 with "syntax error at or near $".
//
// Counting $ per line is not enough on its own: the matching `end $$;` was
// corrupted too, which left the file's total even and a naive check happy.
const dollarProblems = []
{
  const TAG = /\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g
  const openTags = new Map()
  lines.forEach((line, index) => {
    const withoutTags = line.replace(TAG, '')
    if (withoutTags.includes('$')) {
      dollarProblems.push(`  schema.sql:${index + 1} has a bare $ — a dollar-quote lost a dollar: ${line.trim()}`)
    }
    for (const [tag] of line.matchAll(TAG)) {
      openTags.set(tag, (openTags.get(tag) || 0) + 1)
    }
  })
  for (const [tag, count] of openTags) {
    if (count % 2 !== 0) dollarProblems.push(`  schema.sql: ${tag} appears ${count} times — dollar-quotes must pair up.`)
  }
}

if (dollarProblems.length) {
  console.error(`schema.sql: ${dollarProblems.length} broken dollar-quote(s).\n`)
  console.error(dollarProblems.join('\n'))
  console.error('\nPostgres stops at the first one, and the file is one transaction.')
  process.exit(1)
}

const problems = []
lines.forEach((line, index) => {
  if (CREATE.test(line)) return
  for (const [, table] of line.matchAll(REFERENCE)) {
    const created = createdAt.get(table)
    if (created && index + 1 < created) {
      problems.push(`  schema.sql:${index + 1} uses public.${table}, created at line ${created}`)
    }
  }
})

if (problems.length) {
  console.error(`schema.sql: ${problems.length} reference(s) above their own create table.\n`)
  console.error(problems.join('\n'))
  console.error('\nThe file is one transaction: this empties a new project rather than failing one statement.')
  process.exit(1)
}
console.log(`schema.sql: ${createdAt.size} tables, each created before it is used, and every dollar-quote paired.`)
