import type { ParticipantQuizData } from '../types'

const itemTypes = new Set(['multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching'])
const strings = (value: unknown) => Array.isArray(value) && value.every(entry => typeof entry === 'string')

// A successful HTTP response may still mean that the quiz is being prepared.
// Keep that sentinel (and stale responses for another question) out of render state.
export function participantQuizPayload(value: unknown, questionId: string): ParticipantQuizData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<ParticipantQuizData>
  if (!data.quiz || data.quiz.question_id !== questionId || typeof data.quiz.requested_type !== 'string'
    || !Array.isArray(data.items) || !Array.isArray(data.answers)) return null
  // Checking only the outer arrays allowed a null item or object-valued prompt
  // to reach React and crash a whole classroom screen.
  if (data.items.some(item => !item || typeof item !== 'object'
    || typeof item.id !== 'string' || typeof item.prompt_text !== 'string' || !itemTypes.has(item.type)
    || !strings(item.options) || (item.pair_prompts != null && !strings(item.pair_prompts)))) return null
  if (data.answers.some(answer => !answer || typeof answer !== 'object'
    || typeof answer.item_id !== 'string'
    || (answer.answer_text != null && typeof answer.answer_text !== 'string')
    || (answer.answer_values != null && !strings(answer.answer_values)))) return null
  return data as ParticipantQuizData
}
