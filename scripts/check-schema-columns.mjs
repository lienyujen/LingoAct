// Refuses code that reads or writes a column the schema never creates.
//
//   node scripts/check-schema-columns.mjs
//
// check-schema-usage.mjs asks whether schema.sql is internally consistent.
// This asks a different question: does the schema actually have what the edge
// functions use? Nothing in the deployment pipeline noticed that
// quiz_attempts.composition was written by participant-action, read by
// presenter-action and read again by the teaching cycle while existing in no
// create table anywhere — so every 重派 answered a 500 and the student saw
// "Edge Function returned a non-2xx status code", which says nothing at all.
//
// PostgREST reports an unknown column as an error on the request, so this
// fails at the point of use, in a live class, rather than at deployment.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schema = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8').split(/\r?\n/)

// --- what the schema actually has -------------------------------------------
const columnsOf = new Map()
const add = (table, column) => {
  if (!columnsOf.has(table)) columnsOf.set(table, new Set())
  columnsOf.get(table).add(column)
}

const CREATE = /^create table if not exists public\.([a-z_]+)\s*\(/
const ALTER = /^alter table (?:only )?public\.([a-z_]+)/
// Not anchored at line start: a migration is written either as an indented
// block or all on one line — `alter table public.questions add column if not
// exists learning_focus text;` — and matching only the block form reported
// three columns as missing that had been there all along.
const ADD_COLUMN_ALL = /add column if not exists ([a-z_]+)/g
const COLUMN_DEF = /^ {2}([a-z_]+)\s+[a-z]/
const CONSTRAINT_WORDS = ['primary', 'unique', 'foreign', 'constraint', 'check']

let inCreate = null
let inAlter = null
for (const line of schema) {
  const created = line.match(CREATE)
  if (created) { inCreate = created[1]; inAlter = null; continue }
  if (inCreate) {
    if (/^\);/.test(line)) { inCreate = null; continue }
    const column = line.match(COLUMN_DEF)
    if (column && !CONSTRAINT_WORDS.includes(column[1])) add(inCreate, column[1])
    continue
  }
  const altered = line.match(ALTER)
  if (altered) inAlter = altered[1]
  if (inAlter) {
    for (const added of line.matchAll(ADD_COLUMN_ALL)) add(inAlter, added[1])
    if (/;\s*$/.test(line)) inAlter = null
  }
}

// Views and rpc results are not tables; a name the schema never creates as a
// table is simply out of scope here rather than a fault.
const known = (table) => columnsOf.has(table)

// --- what the edge functions ask for ----------------------------------------
const files = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
}
walk(path.join(root, 'supabase/functions'))

const problems = []
// A select list can name an embedded resource — participants(name) — and can
// alias — alias:real_column. Both are unwrapped to the real column.
const columnsInSelect = (list) => list
  .replace(/\([^)]*\)/g, '')
  .split(',')
  .map((part) => part.trim())
  .filter(Boolean)
  .map((part) => (part.includes(':') ? part.split(':').pop().trim() : part))
  .filter((part) => /^[a-z_][a-z0-9_]*$/.test(part))

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const shown = path.relative(root, file).replace(/\\/g, '/')
  const lineOf = (index) => source.slice(0, index).split('\n').length

  // .from('table') ... and whatever is chained onto it before the statement
  // ends. 400 characters is comfortably past the longest chain here and stops
  // well short of the next .from().
  for (const match of source.matchAll(/\.from\('([a-z_]+)'\)/g)) {
    const table = match[1]
    if (!known(table)) continue
    const nextFrom = source.indexOf(".from('", match.index + 1)
    const end = Math.min(nextFrom === -1 ? source.length : nextFrom, match.index + 400)
    const chain = source.slice(match.index, end)

    const select = chain.match(/\.select\(\s*'([^']*)'/)
    if (select && select[1].trim() !== '*') {
      for (const column of columnsInSelect(select[1])) {
        if (!columnsOf.get(table).has(column)) {
          problems.push(`  ${shown}:${lineOf(match.index)} ${table}.${column} is selected but no create table or add column makes it`)
        }
      }
    }
    for (const filter of chain.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|in|is|like|ilike|order)\(\s*'([a-z_]+)'/g)) {
      if (!columnsOf.get(table).has(filter[1])) {
        problems.push(`  ${shown}:${lineOf(match.index)} ${table}.${filter[1]} is filtered on but no create table or add column makes it`)
      }
    }
  }
}

const unique = [...new Set(problems)]
if (unique.length) {
  console.error(`${unique.length} column reference(s) with nothing in schema.sql behind them.\n`)
  console.error(unique.join('\n'))
  console.error('\nPostgREST answers these with an error at the point of use, in a live class.')
  process.exit(1)
}
const total = [...columnsOf.values()].reduce((sum, set) => sum + set.size, 0)
console.log(`schema.sql: every column the edge functions touch exists (${columnsOf.size} tables, ${total} columns).`)
