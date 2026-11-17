import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { quizItemStats } from '../src/lib/quizItemStats.ts'
import { heifHeader } from '../src/lib/studentImages.ts'

test('quiz review distinguishes wrong, partial, ungraded and missing answers without treating pending marks as failures', () => {
  const results = { items: [{ id: 'q', points: 20 }], attempts: ['right', 'wrong', 'partial', 'pending', 'missing'].map((id, i) => ({ id, participant_id: id, participant_name: '同名學生', status: i === 3 ? 'grading' : 'graded' })), answers: [20, 0, 10, null].map((score, i) => ({ item_id: 'q', attempt_id: ['right', 'wrong', 'partial', 'pending'][i], score })) }
  const stats = quizItemStats(results, 'q')
  assert.equal(stats.correct, 1); assert.equal(stats.wrong.length, 2)
  assert.equal(stats.pending, 1); assert.equal(stats.missing, 1)
  assert.deepEqual(stats.wrong.map(student => student.attempt.participant_id), ['wrong', 'partial'])
  results.answers[0].score = null
  assert.equal(quizItemStats(results, 'q').pending, 2)
})

test('HEIF is detected from the contents even when Android supplies an empty MIME type or a JPG filename; AVIF remains separate', () => {
  const bytes = text => Uint8Array.from(Buffer.from('\0\0\0\x18ftyp' + text))
  for (const brand of ['heic', 'heix', 'mif1heic', 'msf1hevc']) assert.equal(heifHeader(bytes(brand)), true)
  assert.equal(heifHeader(bytes('avifmif1')), false)
  assert.equal(heifHeader(bytes('avis')), false)
  assert.equal(heifHeader(Uint8Array.from([255, 216, 255, 224])), false)
})

test('recording download renews an expired URL once and never accepts HTML or an empty file as playable audio', async () => {
  const source = readFileSync('src/lib/recordingPlayback.ts', 'utf8')
  const body = source.slice(source.indexOf('export async function recordingBlob')).replace('export ', '')
  const wav = new Uint8Array(76); wav.set(Buffer.from('RIFF')); wav.set(Buffer.from('WAVE'), 8)
  const calls = []
  const context = vm.createContext({ Blob, TextDecoder, Uint8Array, fetch: async url => {
    calls.push(url)
    return url === 'expired' ? new Response('Expired', { status: 403 }) : new Response(wav, { headers: { 'content-type': 'application/octet-stream' } })
  } })
  vm.runInContext(ts.transpile(body, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
  const blob = await context.recordingBlob('expired', async () => 'fresh')
  assert.equal(blob.type, 'audio/wav'); assert.equal(blob.size, wav.length)
  assert.deepEqual(calls, ['expired', 'fresh'])
  context.fetch = async () => new Response('<html>' + 'x'.repeat(100), { headers: { 'content-type': 'text/html' } })
  await assert.rejects(context.recordingBlob('fresh', async () => 'fresh'), /INVALID_RECORDING/)
  context.fetch = async () => new Response(new Uint8Array(12))
  await assert.rejects(context.recordingBlob('fresh', async () => 'fresh'), /EMPTY_RECORDING/)
})

test('the actual Electron handlers collapse the QR panel for the wall, block expansion until close and reject other windows', () => {
  const source = readFileSync('electron/main.cjs', 'utf8')
  const body = source.slice(source.indexOf('let sentenceWallVisible = false'), source.indexOf("ipcMain.handle('lottery:set-interactive'"))
  const handlers = new Map(), bounds = [], sender = {}, overlayWindow = { webContents: sender }
  let fronts = 0
  vm.runInNewContext(body, { ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, overlayWindow,
    setControlBounds: (...args) => bounds.push(args), setPresenterTopmost() {}, bringControlToFront: () => fronts++, setTimeout() {} })
  handlers.get('sentence-wall:set-visible')({ sender: {} }, true)
  assert.equal(bounds.length, 0)
  handlers.get('sentence-wall:set-visible')({ sender }, true)
  assert.deepEqual(bounds.at(-1), [false, true])
  handlers.get('window:set-expanded')({}, true, true)
  assert.deepEqual(bounds.at(-1), [false, true, false])
  handlers.get('sentence-wall:set-visible')({ sender }, false)
  assert.deepEqual(bounds.at(-1), [true, false]); assert.equal(fronts, 1)
  handlers.get('window:set-expanded')({}, true, false)
  assert.deepEqual(bounds.at(-1), [true, false, false])
})
