import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowsOut, Brain, Check, CircleNotch, Clock, FloppyDisk, Play, Plus, Sparkle, Square, Trash, X } from '@phosphor-icons/react'
import type { PresenterQuizResults, Question, QuizItemAnswer } from '../types'
import { usePresenterText } from '../lib/presenterI18n'
import { RevisedWriting } from './RevisedWriting'

type Props = {
  anonymousEnabled: boolean
  question: Question
  results: PresenterQuizResults | null
  onlineCount: number
  isCurrentQuestion: boolean
  onUpdateAnswer: (itemId: string, acceptedAnswers: string[]) => Promise<void>
  // 寫作教練 only: read one student's writing and leave feedback on it.
  onReviewWriting: (attemptId: string, force: boolean) => Promise<void>
  // 單字卡 only: drop a card, or ask for more from the same screenshot.
  onEditDeck: (input: { removeItemId?: string; addCount?: number }) => Promise<void>
  onActivateQuestion: (questionId: string) => Promise<void>
  // The same pair the plain question panel carries, for the same reason: a
  // quiz is stopped and reopened where it is shown, not from 課堂收尾.
  onStopQuestion: () => Promise<void>
  onResumeQuestion: () => Promise<void>
}

export type QuizReviewProps = {
  // Hidden by default: the presenter reviews these on a screen the class can see.
  showAnswers: boolean
  // A writing exercise has no answer key to reveal or correct, so the review
  // list becomes a plain reading of the fields the class was given.
  writing: boolean
  busyItemId: string
  draftAnswers: Record<string, string>
  results: PresenterQuizResults
  onDraftChange: (itemId: string, value: string) => void
  onUpdateAnswer: (itemId: string, acceptedAnswers: string[]) => Promise<void>
}

function acceptedAnswersFor(results: PresenterQuizResults, itemId: string) {
  return results.keys.find((key) => key.item_id === itemId)?.accepted_answers || []
}

