// Type-checks the edge functions, which nothing else does.
//
//   node scripts/check-edge-types.mjs
//
// check-edge-functions.mjs parses them, and a parse cannot see a function that
// does not exist: `clean(input.sourceText, 8000)` is perfectly good syntax and
// threw ReferenceError the first time a teacher pressed 生成並派送, arriving as
// "Edge Function returned a non-2xx status code" with nothing else to go on.
//
// Deno would catch it, and Deno is not installed here. TypeScript can, given
// two things it is missing: the Deno global, and the one npm: specifier these
// functions import. Both are stubbed below — the stubs are only as good as they
// need to be to resolve names, and the point is the names, not the types behind
// them.
import fs from 'node:fs'
import os from 'node:os'
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

// A scratch folder holding the shims, so nothing is written into the project.
const shims = fs.mkdtempSync(path.join(os.tmpdir(), 'lingoact-edge-types-'))
fs.writeFileSync(path.join(shims, 'deno.d.ts'), `
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Response | Promise<Response>): void
  test(name: string, fn: () => unknown): void
}
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }
`)
// The Supabase client is used for its shape, not its types: every call here is
// .from(...).select(...) and friends, and typing those properly would mean
// generating database types this check does not need.
fs.writeFileSync(path.join(shims, 'supabase.d.ts'), `
declare module 'npm:@supabase/supabase-js@2.110.8' {
  export function createClient(url: string, key: string, options?: unknown): any
  export type SupabaseClient = any
}
`)

const options = {
  noEmit: true,
  allowImportingTsExtensions: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  strict: false,
  // The point of this check: a name that is not defined anywhere.
  noImplicitAny: false,
  skipLibCheck: true,
  types: [],
}

const program = ts.createProgram(
  [...files, path.join(shims, 'deno.d.ts'), path.join(shims, 'supabase.d.ts')],
  options,
)

// Only the errors that mean "this identifier does not exist" or "you are calling
// it wrong". Everything else — missing database types, loose JSON shapes — is
// noise this check is not for.
const WANTED = new Set([
  2304, // Cannot find name
  2552, // Cannot find name, did you mean
  2554, // Expected n arguments but got m
  2555, // Expected at least n arguments
  2724, // has no exported member named
  2305, // module has no exported member
  2307, // Cannot find module
])
// Deliberately not "property does not exist": these functions read JSON whose
// shape TypeScript cannot know without generated database types, so that error
// fires 28 times on code that is correct and would bury the one that is not.

const problems = []
for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
  if (!WANTED.has(diagnostic.code)) continue
  const file = diagnostic.file
  if (!file || !file.fileName.includes('supabase/functions')) continue
  // Property-does-not-exist on an `any` chain is unavoidable here.
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')
  const { line } = file.getLineAndCharacterOfPosition(diagnostic.start || 0)
  problems.push(`  ${path.relative(root, file.fileName).replace(/\\/g, '/')}:${line + 1} ${message}`)
}

fs.rmSync(shims, { recursive: true, force: true })

const unique = [...new Set(problems)]
if (unique.length) {
  console.error(`${unique.length} name or call error(s) in the edge functions.\n`)
  console.error(unique.join('\n'))
  console.error('\nThese reach a class as "Edge Function returned a non-2xx status code".')
  process.exit(1)
}
console.log(`edge functions: ${files.length} files, every name resolves.`)
