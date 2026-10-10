// Older question rows encode generation failure in their localized title.
// Recognize every deployed spelling so a failed job cannot poll forever.
export function quizGenerationFailed(title: unknown) {
  return typeof title === 'string' && new Set([
    '出題失敗，請重新派送', '出题失败，请重新发送',
    'Question generation failed. Please try again.',
    'Question generation failed. Please send it again.',
  ]).has(title)
}
