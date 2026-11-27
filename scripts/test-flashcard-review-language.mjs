import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { createServer } from 'vite'
import { applyRegionalWordPinyin } from '../supabase/functions/_shared/mandarin-pronunciation.ts'
import { flashcardReviewTerm } from '../supabase/functions/_shared/flashcard-review.ts'
import { readingAnnotationChunks } from '../supabase/functions/_shared/reading-annotation-chunks.ts'

test('only eligible flashcard review returns direct translations, with the definition as context in either direction', async () => {
  const source = readFileSync('supabase/functions/participant-action/index.ts', 'utf8')
  const start = source.indexOf("      if (action === 'get_flashcard_word_translations')")
  const end = source.indexOf("      if (action === 'get_custom_quiz')", start)
  const handler = ts.transpile(`(async () => {${source.slice(start, end)}})()`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
  const expectedTerms = [
    { id: 'word-first', word: '找錢', definition: '付錢後把多出的錢退還給客人' },
    { id: 'definition-first', word: '借錢', definition: '先拿別人的錢，以後再還' },
  ]
  for (const [status, learned, allowed] of [['active', 1, false], ['active', 2, true], ['stopped', 0, true]]) {
    const reads = []
    const tables = {
      quiz_items: { data: [{ id: 'word-first', prompt_text: '找錢', prompt_is_word: true }, { id: 'definition-first', prompt_text: '先拿別人的錢，以後再還', prompt_is_word: false }] },
      sessions: { data: { teaching_language: 'huayu' } },
      quiz_attempts: { data: { id: 'own-attempt' } },
      quiz_item_answers: { count: learned },
      quiz_item_keys: { data: [{ item_id: 'word-first', accepted_answers: ['付錢後把多出的錢退還給客人'] }, { item_id: 'definition-first', accepted_answers: ['借錢'] }] },
    }
    const supabase = {
      from(table) {
        reads.push(table)
        const query = {
          select: () => query, eq: () => query, order: () => query, in: () => query, gt: () => query, maybeSingle: () => query,
          then: resolve => Promise.resolve(tables[table]).then(resolve),
        }
        return query
      },
    }
    const result = await vm.runInNewContext(handler, {
      action: 'get_flashcard_word_translations', input: { locale: 'vi' },
      quiz: { id: 'deck', requested_type: 'flashcard' }, question: { status },
      supabase, sessionId: 'class', participantId: 'learner', guidanceLanguages: new Set(['vi']),
      jsonResponse: data => data, flashcardReviewTerm,
      translateFlashcardReview: async (_db, _sessionId, locale, track, terms) => {
        assert.equal(locale, 'vi')
        assert.equal(track, 'huayu')
        assert.deepEqual(JSON.parse(JSON.stringify(terms)), expectedTerms)
        return { values: { 'word-first': 'trả lại tiền thừa', 'definition-first': 'vay tiền' } }
      },
    })
    assert.equal(reads.includes('quiz_item_keys'), allowed)
    assert.equal(result.values['definition-first'], allowed ? 'vay tiền' : undefined)
  }
})

test('pinyin stays joined within each word, while phrases and apostrophes keep their boundaries', async () => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } })
  try {
    const { flashcardPinyinLines } = await server.ssrLoadModule('/src/lib/cardReadings.ts')
    const source = '學校\n檔案\n看電影\n臺灣'
    const spans = [
      { text: '學校', pinyin: 'xuéxiào' }, { text: '\n', pinyin: '' },
      { text: '檔案', pinyin: "dàng'àn" }, { text: '\n', pinyin: '' },
      { text: '看', pinyin: 'kàn' }, { text: '電影', pinyin: 'diànyǐng' }, { text: '\n', pinyin: '' },
      { text: '臺灣', pinyin: 'Táiwān' },
    ]
    assert.deepEqual(flashcardPinyinLines(source, spans), ['xuéxiào', "dàng'àn", 'kàn diànyǐng', 'Táiwān'])
    const dictionary = [{ text: '比賽', pinyin: 'bǐsài' }, { text: '一', pinyin: 'yī' }, { text: '次', pinyin: 'cì' }]
    assert.deepEqual(applyRegionalWordPinyin('比賽一次', dictionary, 'standard_guoyu', false), dictionary)
    assert.equal(flashcardPinyinLines(source, [{ text: source, pinyin: 'xuéxiào' }]), null)
    assert.deepEqual(readingAnnotationChunks('借錢\n檔案\n臺灣', 2, true), ['借錢\n', '檔案\n', '臺灣'])
  } finally {
    await server.close()
  }
})

test('handwriting checks accept traditional flashcards and keep simplified decks and unrelated activities out', async () => {
  const { usesTraditionalFlashcardHandwriting, hanCharacters } = await import('../supabase/functions/_shared/han-stroke-match.ts')
  const source = readFileSync('supabase/functions/participant-action/index.ts', 'utf8')
  const start = source.indexOf("    if (action === 'get_stroke_reference'")
  const end = source.indexOf("    if (action === 'submit_reading_evidence')", start)
  const handler = ts.transpile(`(async () => {${source.slice(start, end)}})()`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
  for (const [track, kind, character, expected] of [
    ['huayu', 'flashcard', '學', 200],
    ['huayu', 'flashcard', '鳥', 400],
    ['guoyu', 'flashcard', '學', 200],
    ['huayu', 'multiple_choice', '學', 403],
    ['putonghua', 'flashcard', '學', 403],
  ]) {
    const writes = []
    const tables = {
      sessions: { teaching_language: track, level_framework: 'tbcl', level_code: '1' },
      questions: { status: 'active' },
      quizzes: { id: 'deck', requested_type: kind },
      quiz_items: [{ prompt_is_word: true, prompt_text: '學校' }],
    }
    const response = await vm.runInNewContext(handler, {
      action: 'submit_handwriting_check', input: { character, questionId: 'question', checkId: 'check', ink: [[{ x: 1, y: 1 }]] },
      sessionId: 'class', participantId: 'learner', participantToken: 'token',
      verifyParticipant: async () => ({ id: 'learner' }), validUuid: () => true, usesTraditionalFlashcardHandwriting, hanCharacters,
      jsonResponse: (data, status = 200) => ({ data, status }), URL, AbortSignal,
      fetch: async () => ({ ok: true, text: async () => '<mock>' }),
      extractMoeStrokeXml: () => '<mock>', parseMoeStrokeTracks: () => [[{ x: 1, y: 1 }]],
      checkHanWriting: () => ({ status: 'match' }),
      supabase: {
        from(table) {
          const query = {
            select: () => query, eq: () => query, maybeSingle: () => query,
            insert: value => { writes.push([table, value.character]); return { error: null } },
            then: resolve => Promise.resolve({ data: tables[table] ?? null }).then(resolve),
          }
          return query
        },
      },
    })
    assert.equal(response.status, expected, `${track}/${kind}/${character}`)
    assert.deepEqual(writes, expected === 200 ? [['handwriting_checks', character]] : [])
  }
})
