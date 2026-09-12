import type { ParticipantQuizData } from '../types'

// A successful HTTP response may still mean that the quiz is being prepared.
// Keep that sentinel (and stale responses for another question) out of render state.
export function participantQuizPayload(value: unknown, questionId: string): ParticipantQuizData | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Partial<ParticipantQuizData>
  if (!data.quiz || data.quiz.question_id !== questionId || typeof data.quiz.requested_type !== 'string'
    || !Array.isArray(data.items) || !Array.isArray(data.answers)) return null
  return data as ParticipantQuizData
}
