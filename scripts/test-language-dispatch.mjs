import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { settleWords } from '../supabase/functions/_shared/reading.ts'
import { buildVoicePlan, dialogueTurns, karaokeCues, synthesize } from '../supabase/functions/_shared/listening.ts'

test('reading words preserve original Windows line breaks and reject changed content', () => {
  const raw = [{ text: '小明', pinyin: 'xiǎomíng' }, { text: '去', pinyin: 'qù' }, { text: '學校', pinyin: 'xuéxiào' }, { text: '。', pinyin: '' }]
  for (const body of ['小明去學校。', '小明\r\n去學校。', ' 小明\n去 學校。 ']) {
    const words = settleWords(raw, body)
    assert.equal(words.map((word) => word.text).join(''), body)
    assert.equal(words.find((word) => word.text === '小明').pinyin, 'Xiǎomíng')
    assert.ok(words.some((word) => word.text === '學校' && word.pinyin === 'xuéxiào'))
  }
  assert.deepEqual(settleWords(raw, '小明去醫院。'), [])
  assert.deepEqual(settleWords([{ text: 'James', pinyin: '' }], 'Jame'), [])
})

test('pinyin control remains available when the passage has no new vocabulary', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../src/components/ReadingPassageView.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)((name) => {
    if (name === '@phosphor-icons/react') return { BookOpen: () => null, Translate: () => null, X: () => null }
    if (name === '../lib/readingFont') return { useReadingFont: () => null }
    if (name === '../lib/participantI18n') return { participantText: (_locale, key) => key, contentLocaleKey: (locale) => locale }
    return require(name)
  }, exports)
  const html = renderToStaticMarkup(createElement(exports.ReadingPassageView, {
    passage: { title: '上學', body: '學校', vocabulary: [], grammar: [], words: [{ text: '學校', pinyin: 'xuéxiào' }] },
    locale: 'zh-TW',
  }))
  assert.match(html, /readingPinyin/)
  assert.doesNotMatch(html, /readingWords/)
})

test('only configured line-start speaker labels are removed; names in dialogue remain', () => {
  const turns = dialogueTurns('小明：小華，你認識王小美嗎？\r\n小華：王小美說：明天找小明。\r\n提醒：帶上王小美的書。', ['小明', '小華'])
  assert.deepEqual(turns, [
    { speaker: '小明', text: '小華，你認識王小美嗎？' },
    { speaker: '小華', text: '王小美說：明天找小明。' },
    { speaker: null, text: '提醒：帶上王小美的書。' },
  ])
  const plan = buildVoicePlan('dialogue', 'zh-tw', 'standard_guoyu', ['張韶涵', '小華'], [], '張韶涵：小華，你好。\n小華：張韶涵，你好。')
  const spoken = dialogueTurns(plan.speechText, plan.speakers)
  assert.equal(spoken[0].speaker, '張韶涵')
  assert.equal(spoken[1].speaker, '小華')
  assert.equal(spoken[0].text, '小華，你好。')
})

test('dialogue synthesis sends names verbatim and ASR differences do not block its audio', async () => {
  const originalFetch = globalThis.fetch
  const originalDeno = globalThis.Deno
  globalThis.Deno = { env: { get: (name) => name === 'GEMINI_API_KEY' ? 'test-key' : undefined } }
  const transcript = '小明：小華，你認識王小美嗎？\n小華：認識，我明天找王小美。'
  const plan = buildVoicePlan('dialogue', 'zh-tw', 'putonghua', ['小明', '小華'], [], transcript)
  try {
    let request
    globalThis.fetch = async (_url, options) => {
      request = JSON.parse(options.body)
      return Response.json({ steps: [{ content: [{ type: 'audio', data: btoa('\0\0') }] }] })
    }
    assert.equal((await synthesize(transcript, plan)).length, 2)
    assert.deepEqual(request.input[0].content.map((turn) => turn.text), ['小華，你認識王小美嗎？', '認識，我明天找王小美。'])
    assert.deepEqual(request.input[0].content.map((turn) => turn.annotations[0].speaker), ['小明', '小華'])
    globalThis.fetch = async () => Response.json({ steps: [{ content: [{ type: 'word_info', text: '小華', start_offset: '0.1s', end_offset: '0.5s' }] }] })
    const cues = await karaokeCues(new Uint8Array(), transcript, 'zh-tw', 5000, transcript, plan.speakers)
    assert.ok(cues.length)
    const labelled = new Set([0, 1, [...transcript.slice(0, transcript.indexOf('\n') + 1)].length, [...transcript.slice(0, transcript.indexOf('\n') + 1)].length + 1])
    assert.ok(cues.every((cue) => !labelled.has(cue.start_index)))
    assert.ok(cues.some((cue) => cue.start_index === [...transcript.slice(0, transcript.indexOf('王小美'))].length))
    // Passage omission protection stays in force.
    await assert.rejects(karaokeCues(new Uint8Array(), '請完整讀出這一篇文章。', 'zh-tw', 5000), /Generated speech covered/)
    globalThis.Deno = { env: { get: () => undefined } }
    const fallback = await karaokeCues(new Uint8Array(), transcript, 'zh-tw', 5000, transcript, plan.speakers)
    assert.ok(fallback.every((cue) => !labelled.has(cue.start_index)))
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Deno = originalDeno
  }
})
