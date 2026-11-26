import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chineseVocabularySegments, readingVocabularyContext } from '../supabase/functions/_shared/chinese-word-matching.ts'
import { hskWordLevel } from '../supabase/functions/_shared/hsk-word-level.ts'
import { HSK_SYLLABUS } from '../supabase/functions/_shared/hsk-syllabus.generated.ts'
import { TBCL_WORD_COUNT, WORDS_BY_LEVEL, wordLevel } from '../supabase/functions/_shared/tbcl-levels.generated.ts'

test('every official TBCL written form and HSK entry resolves to a listed level', () => {
  const tbcl = new Map(Object.entries(WORDS_BY_LEVEL).flatMap(([level, words]) => words.split(' ').map(word => [word, Number(level)])))
  const hsk = new Map()
  for (const { word, level } of HSK_SYLLABUS.vocabulary) hsk.set(word, Math.min(hsk.get(word) || 8, level))
  assert.equal(TBCL_WORD_COUNT, 14751)
  assert.equal(tbcl.size, TBCL_WORD_COUNT)
  assert.equal(HSK_SYLLABUS.vocabulary.length, 11000)
  assert.equal(hsk.size, 10896)
  for (const [terms, lookup, locale] of [[tbcl, wordLevel, 'zh-TW'], [hsk, hskWordLevel, 'zh-CN']]) {
    for (const [word, level] of terms) {
      assert.equal(lookup(word), level, word)
      const body = `「${word}」`
      assert.deepEqual([...chineseVocabularySegments(body, locale, lookup)], [{ word, level, at: 1 }], word)
      const split = [...body].map(text => ({ text }))
      assert.deepEqual([...chineseVocabularySegments(body, locale, lookup, split)], [{ word, level, at: 1 }], word)
    }
  }
  for (const word of ['沒用', '沒有用']) assert.equal(wordLevel(word), 4)
  for (const word of ['有助', '有助於']) assert.equal(wordLevel(word), 6)
  assert.equal(wordLevel('看\u{E0101}'), 1)
  assert.equal(hskWordLevel('图\u200b片'), 4)
})

test('AI spans combining several words cannot make them one out-of-list word', () => {
  const segments = (words, locale, lookup) => [...chineseVocabularySegments(words.join(''), locale, lookup, words.map(text => ({ text })))]
  assert.deepEqual(segments(['老師給我們', '。', '圖片'], 'zh-TW', wordLevel), [
    { word: '老師', level: 1, at: 0 }, { word: '給', level: 1, at: 2 },
    { word: '我們', level: 1, at: 3 }, { word: '圖片', level: 0, at: 6 },
  ])
  assert.deepEqual(segments(['图', '书', '馆', '。'], 'zh-CN', hskWordLevel), [{ word: '图书馆', level: 3, at: 0 }])
  assert.deepEqual([...chineseVocabularySegments('看图片', 'zh-CN', hskWordLevel, [{ text: 'wrong source' }])],
    [{ word: '看', level: 1, at: 0 }, { word: '图片', level: 4, at: 1 }])
})

test('legacy passes inherit the class vocabulary standard only if their own snapshot is missing', () => {
  const session = { level_framework: 'hsk', level_code: '4' }
  assert.deepEqual(readingVocabularyContext({}, session), session)
  const snapshot = { level_framework: 'tbcl', level_code: '2' }
  assert.equal(readingVocabularyContext(snapshot, session), snapshot)
})
