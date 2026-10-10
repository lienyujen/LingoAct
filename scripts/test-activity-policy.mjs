import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { activityTitle } from '../supabase/functions/_shared/activity-language.ts'
import { quizGenerationFailed } from '../supabase/functions/_shared/quiz-state.ts'
import { FRAMEWORKS, levelInstruction } from '../supabase/functions/_shared/proficiency.ts'

test('failed quiz jobs stop polling in every deployed title language', () => {
  for (const title of ['出題失敗，請重新派送', '出题失败，请重新发送', 'Question generation failed. Please try again.', 'Question generation failed. Please send it again.']) assert.equal(quizGenerationFailed(title), true)
  for (const title of [null, {}, 'Generating...', 'Practice']) assert.equal(quizGenerationFailed(title), false)
})

test('shared default activity titles follow teaching language without changing Traditional Chinese', () => {
  const types = ['send_screen', 'poll', 'multiple_choice', 'true_false', 'short_answer', 'pronunciation', 'oral_response', 'file_upload', 'drawing', 'hotspot', 'board', 'followup', 'discussion', 'pair', 'matching', 'ordering', 'photo', 'sentence', 'picture_story', 'listening', 'reading']
  for (const type of types) {
    assert.equal(activityTitle('huayu', type, '原來的標題'), '原來的標題')
    assert.match(activityTitle('en', type, '原來的標題'), /^[A-Za-z][A-Za-z -]+$/)
    assert.doesNotMatch(activityTitle('putonghua', type, '原來的標題'), /原來|選|寫|讀|討|論|練|聽|圖|題/)
  }
})

test('every configured English level has a nonempty instructional policy', () => {
  for (const framework of ['en108', 'cefr', 'gept', 'toeic']) {
    for (const level of FRAMEWORKS[framework].levels) {
      assert.ok(levelInstruction(framework, level.code).length > 80, `${framework}/${level.code}`)
    }
  }
})

test('all seven English quiz modes carry the selected level through the actual AI request', async () => {
  registerHooks({ resolve(specifier, context, next) { return next(specifier.startsWith('npm:@supabase/supabase-js@') ? '@supabase/supabase-js' : specifier, context) } })
  const { generateCustomQuiz } = await import('../supabase/functions/_shared/custom-quiz.ts')
  const oldFetch = globalThis.fetch, oldDeno = globalThis.Deno
  globalThis.Deno = { env: { get: () => 'fixture-key' } }
  try {
    for (const [framework, code] of [['en108', 'j'], ['cefr', 'A2'], ['gept', 'elementary'], ['toeic', 'blue']]) {
      for (const mode of ['multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching', 'writing', 'flashcard']) {
        const type = mode === 'writing' ? 'short_answer' : mode === 'flashcard' ? 'multiple_choice' : mode
        let prompt = ''
        globalThis.fetch = async (_url, options) => {
          const request = JSON.parse(options.body)
          prompt = request.systemInstruction.parts.map(part => part.text).join('\n')
          const item = { type, prompt_text: 'Choose the word.', options: ['book', 'pen', 'desk'], pair_prompts: ['read', 'write', 'sit'], accepted_answers: ['book'], rubric: 'Use the passage.' }
          return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'Practice', items: [item] }) }] } }] }), { status: 200 })
        }
        const generated = await generateCustomQuiz({ sourceText: 'I read a book at my desk.', direction: 'Practice the passage.', requestedCount: 1, requestedType: mode, teachingLanguage: 'English', guidanceLanguage: 'English', levelFramework: framework, levelCode: code })
        assert.ok(prompt.includes(levelInstruction(framework, code)), `${framework}/${mode}: selected level missing from AI prompt`)
        assert.equal(generated.items[0].type, type)
        assert.equal(generated.items[0].points, 100)
      }
    }
  } finally { globalThis.fetch = oldFetch; globalThis.Deno = oldDeno }
})
