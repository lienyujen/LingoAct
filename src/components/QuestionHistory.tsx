import { ArrowCounterClockwise, CaretDown, CaretUp, ClockCounterClockwise } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import type { Question } from '../types'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  questions: Question[]
  activeQuestionId: string | null
  selectedQuestionId: string | null
  answerCounts: Record<string, number>
  onSelect: (questionId: string) => void
}

export function QuestionHistory({
  questions,
  activeQuestionId,
  selectedQuestionId,
  answerCounts,
  onSelect,
}: Props) {
  const t = usePresenterText()
  const [open, setOpen] = useState(false)
  const history = useMemo(
    () => questions
      .map((question, index) => ({ question, number: index + 1 }))
      .filter(({ question }) => question.id !== activeQuestionId)
      .reverse(),
    [activeQuestionId, questions],
  )

  if (!history.length) return null

  return (
    <section className="panel question-history">
      <button
        aria-expanded={open}
        className="question-history-toggle"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <ClockCounterClockwise size={17} />
        <span>{t('pastQuestions')}</span>
        <strong>{history.length}</strong>
        {open ? <CaretUp size={17} /> : <CaretDown size={17} />}
      </button>

      {open && (
        <div className="question-history-list">
          {selectedQuestionId !== activeQuestionId && activeQuestionId && (
            <button className="question-history-return" type="button" onClick={() => onSelect(activeQuestionId)}>
              <ArrowCounterClockwise size={15} />{t('backToCurrent')}
            </button>
          )}
          {history.map(({ question, number }) => (
            <button
              className={`question-history-item ${selectedQuestionId === question.id ? 'selected' : ''}`}
              key={question.id}
              type="button"
              onClick={() => onSelect(question.id)}
            >
              <span>{t('questionNumber', { n: number })}</span>
              <strong>{question.prompt_text || question.title}</strong>
              <small>{t('answerCount', { n: answerCounts[question.id] || 0 })}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
