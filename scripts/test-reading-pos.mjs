import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { readingPartOfSpeech } from '../supabase/functions/_shared/reading-pos.ts'

test('HSK vocabulary labels use simplified characters, including cached traditional labels', () => {
  const original = '名詞、動詞、形容詞、副詞、量詞、連接詞、代詞、介詞、助詞、嘆詞、數詞、擬聲詞、區別詞、趨向動詞、狀態詞、專有名詞、實詞、虛詞'
  const expected = '名词、动词、形容词、副词、量词、连接词、代词、介词、助词、叹词、数词、拟声词、区别词、趋向动词、状态词、专有名词、实词、虚词'
  assert.equal(readingPartOfSpeech(original, true), expected)
  assert.equal(readingPartOfSpeech(expected, true), expected)
  assert.equal(readingPartOfSpeech(original, false), original)
  assert.equal(readingPartOfSpeech('noun / phrasal verb', false), 'noun / phrasal verb')
  assert.equal(readingPartOfSpeech('名詞・動詞・形容詞', false), '名詞・動詞・形容詞')
})

test('the actual vocabulary AI request uses simplified labels for HSK and normalizes an AI fallback without another call', async () => {
  const source = readFileSync('supabase/functions/_shared/reading.ts', 'utf8')
  const body = source.slice(source.indexOf('async function glossNewWords('), source.indexOf('export async function generateReadingPassage('))
  for (const useSimplified of [true, false]) {
    const requests = []
    const context = {
      readingPartOfSpeech, glossSchema: () => ({}),
      callAiJson: async (prompt, input) => {
        requests.push({ prompt, input })
        return { status: 'success', output: { words: [{ word: '爱好', pos: '名詞 / 動詞', gloss: { en: 'hobby' } }] } }
      },
    }
    const result = await vm.runInNewContext(ts.transpile(`${body}\nglossNewWords([{word:'爱好',level:1}],['zh_cn','en'],'Chinese','我的爱好是游泳。',${useSimplified})`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }), context)
    assert.equal(requests.length, 1)
    assert.equal(result[0].pos, useSimplified ? '名词 / 动词' : '名詞 / 動詞')
    assert.equal(result[0].word, '爱好')
    assert.equal(result[0].gloss.en, 'hobby')
    assert.equal(requests[0].input.passage, '我的爱好是游泳。')
    if (useSimplified) assert.match(requests[0].prompt, /词类必须使用简体中文及中国大陆通用/)
    else assert.match(requests[0].prompt, /詞類用中文寫/)
  }
})

test('the actual vocabulary popup follows the passage script even when the student switches to Vietnamese', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync('src/components/ReadingPassageView.tsx', 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const entry = { word: '爱好', pos: '名詞 / 動詞', level: 1, gloss: { en: 'hobby', vi: 'sở thích' } }
  for (const framework of ['hsk', 'tbcl']) for (const locale of ['en', 'vi']) {
    const exports = {}
    new Function('require', 'exports', compiled)(name => {
      if (name === '../../supabase/functions/_shared/reading-pos') return { readingPartOfSpeech }
      if (name === '../lib/englishText') return { englishTextRuns: () => [] }
      if (name === '../lib/uiText') return { uiText: text => text }
      if (name === 'react') return { ...require(name), useState: initial => [initial === null ? { kind: 'word', entry } : typeof initial === 'function' ? initial() : initial, () => {}] }
      if (name === '@phosphor-icons/react') return { BookOpen: () => null, Translate: () => null, X: () => null }
      if (name === './StrokePracticeLinks') return { StrokePracticeLinks: () => null }
      if (name === '../lib/readingFont') return { useReadingFont: () => null }
      if (name === '../lib/useReadingTranslation') return { useReadingTranslation: passage => ({ passage }) }
      if (name === '../lib/participantI18n') return { participantText: (_, key) => key, contentLocaleKey: value => value }
      return require(name)
    }, exports)
    const html = renderToStaticMarkup(createElement(exports.ReadingPassageView, { passage: { level_framework: framework, title: '阅读', body: '爱好', vocabulary: [entry], grammar: [] }, locale }))
    assert.match(html, framework === 'hsk' ? /reading-note-pos">名词 \/ 动词</ : /reading-note-pos">名詞 \/ 動詞</)
    assert.match(html, /<strong>爱好<\/strong>/)
  }
})
