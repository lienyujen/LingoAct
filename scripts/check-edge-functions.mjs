// Parses every edge function, because nothing else does.
//
//   node scripts/check-edge-functions.mjs
//
// `tsc -b` covers src/ only — supabase/functions/ is Deno code with .ts import
// specifiers and Deno globals, so it is excluded from the app's tsconfig. That
// leaves the functions with no compile step at all on this machine: a stray
// bracket in a prompt string reaches the class before anything notices, as an
// "Edge Function returned a non-2xx status code" that says nothing.
//
// This is a syntax check, not a type check. Type-checking them needs Deno,
// which is not installed here; a parse is what can be done locally and it
// catches the edits that are actually made to these files — long prompt
// strings, template literals and JSON payloads.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const base = path.join(root, 'supabase/functions')

const files = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
}
walk(base)

const problems = []
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const result = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  })
  for (const diagnostic of result.diagnostics || []) {
    // category 1 is Error; everything else here is a suggestion about Deno
    // globals this parse cannot know about.
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue
    const where = diagnostic.start === undefined
      ? ''
      : `:${source.slice(0, diagnostic.start).split('\n').length}`
    problems.push(`  ${path.relative(root, file).replace(/\\/g, '/')}${where} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`)
  }
}

if (problems.length) {
  console.error(`${problems.length} syntax error(s) in the edge functions.\n`)
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(`edge functions: ${files.length} files parse clean.`)
