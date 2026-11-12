import type { Question } from '../types'

// A plain screenshot supplements the response activity. Never revive a stopped
// assignment or mistake a persistent discussion board for the answer form.
export function screenDispatchQuestion(current: Question | null, questions: Question[]) {
  if (current?.type !== 'send_screen') return current
  return questions.filter(item => item.status === 'active'
    && !['send_screen', 'board'].includes(item.type))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || current
}

export function supportingScreenQuestion(current: Question | null, questions: Question[]) {
  return questions.filter(item => item.type === 'send_screen' && item.status !== 'draft'
    && item.share_screenshot !== false && item.id !== current?.id
    && (!current || item.created_at >= current.created_at))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] || null
}
