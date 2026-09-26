// Refuses a schema that cannot be applied: anything used above the line that
// creates it.
//
//   node scripts/check-schema-usage.mjs
//
// supabase/schema.sql is applied as a single transaction, so a statement that
// touches something before it exists does not merely fail — it rolls back every
// table created before it, and a brand new project comes out of a deployment
// that reported success with nothing in it at all.
//
// Three ways that has actually happened here:
//   - a table used above its create table         (42P01) — check-schema-order.mjs
//   - a column used above its add column          (42703) — questions.listening_clip_id
//   - a function called above its create function (42883)
//
// The column one shipped because the table check only knew about tables, so the
// deployment came back one error per attempt. This looks for all three at once.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'supabase/schema.sql')
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)

const columnAt = new Map()   // table -> Map(column -> line it first exists)
const functionAt = new Map() // function -> line
const note = (table, column, line) => {
  if (!columnAt.has(table)) columnAt.set(table, new Map())
  const columns = columnAt.get(table)
  if (!columns.has(column)) columns.set(column, line)
}

const CREATE = /^create table if not exists public\.([a-z_]+)\s*\(/
const ALTER = /^alter table (?:only )?public\.([a-z_]+)/
const ADD_COLUMN = /^\s*(?:,\s*)?add column if not exists ([a-z_]+)/
const COLUMN_DEF = /^ {2}([a-z_]+)\s+[a-z]/
const FUNCTION = /^create or replace function public\.([a-z_]+)/
// Table-level constraints start with a keyword where a column name would be.
const CONSTRAINT_WORDS = ['primary', 'unique', 'foreign', 'constraint', 'check']

let inCreate = null
let inAlter = null
lines.forEach((line, index) => {
  const at = index + 1
  const fn = line.match(FUNCTION)
  if (fn && !functionAt.has(fn[1])) functionAt.set(fn[1], at)

  const created = line.match(CREATE)
  if (created) { inCreate = created[1]; inAlter = null; return }
  if (inCreate) {
    if (/^\);/.test(line)) { inCreate = null; return }
    const column = line.match(COLUMN_DEF)
    if (column && !CONSTRAINT_WORDS.includes(column[1])) note(inCreate, column[1], at)
    return
  }
  const altered = line.match(ALTER)
  if (altered) inAlter = altered[1]
  if (inAlter) {
    const added = line.match(ADD_COLUMN)
    if (added) note(inAlter, added[1], at)
    if (/;\s*$/.test(line)) inAlter = null
  }
})

const problems = []
const report = (at, message) => problems.push(`  schema.sql:${at} ${message}`)

// 1. Qualified references, which is how a policy names another table's column:
//    `where questions.listening_clip_id = listening_clips.id`.
const QUALIFIED = /\b([a-z_]+)\.([a-z_]+)\b/g
lines.forEach((line, index) => {
  const at = index + 1
  if (/^\s*--/.test(line) || ADD_COLUMN.test(line)) return
  for (const [, table, column] of line.matchAll(QUALIFIED)) {
    const defined = columnAt.get(table)?.get(column)
    if (defined !== undefined && at < defined) {
      report(at, `uses ${table}.${column}, added at line ${defined}`)
    }
  }
})

// 2. Statements that name one table and then use its columns bare — an index on
//    (col), a check constraint, a policy body. Gathered as whole statements
//    because the body runs onto later lines, and dollar-quoted blocks are
//    skipped so a function body's semicolons do not end one early.
const statements = []
{
  let start = 0
  let depth = 0
  let inDollar = null
  lines.forEach((line, index) => {
    for (const tag of line.match(/\$[a-z_]*\$/g) || []) {
      if (inDollar === null) inDollar = tag
      else if (inDollar === tag) inDollar = null
    }
    if (inDollar) return
    depth += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length
    if (/;\s*$/.test(line) && depth <= 0) {
      statements.push({ from: start + 1, text: lines.slice(start, index + 1).join('\n') })
      start = index + 1
      depth = 0
    }
  })
}

const ON_TABLE = /\bon public\.([a-z_]+)\b/
for (const statement of statements) {
  if (/^\s*create table if not exists/.test(statement.text)) continue
  if (/add column if not exists/.test(statement.text)) continue
  const table = statement.text.match(ON_TABLE)?.[1] || statement.text.match(ALTER)?.[1]
  const known = table && columnAt.get(table)
  if (!known) continue
  for (const [word] of statement.text.matchAll(/\b([a-z_]+)\b/g)) {
    const defined = known.get(word)
    if (defined !== undefined && statement.from < defined) {
      report(statement.from, `statement on public.${table} uses column ${word}, added at line ${defined}`)
      break
    }
  }
}

// 3. Functions called before they are created.
lines.forEach((line, index) => {
  const at = index + 1
  if (/^\s*--/.test(line) || FUNCTION.test(line)) return
  for (const [, name] of line.matchAll(/\bpublic\.([a-z_]+)\s*\(/g)) {
    const defined = functionAt.get(name)
    if (defined !== undefined && at < defined) {
      report(at, `calls public.${name}(), created at line ${defined}`)
    }
  }
})

const columns = [...columnAt.values()].reduce((sum, entry) => sum + entry.size, 0)
const unique = [...new Set(problems)]
if (unique.length) {
  console.error(`schema.sql: ${unique.length} thing(s) used above their own definition.\n`)
  console.error(unique.join('\n'))
  console.error('\nThe file is one transaction: this empties a new project rather than failing one statement.')
  process.exit(1)
}
console.log(`schema.sql: ${columnAt.size} tables, ${columns} columns, ${functionAt.size} functions — nothing used above its own definition.`)
