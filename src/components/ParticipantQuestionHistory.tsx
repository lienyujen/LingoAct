import { useEffect, useMemo, useState } from 'react'
import { CaretDown, CaretUp, CheckCircle, Clock, ClockCounterClockwise, MicrophoneStage } from '@phosphor-icons/react'
import type { ParticipantLocale } from '../lib/participantI18n'
import { participantText } from '../lib/participantI18n'
import { listSeparator, localizedFeedback, localizedFields } from '../lib/localizedContent'
import type { Answer, AudioResponse, ParticipantQuizData, Question, Screenshot } from '../types'

type Props = {
  activeQuestionId?: string | null
  answers: Answer[]
  audioResponses: Record<string, AudioResponse | null>
  loadingQuestionIds: Set<string>
  locale: ParticipantLocale
  onLoadDetails: (question: Question) => Promise<void>
  questions: Question[]
  quizData: Record<string, ParticipantQuizData | null>
  screenshots: Record<string, Screenshot>
}

function answerText(question: Question, answer: Answer, locale: ParticipantLocale) {
  const translation = localizedFields(question.translations, locale)
  const translatedOptions = translation?.options?.length === question.options.length
    ? translation.options
    : question.options
  const display = (value: string) => {
    const index = question.options.indexOf(value)
    return index >= 0 ? translatedOptions[index] : value
  }
  if (answer.answer_values?.length) return answer.answer_values.map(display).join(listSeparator(locale))
  if (answer.answer_value) return display(answer.answer_value)
  return answer.answer_text || ''
}

function questionTitle(question: Question, locale: ParticipantLocale) {
  const translation = localizedFields(question.translations, locale)
  return translation?.prompt_text || translation?.title || question.prompt_text || translation?.title || question.title
}

export function ParticipantQuestionHistory({
  activeQuestionId,
  answers,
  audioResponses,
  loadingQuestionIds,
  locale,
  onLoadDetails,
  questions,
  quizData,
  screenshots,
}: Props) {
  const history = useMemo(() => questions.filter((item) => item.id !== activeQuestionId).slice().reverse(), [activeQuestionId, questions])
  const [sectionExpanded, setSectionExpanded] = useState(true)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const newestId = history[0]?.id || ''

  useEffect(() => {
    if (!newestId) return
    setOpenIds((current) => current.has(newestId) ? current : new Set([newestId]))
  }, [newestId])

  if (!history.length) return null

  async function toggleQuestion(question: Question) {
    const opening = !openIds.has(question.id)
    setOpenIds((current) => {
      const next = new Set(current)
      if (opening) next.add(question.id)
      else next.delete(question.id)
      return next
    })
    if (opening) await onLoadDetails(question)
  }

  return (
    <section className="participant-history-section" aria-label={participantText(locale, 'answeredQuestions')}>
      <div className="participant-history-heading">
        <div><ClockCounterClockwise size={19} /><h2>{participantText(locale, 'answeredQuestions')}</h2></div>
        <button className="ghost-button" type="button" aria-expanded={sectionExpanded} onClick={() => setSectionExpanded((current) => !current)}>
          {sectionExpanded ? <CaretUp size={17} /> : <CaretDown size={17} />}
          {sectionExpanded ? participantText(locale, 'collapseShort') : `${participantText(locale, 'expandShort')} ${history.length}`}
        </button>
      </div>
      {sectionExpanded && (
        <div className="participant-history-list">
          {history.map((question, index) => {
            const open = openIds.has(question.id)
            const answer = answers.find((item) => item.question_id === question.id)
            const screenshot = question.screenshot_id ? screenshots[question.screenshot_id] : null
            const audio = audioResponses[question.id]
            const quiz = quizData[question.id]
            const loading = loadingQuestionIds.has(question.id)
            return (
              <article className="participant-history-item" key={question.id}>
                <button className="participant-history-toggle" type="button" aria-expanded={open} onClick={() => void toggleQuestion(question)}>
                  <span>{participantText(locale, 'questionNumber', { n: history.length - index })}</span>
                  <strong>{questionTitle(question, locale)}</strong>
                  {open ? <CaretUp size={18} /> : <CaretDown size={18} />}
                </button>
                {open && (
                  <div className="participant-history-body">
                    {screenshot && <img alt={participantText(locale, 'dispatchedQuestion')} src={screenshot.public_url} />}
                    {loading && <p className="muted"><Clock size={16} />{participantText(locale, 'loadingYourAnswer')}</p>}
                    {question.type === 'custom_quiz' && quiz?.attempt ? (
                      <div className="participant-history-quiz">
                        <p><CheckCircle size={17} />{participantText(locale, 'submittedScoreLabel')}{quiz.attempt.total_score ?? '-'}/{quiz.attempt.max_score}</p>
                        {quiz.items.map((item, itemIndex) => {
                          const response = quiz.answers.find((entry) => entry.item_id === item.id)
                          const prompt = localizedFields(item.translations, locale)?.prompt_text || item.prompt_text
                          const submitted = response?.answer_values?.join(', ') || response?.answer_text || '-'
                          const feedback = localizedFeedback(response?.feedback, locale)
                          return <div key={item.id}><strong>{itemIndex + 1}. {prompt}</strong><p>{participantText(locale, 'yourAnswerLabel')}{submitted}</p>{feedback && <small>{feedback}</small>}</div>
                        })}
                      </div>
                    ) : question.type === 'pronunciation' || question.type === 'oral_response' ? (
                      audio && <div className="participant-history-audio">
                        <p><MicrophoneStage size={17} />{participantText(locale, 'recordingSubmitted')}{audio.score !== null ? ` · ${audio.score} ${participantText(locale, 'points')}` : ''}</p>
                        {audio.signed_url && <audio controls preload="metadata" src={audio.signed_url} />}
                        {audio.analysis_json?.summary && <p>{localizedFields(audio.analysis_json.translations, locale)?.summary || audio.analysis_json.summary}</p>}
                        {audio.transcript && <small>{participantText(locale, 'transcriptLabel')}{audio.transcript}</small>}
                      </div>
                    ) : answer ? (
                      <p className="participant-history-answer"><CheckCircle size={17} />{participantText(locale, 'yourAnswerLabel')}<strong>{answerText(question, answer, locale)}</strong></p>
                    ) : null}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
