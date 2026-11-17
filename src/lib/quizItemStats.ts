import type { PresenterQuizResults, QuizItemAnswer } from '../types'

export function quizItemStats(results: PresenterQuizResults, itemId: string) {
  const item = results.items.find(entry => entry.id === itemId)
  const answers = new Map(results.answers.filter(answer => answer.item_id === itemId).map(answer => [answer.attempt_id, answer]))
  const students = results.attempts.map((attempt, index) => {
    const answer = answers.get(attempt.id)
    const status: 'missing' | 'pending' | 'correct' | 'partial' | 'incorrect' = !answer ? 'missing'
      : attempt.status !== 'graded' || answer.score === null || !Number.isFinite(answer.score) || !item ? 'pending'
        : answer.score >= item.points ? 'correct' : answer.score > 0 ? 'partial' : 'incorrect'
    return { attempt, index, answer, status }
  })
  return {
    students,
    correct: students.filter(student => student.status === 'correct').length,
    wrong: students.filter(student => student.status === 'partial' || student.status === 'incorrect'),
    pending: students.filter(student => student.status === 'pending').length,
    missing: students.filter(student => student.status === 'missing').length,
  }
}

export function quizAnswerText(answer: QuizItemAnswer | undefined) {
  return answer?.answer_values?.length ? answer.answer_values.join(' → ') : answer?.answer_text || ''
}
