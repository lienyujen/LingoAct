import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const { parsePublicConfig, configDirectory, readPortableConfig, savePortableConfig } = require('../electron/portableConfig.cjs')
const config = { ref: 'abcdefghijklmnopqrst', key: 'sb_publishable_test_public_key', appUrl: 'https://lingo.ehuayu.org' }
const env = `VITE_SUPABASE_URL=https://${config.ref}.supabase.co\nVITE_SUPABASE_ANON_KEY=${config.key}\nVITE_PUBLIC_APP_URL=${config.appUrl}\n`

test('public portable settings survive moving folders and never expose private keys', () => {
  const source = mkdtempSync(path.join(os.tmpdir(), 'lingoact-config-'))
  const moved = mkdtempSync(path.join(os.tmpdir(), 'lingoact-moved-'))
  try {
    writeFileSync(path.join(source, '.env'), `\uFEFF# USB settings\r\n${env.replaceAll('\n', '\r\n')}OPENAI_API_KEY=private-test-value\r\n`)
    assert.deepEqual(readPortableConfig(source).config, { ...config, url: `https://${config.ref}.supabase.co` })
    assert.equal(JSON.stringify(readPortableConfig(source)).includes('private-test-value'), false)
    copyFileSync(path.join(source, '.env'), path.join(moved, '.env'))
    assert.deepEqual(readPortableConfig(moved).config, readPortableConfig(source).config)
    assert.equal(savePortableConfig(moved, { ...config, appUrl: 'https://school.example', OPENAI_API_KEY: 'private-test-value' }).ok, true)
    assert.equal(readFileSync(path.join(moved, '.env'), 'utf8').includes('private-test-value'), false)
    assert.equal(readPortableConfig(moved).config.appUrl, 'https://school.example')
    assert.equal(savePortableConfig(moved, { ...config, ref: `${config.ref}\nOPENAI_API_KEY=secret` }).ok, false)
    assert.equal(savePortableConfig(moved, null).ok, true)
    assert.equal(readPortableConfig(moved).enabled, true)
    assert.equal(readPortableConfig(moved).config, null)
    assert.equal(readPortableConfig(source).config.ref, config.ref)
  } finally {
    rmSync(source, { recursive: true, force: true })
    rmSync(moved, { recursive: true, force: true })
  }
})

test('quoted CRLF config, malformed config and macOS bundle paths', () => {
  assert.equal(parsePublicConfig(env.replace(`=${config.key}`, `="${config.key}" # public key`)).key, config.key)
  assert.equal(parsePublicConfig(env.replace(`=${config.key}`, `='${config.key}`)), null)
  assert.equal(parsePublicConfig(env.replace('https://abcdefghijklmnopqrst.supabase.co', 'https://untrusted.example')), null)
  assert.equal(configDirectory('/Applications/LingoAct-Huayu.app/Contents/MacOS/LingoAct-Huayu', 'darwin'), '/Applications')
  assert.equal(configDirectory('C:\\USB\\LingoAct-Huayu.exe', 'win32'), process.platform === 'win32' ? 'C:\\USB' : '.')
})

test('portable startup wins over machine settings, with join links still authoritative', () => {
  const source = readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8').replaceAll('import.meta.env', '({})')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const stored = { ...config, ref: 'aaaaaaaaaaaaaaaaaaaa' }
  for (const [portable, hash, expected] of [
    [{ enabled: true, config: { ...config, url: `https://${config.ref}.supabase.co` } }, '', config.ref],
    [{ enabled: true, config: null }, '', undefined],
    [{ enabled: false, config: null }, '', stored.ref],
    [{ enabled: true, config: null }, `#/join/abc?p=${config.ref}&k=${config.key}`, config.ref],
  ]) {
    const exports = {}
    const window = { location: { hash }, localStorage: { getItem: () => JSON.stringify(stored), setItem: () => {} }, lingoActDesktop: { portableBackend: portable } }
    new Function('require', 'exports', 'window', compiled)((name) => {
      if (name === '@supabase/supabase-js') return { createClient: () => ({ functions: {} }) }
      if (name === './ownerKey') return { getOwnerKey: () => '' }
      if (name === './realtimeGuard') return { guardRealtimeTables: (client) => client }
      throw new Error(name)
    }, exports, window)
    assert.equal(exports.backendConfig?.ref, expected)
  }
})

test('heartbeat requests are serialized, pause in background and remove pagehide listeners', async () => {
  const source = readFileSync(new URL('../src/lib/participantPresence.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const document = { visibilityState: 'visible', addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name) }
  const listeners = new Map()
  let tick
  const window = { setInterval: (callback) => { tick = callback; return 1 }, clearInterval: () => { tick = null }, addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: (name) => listeners.delete(name) }
  let calls = 0
  let release
  const client = { functions: { invoke: (_name, options) => { calls++; assert.equal(options.timeout, 10000); return new Promise((resolve) => { release = () => resolve({ error: null }) }) } } }
  const exports = {}
  new Function('require', 'exports', 'window', 'document', compiled)(() => ({ requireSupabase: () => client }), exports, window, document)
  const stop = exports.trackParticipantPresence({ sessionId: 'class', participantId: 'student', participantToken: 'test-token', locale: () => 'zh-TW' })
  tick(); tick()
  assert.equal(calls, 1)
  release(); await Promise.resolve(); await Promise.resolve()
  document.visibilityState = 'hidden'; listeners.get('visibilitychange')(); tick()
  assert.equal(calls, 1)
  document.visibilityState = 'visible'; listeners.get('visibilitychange')()
  assert.equal(calls, 2)
  stop()
  assert.equal(listeners.size, 0)
  assert.equal(calls, 2)
  release(); await Promise.resolve(); await Promise.resolve()
  assert.equal(calls, 3)
  release(); await Promise.resolve(); await Promise.resolve()
})
