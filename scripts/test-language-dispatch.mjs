import { englishTextRuns } from '../src/lib/englishText.ts'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { newWords, settleWords } from '../supabase/functions/_shared/reading.ts'
import { wordLevel } from '../supabase/functions/_shared/tbcl-levels.generated.ts'
import { tbclLevelOf } from '../supabase/functions/_shared/proficiency.ts'
import { buildVoicePlan, dialogueTurns, karaokeCues, synthesize } from '../supabase/functions/_shared/listening.ts'
import { createClient } from '@supabase/supabase-js'
import { guardRealtimeTables, matchesRealtimeFilter } from '../src/lib/realtimeGuard.ts'

test('Realtime callbacks reject other tables and classrooms, including partial deletes', () => {
  const filter = { event: '*', schema: 'public', table: 'participants', filter: 'session_id=eq.class-1' }
  const change = { eventType: 'INSERT', schema: 'public', table: 'participants', new: { id: 'student', session_id: 'class-1', name: 'Student' }, old: {} }
  assert.equal(matchesRealtimeFilter(filter, change), true)
  for (const table of ['questions', 'screenshots', 'sessions', 'answers']) assert.equal(matchesRealtimeFilter(filter, { ...change, table }), false)
  assert.equal(matchesRealtimeFilter(filter, { ...change, new: { ...change.new, session_id: 'class-2' } }), false)
  assert.equal(matchesRealtimeFilter(filter, { ...change, eventType: 'DELETE', new: {}, old: { id: 'student' } }), true)
  assert.equal(matchesRealtimeFilter(filter, { ...change, new: { id: 'student' } }), false)
})

test('missing SDK binding IDs cannot turn a student heartbeat into a class-wide reload', () => {
  for (const guarded of [false, true]) {
    const client = createClient('https://example.supabase.co', 'public-test-key')
    if (guarded) guardRealtimeTables(client)
    const calls = []
    const channel = client.channel('classroom-regression')
    for (const table of ['sessions', 'participants', 'questions']) channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => calls.push(table))
    channel.channelAdapter.getChannel().trigger('postgres_changes', {
      ids: [1], data: { schema: 'public', table: 'participants', type: 'UPDATE', columns: [], record: { id: 'student', session_id: 'class-1' }, old_record: {} },
    })
    assert.deepEqual(calls, guarded ? ['participants'] : ['sessions', 'participants', 'questions'])
  }
})

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

test('dialogue and quoted sentence starts after colons are capitalised without changing lists or names', () => {
  const cases = [
    ['王小姐：我喜歡這裡。', ['王小姐', '：', '我', '喜歡', '這裡', '。'], ['Wáng xiǎojie', '', 'wǒ', 'xǐhuān', 'zhèlǐ', ''], '我', 'Wǒ'],
    ['魯迅說：我們要說真話。', ['魯迅', '說', '：', '我們', '要', '說', '真話', '。'], ['Lǔ Xùn', 'shuō', '', 'wǒmen', 'yào', 'shuō', 'zhēnhuà', ''], '我們', 'Wǒmen'],
    ['他喜歡三種動物：狗、貓和兔子。', ['他', '喜歡', '三', '種', '動物', '：', '狗', '、', '貓', '和', '兔子', '。'], ['tā', 'xǐhuān', 'sān', 'zhǒng', 'dòngwù', '', 'gǒu', '', 'māo', 'hé', 'tùzi', ''], '狗', 'gǒu'],
    ['保人是：王芳。', ['保人', '是', '：', '王芳', '。'], ['bǎorén', 'shì', '', 'Wáng Fāng', ''], '王芳', 'Wáng Fāng'],
    ['小明：你好。\n小華：你早。\n小明：謝謝。', ['小明', '：', '你', '好', '。', '\n', '小華', '：', '你', '早', '。', '\n', '小明', '：', '謝謝', '。'], ['Xiǎo Míng', '', 'nǐ', 'hǎo', '', '', 'Xiǎo Huá', '', 'nǐ', 'zǎo', '', '', 'Xiǎo Míng', '', 'xièxie', ''], '謝謝', 'Xièxie'],
  ]
  for (const [text, pieces, readings, target, expected] of cases) {
    const result = settleWords(pieces.map((word, at) => ({ text: word, pinyin: readings[at] })), text)
    assert.equal(result.map((word) => word.text).join(''), text)
    assert.equal(result.find((word) => word.text === target)?.pinyin, expected)
  }
})

