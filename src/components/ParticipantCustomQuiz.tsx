import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowsClockwise, CheckCircle, Clock, PaperPlaneTilt } from '@phosphor-icons/react'
import type { ParticipantLocale } from '../lib/participantI18n'
import { participantText } from '../lib/participantI18n'
import { QuizOrderingInput } from './QuizOrderingInput'
import { QuizMatchingInput } from './QuizMatchingInput'
import { DragAnswers } from './DragAnswers'
import { InteractionReadout } from './InteractionReadout'
import { WritingCoachPanel } from './WritingCoachPanel'
import { RevisedWriting } from './RevisedWriting'
import { localizedFeedback, localizedFields } from '../lib/localizedContent'
import type { ParticipantQuizData } from '../types'

export type QuizSubmission = Array<{ itemId: string; answerText?: string; answerValues?: string[] }>

type Props = {
  data: ParticipantQuizData
  busy: boolean
  locale: ParticipantLocale
  onRetry: () => Promise<void>
  onSubmit: (answers: QuizSubmission, composition: string) => Promise<void>
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
  const [panelTexts, setPanelTexts] = useState<Record<string, string>>({})
  // One chosen option per left-hand item, positionally. Starts empty so an
  // untouched 配對 blocks submission rather than sending a row of first guesses.
  const [matchAnswers, setMatchAnswers] = useState<Record<string, string[]>>({})
  // 寫作教練: the article the fields add up to. Held apart from the answers
  // because it is not the answer to any one of them.
  const [composition, setComposition] = useState('')
  const pictureWriting = data.quiz.requested_type === 'picture_writing'
  const writing = data.quiz.graded === false && !pictureWriting && !data.quiz.interaction_mode
  const coaching = writing && data.quiz.coaching === true
  const usesAiGrading = pictureWriting ? data.quiz.graded : !writing && data.items.some((item) => !['multiple_choice', 'ordering', 'matching'].includes(item.type))
  const composing = writing && data.items.length > 1
  // In field order, which is the order the article should run in.
  const paragraphs = data.items
    .map((item) => (textAnswers[item.id] || '').trim())
    .filter(Boolean)

  useEffect(() => {
    setTextAnswers({})
    setChoiceAnswers({})
    setMatchAnswers({})
    setOrderAnswers({})
    setPanelTexts({})
    setComposition('')
  }, [data.quiz.id])

  const complete = useMemo(() => data.items.every((item) => {
    if (item.type === 'multiple_choice') return Boolean(choiceAnswers[item.id])
    if (item.type === 'ordering') return (orderAnswers[item.id] || (item.sentence_mode ? [] : item.options)).length === item.options.length && (!pictureWriting || item.options.every((value) => Boolean(panelTexts[`${item.id}:${value}`]?.trim())))
    // Every left-hand item needs a choice; a half-finished 配對 is not an answer.
    if (item.type === 'matching') {
      const chosen = matchAnswers[item.id] || []
      return item.pair_prompts.length > 0 && item.pair_prompts.every((_, index) => Boolean(chosen[index]))
    }
    return Boolean(textAnswers[item.id]?.trim())
  }) && (!composing || Boolean(composition.trim())),
  [choiceAnswers, composing, composition, data.items, matchAnswers, orderAnswers, panelTexts, pictureWriting, textAnswers])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!complete || busy) return
    await onSubmit(data.items.map((item) => {
      if (item.type === 'multiple_choice') return { itemId: item.id, answerValues: [choiceAnswers[item.id]] }
      // The sequence itself is the answer, so it travels as ordered values.
      if (item.type === 'ordering') {
        const order = orderAnswers[item.id] || item.options
        return { itemId: item.id, answerValues: order, answerText: pictureWriting ? JSON.stringify(order.map((panelId) => ({ panelId, text: panelTexts[`${item.id}:${panelId}`].trim() }))) : undefined }
      }
      // Positional: the nth value is the choice for the nth left-hand item.
      if (item.type === 'matching') return { itemId: item.id, answerValues: matchAnswers[item.id] || [] }
      return { itemId: item.id, answerText: textAnswers[item.id].trim() }
    }), pictureWriting ? data.items.flatMap((item) => (orderAnswers[item.id] || item.options).map((panelId) => panelTexts[`${item.id}:${panelId}`]?.trim()).filter(Boolean)).join('\n') : composing ? composition.trim() : '')
  }

  if (data.attempt) {
    const graded = data.attempt.status === 'graded'
    const failed = data.attempt.status === 'failed'
    const submitted = data.attempt.status === 'submitted'
    const pictureAnswer = pictureWriting ? data.answers.find((answer) => answer.item_id === data.items[0]?.id) : null
    let pictureSegments: Array<{ panelId: string; text: string }> = []
    try { pictureSegments = JSON.parse(pictureAnswer?.answer_text || '[]') } catch { pictureSegments = [] }
    return (
      <section className="panel participant-question participant-custom-quiz">
        <div className="quiz-status-heading">
          {graded || submitted ? <CheckCircle size={24} /> : failed ? <ArrowsClockwise size={24} /> : <Clock size={24} />}
          <div>
            <h2>{data.quiz.title}</h2>
            <p>{participantText(locale, submitted
              ? data.quiz.interaction_mode ? 'submittedAnswer' : 'writingSubmitted'
              : graded ? 'gradingCompleted' : failed ? 'gradingInterrupted' : usesAiGrading ? 'gradingInBackground' : 'calculatingScore')}</p>
          </div>
          {graded && <strong className="quiz-total-score">{data.attempt.total_score}/{data.attempt.max_score}</strong>}
        </div>
        {data.attempt.feedback && <p className="quiz-overall-feedback">{localizedFeedback(data.attempt.feedback, locale)}</p>}
        {pictureWriting && pictureSegments.length > 0 && (
          <div className="participant-picture-writing-review">
            {pictureSegments.map((segment, index) => {
              const item = data.items[0]
              const image = item?.option_images[item.options.indexOf(segment.panelId)] || ''
              return <article key={segment.panelId}><div><b>{index + 1}</b><img alt="" src={image} /></div><p>{segment.text}</p></article>
            })}
          </div>
        )}
        {/* The corrected article laid over their own, once the teacher has run
            the AI over it. This is the point of getting it back at all: seeing
            what was added and what it replaced is how the next draft is
            better. Their own untouched sentences stay plain, so the first thing
            they see is how much was already right. */}
        {submitted && data.attempt.composition && (
          <article className="quiz-graded-item writing-composition-result">
            <div><strong>{participantText(locale, 'composeHeading')}</strong></div>
            {data.attempt.revision?.zh_tw ? (
              <RevisedWriting
                labels={{
                  added: participantText(locale, 'revisionAdded'),
                  removed: participantText(locale, 'revisionRemoved'),
                  unchanged: participantText(locale, 'revisionUnchanged'),
                  notesHeading: participantText(locale, 'revisionNotes'),
                }}
                notes={data.attempt.revision.notes}
                original={data.attempt.composition}
                revised={data.attempt.revision.zh_tw}
              />
            ) : (
              <>
                <p className="quiz-written-back">{data.attempt.composition}</p>
                <p className="muted">{participantText(locale, 'revisionPending')}</p>
              </>
            )}
          </article>
        )}
        {submitted && data.items.map((item, index) => {
          const response = data.answers.find((answer) => answer.item_id === item.id)
          const translation = localizedFields(item.translations, locale)
          return (
            <article className="quiz-graded-item" key={item.id}>
              <div><strong>{index + 1}. {translation?.prompt_text || item.prompt_text}</strong></div>
              <p className="quiz-written-back">{response?.answer_text}</p>
              {data.quiz.interaction_mode && <InteractionReadout item={item} values={response?.answer_values || []} />}
              {/* Written back to them, not only to the teacher's panel: notes
                  the student never reads are notes nobody acts on. */}
              {response?.feedback && (
                <p className="quiz-field-feedback">{localizedFeedback(response.feedback, locale)}</p>
              )}
            </article>
          )
        })}
        {graded && !pictureWriting && data.items.map((item, index) => {
          const response = data.answers.find((answer) => answer.item_id === item.id)
          const translation = localizedFields(item.translations, locale)
          return (
            <article className="quiz-graded-item" key={item.id}>
              <div><strong>{index + 1}. {translation?.prompt_text || item.prompt_text}</strong><span>{response?.score ?? 0}/{item.points}</span></div>
              <p>{localizedFeedback(response?.feedback, locale)}</p>
              {data.quiz.interaction_mode && <InteractionReadout item={item} values={response?.answer_values || []} />}
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
      {!data.quiz.interaction_mode && <p className="muted">{writing
        ? participantText(locale, coaching ? 'coachIntro' : 'writingHint')
        : usesAiGrading
          ? participantText(locale, 'quizHintAi')
          : participantText(locale, 'quizHintKey')}</p>}
      <form className="custom-quiz-form" onSubmit={submit}>
        {data.items.map((item, index) => {
          const translation = localizedFields(item.translations, locale)
          const options = translation?.options?.length === item.options.length ? translation.options : item.options
          return (
            <fieldset className="custom-quiz-item" key={item.id}>
              <legend><span>{index + 1}</span>{translation?.prompt_text || item.prompt_text}{!writing && data.quiz.graded && <small>{item.points} {participantText(locale, 'points')}</small>}</legend>
              {item.type === 'multiple_choice' ? (
                <div className="quiz-choice-list">
                  {item.options.map((option, optionIndex) => (
                    <label className={choiceAnswers[item.id] === option ? 'selected' : ''} key={option}>
                      <input checked={choiceAnswers[item.id] === option} name={item.id} type="radio" value={option} onChange={() => setChoiceAnswers((current) => ({ ...current, [item.id]: option }))} />
                      <span>{options[optionIndex]}</span>
                    </label>
                  ))}
                </div>
              ) : data.quiz.interaction_mode && ['ordering', 'matching'].includes(item.type) ? (
                <DragAnswers mode={item.type === 'matching' ? 'matching' : item.sentence_mode ? 'sentence' : 'ordering'} options={item.options} labels={options} images={item.option_images} prompts={item.pair_prompts} locale={locale} disabled={busy}
                  values={item.type === 'matching' ? matchAnswers[item.id] || [] : orderAnswers[item.id] || (item.sentence_mode ? [] : item.options)}
                  onChange={next => item.type === 'matching' ? setMatchAnswers(v => ({ ...v, [item.id]: next })) : setOrderAnswers(v => ({ ...v, [item.id]: next }))} />
              ) : item.type === 'ordering' ? (
                <QuizOrderingInput
                  images={item.option_images?.length === item.options.length
                    ? (orderAnswers[item.id] || item.options).map((value) => item.option_images[item.options.indexOf(value)])
                    : undefined}
                  labels={(orderAnswers[item.id] || item.options).map((value) => options[item.options.indexOf(value)] ?? value)}
                  locale={locale}
                  textByValue={pictureWriting ? Object.fromEntries(item.options.map((value) => [value, panelTexts[`${item.id}:${value}`] || ''])) : undefined}
                  values={orderAnswers[item.id] || item.options}
                  onChange={(next) => setOrderAnswers((current) => ({ ...current, [item.id]: next }))}
                  onTextChange={pictureWriting ? (value, text) => setPanelTexts((current) => ({ ...current, [`${item.id}:${value}`]: text })) : undefined}
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
        {/* The fields were the way in; this is the writing. Pasting the
            paragraphs is offered rather than done automatically — filling the
            box for them once they have started editing would throw away the
            joining work, which is the part being taught. */}
        {composing && (
          <fieldset className="custom-quiz-item writing-composition">
            <legend><span>✓</span>{participantText(locale, 'composeHeading')}</legend>
            <p className="muted">{participantText(locale, 'composeHint')}</p>
            <textarea
              maxLength={12000}
              placeholder={participantText(locale, 'composePlaceholder')}
              rows={10}
              value={composition}
              onChange={(event) => setComposition(event.target.value)}
            />
            <button
              className="compose-fill"
              disabled={!paragraphs.length}
              type="button"
              onClick={() => setComposition(paragraphs.join('\n\n'))}
            >
              {participantText(locale, composition.trim() ? 'composeRefill' : 'composeFill')}
            </button>
          </fieldset>
        )}
        <button disabled={!complete || busy} type="submit"><PaperPlaneTilt size={18} />{participantText(locale, busy ? 'submitting' : 'submitAnswers')}</button>
      </form>
    </section>
  )
}
