// Refuses a schema that would reject rows the app has already written.
//
//   node scripts/check-schema-constraints.mjs
//
// The other schema checks ask whether the file makes sense on an empty
// database. This one asks the question that only matters on a real one: a
// `check` constraint is validated against the rows already in the table, so a
// constraint that is narrower than the data already there fails with 23514 and
// rolls the whole transaction back.
//
// Two ways that happens, and the first one actually did:
//
//   1. The same constraint defined twice, the earlier one missing a value the
//      later one allows. On a fresh database the later definition wins and
//      nothing is wrong; on a database that has used the feature, the earlier
//      line rejects the rows and the deployment fails before ever reaching the
//      wider version. questions_type_check omitted 'board' this way.
//
//   2. A constraint that omits a value the code writes. That one fails the
//      first time a teacher uses the feature rather than at deployment, which
//      is worse.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaPath = path.join(root, 'supabase/schema.sql')
const schema = fs.readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n')

const lineOf = (index) => schema.slice(0, index).split('\n').length
const problems = []

// --- 1. one constraint, two definitions, the earlier one narrower -----------
const definitions = new Map()
for (const match of schema.matchAll(/add constraint ([a-z_]+)\s+check \(([^;]*?)\);/gs)) {
  const name = match[1]
  const values = [...match[2].matchAll(/'([a-z_]+)'/g)].map((value) => value[1])
  if (!definitions.has(name)) definitions.set(name, [])
  definitions.get(name).push({ line: lineOf(match.index), values })
}

for (const [name, defs] of definitions) {
  if (defs.length < 2) continue
  const final = defs[defs.length - 1]
  for (const earlier of defs.slice(0, -1)) {
    const missing = final.values.filter((value) => !earlier.values.includes(value))
    if (missing.length) {
      problems.push(
        `  schema.sql:${earlier.line} ${name} omits ${missing.map((v) => `'${v}'`).join(', ')}, which line ${final.line} allows.\n`
        + '    A database that already holds those rows fails this line with 23514 before reaching the wider one.',
      )
    }
  }
}

// --- 2. question types the code writes that no constraint allows ------------
const finalTypes = (() => {
  const defs = definitions.get('questions_type_check')
  if (defs?.length) return new Set(defs[defs.length - 1].values)
  // No alter — read the create table's inline check instead.
  const inline = schema.match(/create table if not exists public\.questions[\s\S]*?type text not null check \(type in \(([^)]*)\)\)/)
  return new Set(inline ? [...inline[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [])
})()

const written = new Map()
const sources = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) sources.push(full)
  }
}
walk(path.join(root, 'supabase/functions'))
walk(path.join(root, 'src'))

for (const file of sources) {
  const source = fs.readFileSync(file, 'utf8')
  // An insert into questions naming its type literally. A computed type cannot
  // be checked here and is left to the runtime.
  for (const match of source.matchAll(/from\('questions'\)[\s\S]{0,200}?type: '([a-z_]+)'/g)) {
    if (!written.has(match[1])) written.set(match[1], `${path.relative(root, file).replace(/\\/g, '/')}:${source.slice(0, match.index).split('\n').length}`)
  }
}

for (const [type, where] of written) {
  if (!finalTypes.has(type)) {
    problems.push(`  ${where} writes questions.type '${type}', which questions_type_check does not allow.`)
  }
}

if (problems.length) {
  console.error(`schema.sql: ${problems.length} constraint problem(s).\n`)
  console.error(problems.join('\n'))
  console.error('\nA check constraint is validated against the rows already in the table.')
  process.exit(1)
}
console.log(`schema.sql: ${definitions.size} named check constraints, none narrowed then widened; ${finalTypes.size} question types allowed, all of them written.`)
