import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asksForTranslation, isWrittenAssessment, splitWrittenAssessmentPrompt } from '../supabase/functions/_shared/written-assessment.ts'

test('explicit translation prompts keep unrestricted target languages', () => {
  for (const prompt of [
    '請把圖中第二段翻譯成西班牙文。',
    '把这一句翻成阿拉伯语。',
    'Please translate the highlighted sentence into Ukrainian.',
    '画像の文章をスワヒリ語に訳してください。',
  ]) assert.equal(asksForTranslation(prompt), true, prompt)
  for (const prompt of ['請分享自己的想法。', 'Explain why translation is difficult.', '翻譯和口譯有什麼不同？']) {
    assert.equal(asksForTranslation(prompt), false, prompt)
  }
})

test('a labelled teacher rubric is kept separate from the student prompt', () => {
  assert.deepEqual(splitWrittenAssessmentPrompt('把這兩句譯成日語。評分標準：意思 70 分，表達 30 分。'), {
    prompt: '把這兩句譯成日語。', rubric: '意思 70 分，表達 30 分。',
  })
  assert.deepEqual(splitWrittenAssessmentPrompt('Explain the difference.\nGrading criteria: Name both contrasts.'), {
    prompt: 'Explain the difference.', rubric: 'Name both contrasts.',
  })
  assert.deepEqual(splitWrittenAssessmentPrompt('請用「因為」寫一句話。'), {
    prompt: '請用「因為」寫一句話。', rubric: '',
  })
})

test('only an authored single short-answer quiz requests written assessment grading', () => {
  assert.equal(isWrittenAssessment({ requested_type: 'short_answer', graded: true, interaction_mode: true }), true)
  assert.equal(isWrittenAssessment({ requested_type: 'short_answer', graded: true }), false)
  assert.equal(isWrittenAssessment({ requested_type: 'ordering', graded: true, interaction_mode: true }), false)
})