export function QuizAnswerEditor({ showAnswers, writing, busyItemId, draftAnswers, results, onDraftChange, onUpdateAnswer }: QuizReviewProps) {
  const t = usePresenterText()
  return (
    <div className="presenter-quiz-review-list">
      {results.items.map((item, index) => {
        const acceptedAnswers = acceptedAnswersFor(results, item.id)
        return (
          <article className="presenter-quiz-review-item" key={item.id}>
            <div className="presenter-quiz-question-heading">
              <span>{index + 1}</span>
              <strong>{item.prompt_text}</strong>
              {!writing && <small>{t('points', { n: item.points })}</small>}
            </div>
            {writing ? null : item.type === 'matching' ? (
              !showAnswers ? (
                <p className="muted presenter-answer-hidden">{t('matchingAnswerHidden')}</p>
              ) : (
                <div className="presenter-quiz-pairs">
                  {item.pair_prompts.map((prompt, pairIndex) => (
                    <div className="presenter-quiz-pair" key={prompt}>
                      <span>{prompt}</span>
                      <strong>{acceptedAnswers[pairIndex] || '—'}</strong>
                    </div>
                  ))}
                </div>
              )
            ) : item.option_images?.length === item.options.length && item.options.length > 0 ? (
              // 圖片排序. There is no reference answer to type here — the
              // sequence is the answer, and it only means anything as pictures.
              !showAnswers ? (
                <p className="muted presenter-answer-hidden">{t('orderAnswerHidden')}</p>
              ) : (
                <ol className="presenter-quiz-panels">
                  {acceptedAnswers.map((value, panelIndex) => (
                    <li key={value}>
                      <span>{panelIndex + 1}</span>
                      <img alt="" src={item.option_images[item.options.indexOf(value)]} />
                    </li>
                  ))}
                </ol>
              )
            ) : item.type === 'multiple_choice' ? (
              <div className="presenter-quiz-options">
                {item.options.map((option) => {
                  const selected = showAnswers && acceptedAnswers.includes(option)
                  return (
                    <button
                      className={selected ? 'selected' : ''}
                      disabled={busyItemId === item.id}
                      key={option}
                      type="button"
                      onClick={() => void onUpdateAnswer(item.id, [option])}
                    >
                      <span className="presenter-answer-marker">{selected && <Check size={16} />}</span>
                      <span>{option}</span>
                    </button>
                  )
                })}
              </div>
            ) : !showAnswers ? (
              <p className="muted presenter-answer-hidden">{t('referenceAnswerHidden')}</p>
            ) : (
              <div className="presenter-reference-answer">
                <label htmlFor={`quiz-key-${item.id}`}>{t('referenceAnswerLabel')}</label>
                <textarea
                  id={`quiz-key-${item.id}`}
                  value={draftAnswers[item.id] ?? acceptedAnswers.join('\n')}
                  onChange={(event) => onDraftChange(item.id, event.target.value)}
                />
                <button
                  disabled={busyItemId === item.id || !(draftAnswers[item.id] ?? acceptedAnswers.join('\n')).trim()}
                  type="button"
                  onClick={() => void onUpdateAnswer(item.id, (draftAnswers[item.id] ?? acceptedAnswers.join('\n')).split('\n').map((answer) => answer.trim()).filter(Boolean))}
                >
                  <FloppyDisk size={16} />{t('saveReferenceAnswer')}
                </button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

export function CustomQuizResult({ anonymousEnabled, question, results, onlineCount, isCurrentQuestion, onUpdateAnswer, onReviewWriting, onEditDeck, onActivateQuestion, onStopQuestion, onResumeQuestion }: Props) {
  const t = usePresenterText()
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [busyItemId, setBusyItemId] = useState('')
  const [reviewingId, setReviewingId] = useState('')
  const [reviewProgress, setReviewProgress] = useState({ done: 0, total: 0 })
  const [deckBusy, setDeckBusy] = useState('')
  const [deckError, setDeckError] = useState('')

  async function runDeck(label: string, input: { removeItemId?: string; addCount?: number }) {
    setDeckBusy(label)
    setDeckError('')
    try {
      await onEditDeck(input)
    } catch (caught) {
      setDeckError(caught instanceof Error ? caught.message : t('deckEditFailed'))
    } finally {
      setDeckBusy('')
    }
  }
  async function runActivateDeck() {
    setDeckBusy('activate')
    setDeckError('')
    try {
      await onActivateQuestion(question.id)
    } catch (caught) {
      setDeckError(caught instanceof Error ? caught.message : t('actionFailed'))
    } finally {
      setDeckBusy('')
    }
  }
  const [error, setError] = useState('')
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  // Off by default: this panel is on the screen the class is looking at.
  const [showAnswers, setShowAnswers] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expanded])

  if (!results) {
    return <section className="panel result-panel"><p className="muted">{t('loadingQuiz')}</p></section>
  }
  if (!results.quiz) {
    return <section className="panel result-panel"><p className="muted">{t('quizGenerating')}</p></section>
  }
  // 寫作教練 is not marked, so a missing score means there was never one to
  // wait for. Everything below that reads as scoring is switched off rather
  // than left showing dashes and a stuck "評分中" count.
  const flashcard = results.quiz.requested_type === 'flashcard'
  const pictureOrdering = results.quiz.requested_type === 'picture_ordering'
  const coaching = results.quiz.coaching === true
  const coachTurns = results.coachTurns || []
  const unreviewed = results.attempts.filter((attempt) => !attempt.feedback?.zh_tw)

  async function reviewOne(attemptId: string, force: boolean) {
    setReviewingId(attemptId)
    setError('')
    try {
      await onReviewWriting(attemptId, force)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('markFailed'))
    } finally {
      setReviewingId('')
    }
  }

  // One request per student rather than one for the class: thirty pieces of
  // writing in a single call would outlive the function that sent it.
  async function reviewAll() {
    setReviewingId('all')
    setError('')
    const pending = [...unreviewed]
    for (const [index, attempt] of pending.entries()) {
      setReviewProgress({ done: index, total: pending.length })
      try {
        await onReviewWriting(attempt.id, false)
      } catch {
        // Recorded against that student; the rest of the class still gets read.
      }
    }
    setReviewProgress({ done: 0, total: 0 })
    setReviewingId('')
  }
  // Sorted by round rather than by insert order: the history is only legible
  // read forwards, first draft first.
  function turnsFor(participantId: string, itemId: string) {
    return coachTurns
      .filter((turn) => turn.participant_id === participantId && turn.item_id === itemId)
      .sort((a, b) => a.round - b.round)
  }
  function roundsFor(participantId: string) {
    return coachTurns.filter((turn) => turn.participant_id === participantId).length
  }
  // 寫作教練 and a deck are both ungraded, but for different reasons and with
  // different things worth showing, so they are not one branch.
  const writing = results.quiz.graded === false && !flashcard
  const graded = results.attempts.filter((attempt) => attempt.status === 'graded')
  const grading = results.attempts.filter((attempt) => attempt.status === 'grading')
  const average = graded.length
    ? graded.reduce((sum, attempt) => sum + (attempt.total_score || 0), 0) / graded.length
    : null
  const answersByAttempt = new Map<string, QuizItemAnswer[]>()
  for (const answer of results.answers) {
    const list = answersByAttempt.get(answer.attempt_id)
    if (list) list.push(answer)
    else answersByAttempt.set(answer.attempt_id, [answer])
  }
  const itemPosition = new Map(results.items.map((item) => [item.id, item.position]))

  // Right at the first attempt is what a drill is actually measuring: not
  // whether the deck was finished — everyone finishes, that is the design —
  // but how much of it the student already knew.
  const triesByAttempt = new Map<string, typeof results.tries>()
  for (const attemptTry of results.tries || []) {
    const list = triesByAttempt.get(attemptTry.attempt_id)
    if (list) list.push(attemptTry)
    else triesByAttempt.set(attemptTry.attempt_id, [attemptTry])
  }
  function firstTryRight(attemptId: string) {
    const list = [...(triesByAttempt.get(attemptId) || [])]
      .sort((a, b) => Date.parse(a.tried_at) - Date.parse(b.tried_at))
    const firstSeen = new Set<string>()
    let right = 0
    for (const attemptTry of list) {
      if (firstSeen.has(attemptTry.item_id)) continue
      firstSeen.add(attemptTry.item_id)
      if (attemptTry.correct) right += 1
    }
    return right
  }
  // Which cards the class keeps missing, which is the card to reteach.
  const missesByItem = new Map<string, number>()
  for (const attemptTry of results.tries || []) {
    if (attemptTry.correct) continue
    missesByItem.set(attemptTry.item_id, (missesByItem.get(attemptTry.item_id) || 0) + 1)
  }
  const itemPrompt = new Map(results.items.map((item) => [item.id, item.prompt_text]))

  const stoppable = isCurrentQuestion && question.status === 'active'
  const resumable = isCurrentQuestion && question.status === 'stopped'

  async function toggleAnswering() {
    setToggling(true)
    setError('')
    try {
      await (resumable ? onResumeQuestion() : onStopQuestion())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionFailed'))
    } finally {
      setToggling(false)
    }
  }

  async function updateAnswer(itemId: string, acceptedAnswers: string[]) {
    setBusyItemId(itemId)
    setError('')
    try {
      await onUpdateAnswer(itemId, acceptedAnswers)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('answerUpdateFailed'))
    } finally {
      setBusyItemId('')
    }
  }

  const reviewProps: QuizReviewProps = {
    showAnswers,
    writing,
    busyItemId,
    draftAnswers,
    results,
    onDraftChange: (itemId, value) => setDraftAnswers((current) => ({ ...current, [itemId]: value })),
    onUpdateAnswer: updateAnswer,
  }

  function openExpandedReview() {
    if (window.lingoActDesktop) {
      void window.lingoActDesktop.openCustomQuizReview(question.session_id, question.id)
      return
    }
    setExpanded(true)
  }

  return (
    <section className="panel result-panel custom-quiz-result">
      <div className="result-heading">
        <div><p className="eyebrow"><Brain size={17} />{writing ? t('writingCoachShort') : flashcard ? t('flashcards') : pictureOrdering ? t('storyOrdering') : t('typeCustomQuiz')}</p><h2>{results.quiz.title || question.title}</h2></div>
        <div className="custom-quiz-heading-actions">
          <span>{t('answeredOf', { n: results.attempts.length, online: onlineCount })}</span>
          {(stoppable || resumable) && (
            <button
              className={resumable ? 'question-answering-toggle is-resume' : 'question-answering-toggle'}
              disabled={toggling}
              title={resumable ? t('resumeHint') : t('stopHint')}
              type="button"
              onClick={() => void toggleAnswering()}
            >
              {resumable ? <Play size={15} weight="fill" /> : <Square size={15} />}
              {resumable ? t('resumeAnswering') : t('stopAnswering')}
            </button>
          )}
          <button aria-label={t('expandQuiz')} className="icon-button" title={t('expandQuiz')} type="button" onClick={openExpandedReview}><ArrowsOut size={20} /></button>
        </div>
      </div>
      <div className="quiz-result-stats">
        <div><strong>{results.items.length}</strong><span>{writing ? t('fieldCount') : flashcard ? t('cardCount') : t('itemCount')}</span></div>
        {writing || flashcard
          ? <div><strong>{results.attempts.length}</strong><span>{flashcard ? t('practising') : t('collected')}</span></div>
          : <>
              <div><strong>{average === null ? '—' : average.toFixed(1)}</strong><span>{t('averageScore')}</span></div>
              <div><strong>{grading.length}</strong><span>{t('grading')}</span></div>
            </>}
      </div>
      {!writing && !flashcard && (
        <label className="show-answers-toggle">
          <input checked={showAnswers} type="checkbox" onChange={(event) => setShowAnswers(event.target.checked)} />
          {t('showAnswersToggle')}
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {!flashcard && <div className="presenter-quiz-inline-review"><QuizAnswerEditor {...reviewProps} /></div>}
      {/* The deck the AI produced is a first draft; the teacher is the one who
          knows which words this class actually needs. Removing is immediate,
          adding goes back to the same screenshot and avoids what is already
          there. Both re-cut the 標音, because a new card brings new characters. */}
      {flashcard && (
        <div className="deck-size-bar">
          <span>{t('deckHasN', { n: results.items.length })}</span>
          <div className="deck-size-actions">
            {!isCurrentQuestion && (
              <button disabled={Boolean(deckBusy)} type="button" onClick={() => void runActivateDeck()}>
                <Play size={15} weight="fill" />{t('activateDeck')}
              </button>
            )}
            {[3, 5].map((count) => (
              <button
                disabled={Boolean(deckBusy) || results.items.length + count > 30}
                key={count}
                type="button"
                onClick={() => void runDeck(`add${count}`, { addCount: count })}
              >
                {deckBusy === `add${count}` ? <CircleNotch className="spin" size={15} /> : <Plus size={15} />}
                {t('addNCards', { n: count })}
              </button>
            ))}
          </div>
        </div>
      )}
      {deckError && <p className="error">{deckError}</p>}
      {flashcard && (
        <div className="flashcard-card-list">
          {[...results.items]
            .sort((a, b) => (missesByItem.get(b.id) || 0) - (missesByItem.get(a.id) || 0))
            .map((item) => {
              const misses = missesByItem.get(item.id) || 0
              return (
                <div className={misses ? 'flashcard-card-row is-missed' : 'flashcard-card-row'} key={item.id}>
                  <span>{item.prompt_text}</span>
                  {/* Whichever side the word is on. A 看詞選解釋 deck has the
                      reading on the prompt and nothing on the glosses. */}
                  {item.prompt_reading
                    ? <em className="card-reading">{item.prompt_reading}</em>
                    : item.option_readings?.length > 0 && <em className="card-reading">{item.option_readings.join('・')}</em>}
                  <strong>{misses ? t('missedNTimes', { n: misses }) : t('noMisses')}</strong>
                  <button
                    aria-label={t('removeCard')}
                    className="ghost-button icon-button"
                    disabled={Boolean(deckBusy) || results.items.length <= 1}
                    title={t('removeCard')}
                    type="button"
                    onClick={() => void runDeck(item.id, { removeItemId: item.id })}
                  >
                    {deckBusy === item.id ? <CircleNotch className="spin" size={14} /> : <Trash size={14} />}
                  </button>
                </div>
              )
            })}
        </div>
      )}
      {!writing && grading.length > 0 && <p className="quiz-grading-note"><Clock size={16} />{t('gradingNote')}</p>}
      {/* 寫作教練 is unscored by design, so this gives feedback rather than a
          mark — a first pass the teacher can skim, correct and ignore. Already
          reviewed students are skipped, so a second press costs nothing. */}
      {writing && results.attempts.length > 0 && (
        <div className="writing-review-bar">
          <button disabled={Boolean(reviewingId) || !unreviewed.length} type="button" onClick={() => void reviewAll()}>
            {reviewingId === 'all'
              ? <><CircleNotch className="spin" size={16} />{t('marking', { done: reviewProgress.done, total: reviewProgress.total })}</>
              : <><Sparkle size={16} />{unreviewed.length ? t('reviewRest', { n: unreviewed.length }) : t('allReviewed')}</>}
          </button>
          <span className="muted">{t('reviewNote')}</span>
        </div>
      )}
      <div className="quiz-attempt-list">
        {results.attempts.map((attempt, index) => (
          <article key={attempt.id}>
            <div>
              <strong>{anonymousEnabled ? t('anonymousStudent', { n: index + 1 }) : attempt.participant_name}</strong>
              <span>{flashcard
                ? t('firstTryRight', { right: firstTryRight(attempt.id), total: results.items.length })
                : writing
                ? coaching ? t('submittedWithCoach', { n: roundsFor(attempt.participant_id) }) : t('submitted')
                : attempt.status === 'graded'
                  ? `${attempt.total_score}/${attempt.max_score}`
                  : attempt.status === 'failed' ? t('gradeFailed') : t('grading')}</span>
            </div>
            {/* The writing itself is the result here — a score would be the one
                thing the teacher did not ask for, and the words are the thing
                they did. */}
            {/* The article first, because it is the piece of work. The fields
                below it are how they got there, which is worth reading second
                and worth reading at all only for that reason. */}
            {writing && attempt.composition && (
              <div className="quiz-written-answer is-composition">
                <span>{t('composedArticle')}</span>
                {attempt.revision?.zh_tw ? (
                  <RevisedWriting
                    labels={{
                      added: t('revisionAdded'),
                      removed: t('revisionRemoved'),
                      unchanged: t('revisionUnchanged'),
                      notesHeading: t('revisionNotes'),
                    }}
                    notes={attempt.revision.notes}
                    original={attempt.composition}
                    revised={attempt.revision.zh_tw}
                  />
                ) : <p>{attempt.composition}</p>}
              </div>
            )}
            {writing && (
              <div className="quiz-written-answers">
                {(answersByAttempt.get(attempt.id) || [])
                  .slice()
                  .sort((a, b) => (itemPosition.get(a.item_id) || 0) - (itemPosition.get(b.item_id) || 0))
                  .map((answer) => (
                    <div className="quiz-written-answer" key={answer.id}>
                      <span>{itemPosition.get(answer.item_id)}. {itemPrompt.get(answer.item_id)}</span>
                      <p>{answer.answer_text}</p>
                      {answer.feedback?.zh_tw && (
                        <p className="quiz-written-feedback"><Sparkle size={14} />{answer.feedback.zh_tw}</p>
                      )}
                      {/* 寫作歷程: what this field looked like before, and what
                          the coach asked that moved it. The finished paragraph
                          is above; this is how it got there. */}
                      {coaching && turnsFor(attempt.participant_id, answer.item_id).length > 0 && (
                        <details className="writing-history">
                          <summary>{t('writingHistory', { n: turnsFor(attempt.participant_id, answer.item_id).length })}</summary>
                          {turnsFor(attempt.participant_id, answer.item_id).map((turn) => (
                            <div className="writing-history-turn" key={turn.id}>
                              <strong>{t('draftN', { n: turn.round })}</strong>
                              <p className="writing-history-draft">{turn.draft}</p>
                              <ul>{turn.reply.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                              {turn.reply.fix && <p className="writing-history-fix">{turn.reply.fix.point}</p>}
                            </div>
                          ))}
                        </details>
                      )}
                    </div>
                  ))}
              </div>
            )}
            {writing && (
              <div className="writing-review-row">
                {attempt.feedback?.zh_tw && <p className="writing-review-overall">{attempt.feedback.zh_tw}</p>}
                <button
                  className="ghost-button"
                  disabled={reviewingId === attempt.id}
                  type="button"
                  onClick={() => void reviewOne(attempt.id, Boolean(attempt.feedback?.zh_tw))}
                >
                  {reviewingId === attempt.id
                    ? <><CircleNotch className="spin" size={15} />{t('markingOne')}</>
                    : <><Sparkle size={15} />{attempt.feedback?.zh_tw ? t('markAgain') : t('aiMark')}</>}
                </button>
              </div>
            )}
            {!writing && attempt.feedback?.zh_tw && <p>{attempt.feedback.zh_tw}</p>}
          </article>
        ))}
        {!results.attempts.length && <p className="muted">{writing ? t('noSubmissionsYet') : t('noAnswersYet')}</p>}
      </div>
      {expanded && createPortal(
        <div className="custom-quiz-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false) }}>
          <section aria-label={t('quizExpandedView')} aria-modal="true" className="custom-quiz-review-modal" role="dialog">
            <header>
              <div><p className="eyebrow"><Brain size={17} />{writing ? t('writingFieldsView') : t('quizReviewTitle')}</p><h2>{results.quiz.title || question.title}</h2></div>
              <button aria-label={t('closeExpanded')} className="icon-button" title={t('close')} type="button" onClick={() => setExpanded(false)}><X size={22} /></button>
            </header>
            <div className={`custom-quiz-review-content${results.screenshot ? '' : ' is-single'}`}>
              {results.screenshot && (
                <aside className="custom-quiz-source-panel">
                  <h3>{t('sourceScreenshot')}</h3>
                  <img alt={t('sourceScreenshotAlt')} src={results.screenshot.public_url} />
                </aside>
              )}
              <div className="custom-quiz-question-panel">
                <h3>{writing ? t('writingFields') : t('questionsAndAnswers')}</h3>
                {!writing && (
                  <label className="show-answers-toggle">
                    <input checked={showAnswers} type="checkbox" onChange={(event) => setShowAnswers(event.target.checked)} />
                    {t('showAnswersToggle')}
                  </label>
                )}
                {error && <p className="error">{error}</p>}
                <QuizAnswerEditor {...reviewProps} />
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}
