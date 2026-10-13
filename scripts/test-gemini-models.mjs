import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function load(values = {}, fetch = () => { throw Error('Unexpected API call') }) {
  const env = new Map(Object.entries(values))
  const context = { exports: {}, Deno: { env: { get: key => env.get(key) } }, fetch, AbortSignal, console: { warn() {} } }
  vm.createContext(context)
  const source = readFileSync(new URL('../supabase/functions/_shared/ai.ts', import.meta.url), 'utf8')
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return context.exports
}

test('both Gemini profiles migrate legacy model secrets and deduplicate redirected fallback', () => {
  for (const values of [{}, {
    GEMINI_MODEL: 'gemini-3.7-flash', GEMINI_FALLBACK_MODEL: 'gemini-3.5-flash',
    GEMINI_REALTIME_MODEL: 'gemini-3.7-flash', GEMINI_REALTIME_FALLBACK_MODEL: 'gemini-3.5-flash',
  }, {
    GEMINI_DEEP_MODEL: 'gemini-3.7-flash', GEMINI_DEEP_FALLBACK_MODEL: 'gemini-3.5-flash',
    GEMINI_REALTIME_MODEL: 'gemini-3.8-flash', GEMINI_REALTIME_FALLBACK_MODEL: 'gemini-3.6-flash',
  }]) {
    const ai = load(values)
    for (const profile of ['deep', 'realtime']) assert.deepEqual(Array.from(ai.geminiModels(profile)), ['gemini-3.8-flash', 'gemini-3.6-flash'])
    for (const level of ['LOW', 'MEDIUM', 'HIGH']) assert.equal(ai.geminiThinkingConfig('deep', level).thinkingLevel, level)
  }
  const ai = load({ GEMINI_DEEP_MODEL: 'custom-model', GEMINI_REALTIME_MODEL: 'gemini-3.6-flash', GEMINI_REALTIME_FALLBACK_MODEL: 'gemini-3.5-flash' })
  assert.equal(ai.geminiModels('deep')[0], 'custom-model')
  assert.deepEqual(Array.from(ai.geminiModels('realtime')), ['gemini-3.6-flash'])
})

test('unavailable 3.8 calls fall back to 3.6 without calling retired Flash models', async () => {
  const calls = []
  const ai = load({ GEMINI_API_KEY: 'fixture-only', GEMINI_REALTIME_MODEL: 'gemini-3.7-flash', GEMINI_REALTIME_FALLBACK_MODEL: 'gemini-3.5-flash' }, async url => {
    calls.push(url)
    return calls.length === 1 ? new Response('Model unavailable', { status: 404 }) : new Response('{}')
  })
  assert.equal((await ai.requestGemini('{}', 'realtime')).status, 200)
  assert.equal(calls.length, 2)
  assert.match(calls[0], /models\/gemini-3\.8-flash:generateContent$/)
  assert.match(calls[1], /models\/gemini-3\.6-flash:generateContent$/)
})
