import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowsClockwise, CheckCircle, Clock, PaperPlaneTilt } from '@phosphor-icons/react'
import type { ParticipantLocale } from '../lib/participantI18n'
import { participantText } from '../lib/participantI18n'
import { QuizOrderingInput } from './QuizOrderingInput'
import { QuizMatchingInput } from './QuizMatchingInput'
import { WritingCoachPanel } from './WritingCoachPanel'
import { localizedFeedback, localizedFields } from '../lib/localizedContent'
import type { ParticipantQuizData } from '../types'

export type QuizSubmission = Array<{ itemId: string; answerText?: string; answerValues?: string[] }>

type Props = {
  data: ParticipantQuizData
  busy: boolean
  locale: ParticipantLocale
  onRetry: () => Promise<void>
  onSubmit: (answers: QuizSubmission) => Promise<void>
  onAskCoach: (itemId: string, draft: string) => Promise<void>
}

// Mirrors COACH_ROUNDS in the participant Edge Function, which is where the
// limit is actually enforced; this only decides what the button says.
const COACH_ROUNDS = 3

export function ParticipantCustomQuiz({ data, busy, locale, onRetry, onSubmit, onAskCoach }: Props) {
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({})
  const [choiceAnswers, setChoiceAnswers] = useState<Record<string, string>>({})
  // Seeded from the shuffled fragments the server sent, so an untouched item is
  // still a submittable (probably wrong) answer rather than a blocked form.
  const [orderAnswers, setOrderAnswers] = useState<Record<string, string[]>>({})
  // One chosen option per left-hand item, positionally. Starts empty so an
  // untouched 配對 blocks submission rather than sending a row of first guesses.
  const [matchAnswers, setMatchAnswers] = useState<Record<string, string[]>>({})
  const writing = data.quiz.graded === false
  const coaching = writing && data.quiz.coaching === true
  const usesAiGrading = !writing && data.items.some((item) => item.type !== 'multiple_choice')

  useEffect(() => {
    setTextAnswers({})
    setChoiceAnswers({})
    setMatchAnswers({})
  }, [data.quiz.id])

  const complete = useMemo(() => data.items.every((item) => {
    if (item.type === 'multiple_choice') return Boolean(choiceAnswers[item.id])
    if (item.type === 'ordering') return (orderAnswers[item.id] || item.options).length === item.options.length
    // Every left-hand item needs a choice; a half-finished 配對 is not an answer.
    if (item.type === 'matching') {
      const chosen = matchAnswers[item.id] || []
      return item.pair_prompts.length > 0 && item.pair_prompts.every((_, index) => Boolean(chosen[index]))
    }
    return Boolean(textAnswers[item.id]?.trim())
  }), [choiceAnswers, data.items, matchAnswers, orderAnswers, textAnswers])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!complete || busy) return
    await onSubmit(data.items.map((item) => {
      if (item.type === 'multiple_choice') return { itemId: item.id, answerValues: [choiceAnswers[item.id]] }
      // The sequence itself is the answer, so it travels as ordered values.
      if (item.type === 'ordering') return { itemId: item.id, answerValues: orderAnswers[item.id] || item.options }
      // Positional: the nth value is the choice for the nth left-hand item.
      if (item.type === 'matching') return { itemId: item.id, answerValues: matchAnswers[item.id] || [] }
      return { itemId: item.id, answerText: textAnswers[item.id].trim() }
    }))
  }

  if (data.attempt) {
    const graded = data.attempt.status === 'graded'
    const failed = data.attempt.status === 'failed'
    const submitted = data.attempt.status === 'submitted'
    return (
      <section className="panel participant-question participant-custom-quiz">
        <div className="quiz-status-heading">
          {graded || submitted ? <CheckCircle size={24} /> : failed ? <ArrowsClockwise size={24} /> : <Clock size={24} />}
          <div>
            <h2>{data.quiz.title}</h2>
            <p>{participantText(locale, submitted
              ? 'writingSubmitted'
              : graded ? 'gradingCompleted' : failed ? 'gradingInterrupted' : usesAiGrading ? 'gradingInBackground' : 'calculatingScore')}</p>
          </div>
          {graded && <strong className="quiz-total-score">{data.attempt.total_score}/{data.attempt.max_score}</strong>}
        </div>
        {data.attempt.feedback && <p className="quiz-overall-feedback">{localizedFeedback(data.attempt.feedback, locale)}</p>}
        {submitted && data.items.map((item, index) => {
          const response = data.answers.find((answer) => answer.item_id === item.id)
          const translation = localizedFields(item.translations, locale)
          return (
            <article className="quiz-graded-item" key={item.id}>
              <div><strong>{index + 1}. {translation?.prompt_text || item.prompt_text}</strong></div>
              <p className="quiz-written-back">{response?.answer_text}</p>
            </article>
          )
        })}
        {graded && data.items.map((item, index) => {
          const response = data.answers.find((answer) => answer.item_id === item.id)
          const translation = localizedFields(item.translations, locale)
          return (
            <article className="quiz-graded-item" key={item.id}>
              <div><strong>{index + 1}. {translation?.prompt_text || item.prompt_text}</strong><span>{response?.score ?? 0}/{item.points}</span></div>
              <p>{localizedFeedback(response?.feedback, locale)}</p>
            </article>
          )
        })}
        {failed && <button disabled={busy} type="button" onClick={() => void onRetry()}><ArrowsClockwise size={18} />{participantText(locale, 'retryGrading')}</button>}
      </section>
    )
  }

  return (
    <section className="panel participant-question participant-custom-quiz">
      <h2>{data.quiz.title}</h2>
      <p className="muted">{writing
        ? participantText(locale, coaching ? 'coachIntro' : 'writingHint')
        : usesAiGrading
          ? participantText(locale, 'quizHintAi')
          : participantText(locale, 'quizHintKey')}</p>
      <form className="custom-quiz-form" onSubmit={submit}>
        {data.items.map((item, index) => {
          const translation = localizedFields(item.translations, locale)
          const options = translation?.options?.length === item.options.length ? translation.options : item.options
          return (
            <fieldset className="custom-quiz-item" key={item.id}>
              <legend><span>{index + 1}</span>{translation?.prompt_text || item.prompt_text}{!writing && <small>{item.points} {participantText(locale, 'points')}</small>}</legend>
              {item.type === 'multiple_choice' ? (
                <div className="quiz-choice-list">
                  {item.options.map((option, optionIndex) => (
                    <label className={choiceAnswers[item.id] === option ? 'selected' : ''} key={option}>
                      <input checked={choiceAnswers[item.id] === option} name={item.id} type="radio" value={option} onChange={() => setChoiceAnswers((current) => ({ ...current, [item.id]: option }))} />
                      <span>{options[optionIndex]}</span>
                    </label>
                  ))}
                </div>
              ) : item.type === 'ordering' ? (
                <QuizOrderingInput
                  images={item.option_images?.length === item.options.length
                    ? (orderAnswers[item.id] || item.options).map((value) => item.option_images[item.options.indexOf(value)])
                    : undefined}
                  labels={(orderAnswers[item.id] || item.options).map((value) => options[item.options.indexOf(value)] ?? value)}
                  locale={locale}
                  values={orderAnswers[item.id] || item.options}
                  onChange={(next) => setOrderAnswers((current) => ({ ...current, [item.id]: next }))}
                />
              ) : item.type === 'matching' ? (
                <QuizMatchingInput
                  locale={locale}
                  optionLabels={options}
                  options={item.options}
                  pairPrompts={item.pair_prompts}
                  promptLabels={translation?.pair_prompts?.length === item.pair_prompts.length
                    ? translation.pair_prompts
                    : item.pair_prompts}
                  values={matchAnswers[item.id] || []}
                  onChange={(next) => setMatchAnswers((current) => ({ ...current, [item.id]: next }))}
                />
              ) : item.type === 'fill_blank' ? (
                <input value={textAnswers[item.id] || ''} onChange={(event) => setTextAnswers((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={participantText(locale, 'quizFillPlaceholder')} />
              ) : (
                <textarea maxLength={4000} value={textAnswers[item.id] || ''} onChange={(event) => setTextAnswers((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={participantText(locale, 'quizShortPlaceholder')} />
              )}
              {coaching && (
                <WritingCoachPanel
                  draft={textAnswers[item.id] || ''}
                  locale={locale}
                  maxRounds={COACH_ROUNDS}
                  turns={(data.coachTurns || []).filter((turn) => turn.item_id === item.id)}
                  onAsk={() => onAskCoach(item.id, (textAnswers[item.id] || '').trim())}
                />
              )}
            </fieldset>
          )
        })}
        <button disabled={!complete || busy} type="submit"><PaperPlaneTilt size={18} />{participantText(locale, busy ? 'submitting' : 'submitAnswers')}</button>
      </form>
    </section>
  )
}
