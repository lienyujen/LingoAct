import type { PresenterQuizResults } from '../types'
import { usePresenterLocale, usePresenterText } from '../lib/presenterI18n'
import { classroomMessage } from '../lib/classroomMessages'
import { quizAnswerText, quizItemStats } from '../lib/quizItemStats'

export function QuizItemResponses({ results, itemId, anonymousEnabled }: { results: PresenterQuizResults; itemId: string; anonymousEnabled: boolean }) {
  const locale = usePresenterLocale(), t = usePresenterText()
  const stats = quizItemStats(results, itemId)
  const item = results.items.find(entry => entry.id === itemId)
  return <div className="quiz-item-responses">
    <p className="muted">{classroomMessage(locale, 'itemStats', { correct: stats.correct, wrong: stats.wrong.length, pending: stats.pending, missing: stats.missing })}</p>
    {stats.wrong.length > 0 && <details>
      <summary>{classroomMessage(locale, 'needsSupport', { n: stats.wrong.length })}</summary>
      <ul>{stats.wrong.map(student => <li key={student.attempt.id}>{anonymousEnabled ? t('anonymousStudent', { n: student.index + 1 }) : student.attempt.participant_name}</li>)}</ul>
    </details>}
    {stats.students.length > 0 && <details>
      <summary>{classroomMessage(locale, 'studentAnswers', { n: stats.students.length })}</summary>
      <div className="quiz-item-student-list">{stats.students.map(student => <article key={student.attempt.id}>
        <header><strong>{anonymousEnabled ? t('anonymousStudent', { n: student.index + 1 }) : student.attempt.participant_name}</strong>
          <span>{classroomMessage(locale, student.status === 'missing' ? 'noAnswer' : student.status)}{student.answer?.score !== null && student.answer?.score !== undefined && ` · ${student.answer.score}/${item?.points ?? '—'}`}</span></header>
        {student.answer && <p>{quizAnswerText(student.answer) || classroomMessage(locale, 'noAnswer')}</p>}
        {student.answer?.feedback && <p className="muted">{locale === 'en' ? student.answer.feedback.en || student.answer.feedback.zh_tw : student.answer.feedback.zh_tw || student.answer.feedback.en}</p>}
      </article>)}</div>
    </details>}
  </div>
}
