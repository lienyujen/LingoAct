import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync('supabase/functions/participant-action/index.ts', 'utf8')
const start = source.indexOf("      if (action === 'get_custom_quiz') {")
const end = source.indexOf("      if (!quiz) return jsonResponse({ message: '自訂測驗仍在出題中", start)
const handler = ts.transpile(`(async () => {${source.slice(start, end)}})()`, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })

test('active flashcards can be read while pronunciation and localized review are pending', { timeout: 2000 }, async () => {
  const cards = [{ id: 'card', prompt_text: '借錢', prompt_is_word: true, audio_url: null, audio_status: 'pending' }]
  let finishAudio
  const audio = new Promise(resolve => { finishAudio = resolve })
  const background = []
  const database = {
    from(table) {
      const rows = table === 'quiz_items' ? cards : null
      const query = {
        select: () => query, eq: () => query, order: () => query, maybeSingle: () => query,
        then: resolve => Promise.resolve({ data: rows, error: null }).then(resolve),
      }
      return query
    },
  }
  let translationCalls = 0
  const context = {
    action: 'get_custom_quiz', input: { locale: 'vi', deferFlashcardTranslations: true }, question: { status: 'active' },
    quiz: { id: 'deck', requested_type: 'flashcard' },
    supabase: database, sessionId: 'class', questionId: 'question', participantId: 'student',
    guidanceLanguages: new Set(['vi']), jsonResponse: data => data,
    EdgeRuntime: { waitUntil: task => background.push(task) },
    prepareFlashcardAudioInBackground: () => audio,
    translateFlashcardItems: () => { translationCalls++; return new Promise(() => {}) },
    translateQuizFeedback: async (_supabase, _sessionId, _locale, attempt, answers) => ({ attempt, answers }),
  }
  try {
    const response = await vm.runInNewContext(handler, context)
    assert.equal(response.items[0].prompt_text, '借錢')
    assert.equal(response.items[0].audio_url, null)
    assert.deepEqual(background, [audio])
    assert.equal(translationCalls, 0)
  } finally {
    finishAudio()
  }
})
