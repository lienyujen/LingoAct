import { ChatText, Star } from '@phosphor-icons/react'
import type { ExitTicket, ExitTicketCategory } from '../types'
import { usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'

const categoryLabels: Record<ExitTicketCategory, PresenterMessageKey> = {
  lesson_summary: 'catLessonSummary',
  learning_assessment: 'catLearningAssessment',
  course_satisfaction: 'catCourseSatisfaction',
  student_question: 'catStudentQuestion',
}

type Props = {
  anonymousEnabled: boolean
  category: ExitTicketCategory
  onlineCount: number
  prompt: string
  tickets: ExitTicket[]
}

export function ExitTicketResult({ anonymousEnabled, category, onlineCount, prompt, tickets }: Props) {
  const t = usePresenterText()
  const ratings = tickets.map((ticket) => ticket.rating).filter((rating): rating is number => rating !== null)
  const average = ratings.length ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : 0
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({
    rating,
    count: ratings.filter((value) => value === rating).length,
  }))

  return (
    <section className="panel exit-ticket-result">
      <div className="panel-heading">
        <h2>{t('exitTicketStatus')}</h2>
        <span className="status active">{tickets.length}/{onlineCount || '—'}</span>
      </div>
      <div className="exit-ticket-rating-summary">
        <Star fill="currentColor" size={24} />
        <div><strong>{average ? average.toFixed(1) : '—'}</strong><span>{t('averageLevel')}</span></div>
      </div>
      <div className="rating-distribution" aria-label={t('starDistribution')}>
        {distribution.map((item) => (
          <div key={item.rating}><span>{t('stars', { n: item.rating })}</span><b>{item.count}</b></div>
        ))}
      </div>
      <div className="exit-ticket-response-heading">
        <ChatText size={18} />
        <div><span>{t(categoryLabels[category])}</span><p>{prompt}</p></div>
      </div>
      {tickets.some((ticket) => ticket.response_text) ? (
        <ul className="exit-ticket-response-list">
          {tickets.filter((ticket) => ticket.response_text).map((ticket, index) => (
            <li key={ticket.id}>
              <strong>{anonymousEnabled ? t('anonymousAnswer', { n: index + 1 }) : ticket.participant_name}</strong>
              <span>{ticket.response_text}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">{t('noTextAnswers')}</p>}
    </section>
  )
}