test('pinyin control remains available when the passage has no new vocabulary', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../src/components/ReadingPassageView.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)((name) => {
    if (name === '../lib/englishText') return { englishTextRuns }
    if (name === '../lib/uiText') return { uiText: (text) => text }
    if (name === '@phosphor-icons/react') return { BookOpen: () => null, Translate: () => null, X: () => null }
    if (name === '../lib/readingFont') return { useReadingFont: () => null }
    if (name === '../lib/useReadingTranslation') return { useReadingTranslation: (passage) => ({ passage }) }
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

test('zhuyin passages use IVS readings for new words and never fall back to pinyin', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../src/components/ReadingPassageView.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const reading = '聲調' + String.fromCodePoint(0xE01E1)
  for (const all of [false, true]) {
    const exports = {}
    let state = 0
    new Function('require', 'exports', compiled)((name) => {
      if (name === '../lib/englishText') return { englishTextRuns }
    if (name === '../lib/uiText') return { uiText: (text) => text }
      if (name === 'react') return { ...require(name), useState: (initial) => [state++ === 2 ? all : typeof initial === 'function' ? initial() : initial, () => {}] }
      if (name === '@phosphor-icons/react') return { BookOpen: () => null, Translate: () => null, X: () => null }
      if (name === '../lib/readingFont') return { useReadingFont: () => 'CorrectSubset' }
      if (name === '../lib/useReadingTranslation') return { useReadingTranslation: (passage) => ({ passage }) }
      if (name === '../lib/participantI18n') return { participantText: (_locale, key) => key, contentLocaleKey: (locale) => locale }
      return require(name)
    }, exports)
    const html = renderToStaticMarkup(createElement(exports.ReadingPassageView, {
      passage: { title: '課文', body: '聲調好', annotation: 'zhuyin', annotation_text: reading + '好', font_url: 'subset.woff2', vocabulary: [{ word: '聲調', level: 2 }], grammar: [], words: [{ text: '聲調', pinyin: 'shēngdiào' }, { text: '好', pinyin: 'hǎo' }] },
      locale: 'zh-TW',
    }))
    assert.match(html, /readingZhuyin/)
    assert.ok(html.includes(String.fromCodePoint(0xE01E1)))
    assert.doesNotMatch(html, /<ruby|shēngdiào|hǎo/)
    assert.equal((html.match(/font-family:CorrectSubset/g) || []).length, all ? 3 : 2)
  }
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
    const passageCues = await karaokeCues(new Uint8Array(), '請完整讀出這一篇文章。', 'zh-tw', 5000)
    assert.ok(passageCues.length)
    globalThis.Deno = { env: { get: () => undefined } }
    const fallback = await karaokeCues(new Uint8Array(), transcript, 'zh-tw', 5000, transcript, plan.speakers)
    assert.ok(fallback.every((cue) => !labelled.has(cue.start_index)))
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Deno = originalDeno
  }
})

test('TOCFL A2 marks current-level words, higher words and unlisted words', () => {
  const words = ['拍', '享受', '秋季', '資料夾', '的'].map((text) => ({ text, pinyin: '' }))
  const level = tbclLevelOf('tocfl', 'level2')
  assert.equal(level, 3)
  const marked = newWords(words, level)
  for (const { text } of words) {
    assert.equal(marked.some((entry) => entry.word === text), !wordLevel(text) || wordLevel(text) >= level)
  }
  assert.ok(words.some(({ text }) => wordLevel(text) === level))
})

test('passage transcription at 109 of 112 characters still produces complete cues', async () => {
  const originalFetch = globalThis.fetch
  const originalDeno = globalThis.Deno
  globalThis.Deno = { env: { get: () => 'test-key' } }
  globalThis.fetch = async () => Response.json({ steps: [{ content: [{ type: 'word_info', text: '秋'.repeat(109), start_offset: '0s', end_offset: '9s' }] }] })
  try {
    const cues = await karaokeCues(new Uint8Array(), '秋'.repeat(112), 'zh-tw', 10000)
    assert.ok(cues.length)
    assert.equal(cues.at(-1).end_index, 112)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Deno = originalDeno
  }
})

test('self-deploy schema seeds the font-ordered polyphonic dictionary idempotently', () => {
  const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  const seed = schema.split('-- BEGIN GENERATED BOPOMOFO READINGS')[1].split('-- END GENERATED BOPOMOFO READINGS')[0]
  const entries = [...seed.matchAll(/^  \((\d+), array\[([^\]]+)\]\)/gm)]
  assert.equal(entries.length, 18636)
  assert.equal(new Set(entries.map((entry) => entry[1])).size, entries.length)
  assert.match(seed, /on conflict \(codepoint\) do update set readings = excluded.readings/)
  assert.match(seed, /\(35519, array\['ㄊㄧㄠˊ','ㄉㄧㄠˋ'\]\)/)
  assert.match(seed, /\(21644, array\['ㄏㄜˊ','ㄏㄢˋ'/)
})

test('font subsetting retains the IVS glyphs for 調 and 和', async () => {
  const require = createRequire(import.meta.url)
  const subsetFont = require('subset-font')
  const fontverter = createRequire(require.resolve('subset-font'))('fontverter')
  const input = readFileSync(new URL('../resources/fonts/BpmfZihiKaiStd-Regular.ttf', import.meta.url))
  const selector = String.fromCodePoint(0xE01E1)
  const subset = await subsetFont(input, `聲調${selector}和${selector}`, { targetFormat: 'woff2' })
  const ttf = await fontverter.convert(subset, 'truetype')
  let cmap
  for (let n = 0; n < ttf.readUInt16BE(4); n++) {
    const record = 12 + 16 * n
    if (ttf.toString('ascii', record, record + 4) === 'cmap') cmap = ttf.readUInt32BE(record + 8)
  }
  assert.ok(cmap)
  let variations
  for (let n = 0; n < ttf.readUInt16BE(cmap + 2); n++) {
    const offset = cmap + ttf.readUInt32BE(cmap + 8 + 8 * n)
    if (ttf.readUInt16BE(offset) === 14) variations = offset
  }
  assert.ok(variations, 'Subset dropped the variation-selector cmap')
  const supported = new Set()
  for (let n = 0; n < ttf.readUInt32BE(variations + 6); n++) {
    const record = variations + 10 + 11 * n
    if (ttf.readUIntBE(record, 3) !== 0xE01E1) continue
    const offset = variations + ttf.readUInt32BE(record + 7)
    for (let i = 0; i < ttf.readUInt32BE(offset); i++) supported.add(ttf.readUIntBE(offset + 4 + 5 * i, 3))
  }
  assert.ok(supported.has('調'.codePointAt(0)))
  assert.ok(supported.has('和'.codePointAt(0)))
})
