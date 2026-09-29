import { useCallback, useEffect, useMemo, useState } from 'react'
import { Brain, CaretLeft, CaretRight, CircleNotch, Eye, EyeSlash, FloppyDisk, Sparkle, X } from '@phosphor-icons/react'
import { useParams } from 'react-router-dom'
import { QuizAnswerEditor } from '../components/CustomQuizResult'
import { InteractionResults } from '../components/InteractionResults'
import { ListeningPlayer } from '../components/ListeningPlayer'
import { ReadingPassageView } from '../components/ReadingPassageView'
import type { QuizReviewProps } from '../components/CustomQuizResult'
import { getPresenterToken } from '../lib/presenterAuth'
import { PresenterLocaleContext, presenterLookup, storedPresenterLocale } from '../lib/presenterI18n'
import { requireSupabase } from '../lib/supabase'
import type { PresenterQuizResults, WritingReviewSaveInput } from '../types'

type WritingReviewDraft = {
  attemptId: string
  score: string
  overall: string
  composition: string
  revision: string
  fields: Record<string, { answerText: string; feedback: string }>
}

async function functionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: Response } | null)?.context
  if (context) {
    try {
      const payload = await context.clone().json() as { message?: unknown }
      if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
    } catch {
      // Use the SDK message when the response body is not JSON.
    }
  }
  return error instanceof Error && error.message ? error.message : fallback
}

function writingDraftFor(results: PresenterQuizResults, attemptId: string): WritingReviewDraft | null {
  const attempt = results.attempts.find((value) => value.id === attemptId)
  if (!attempt) return null
  return {
    attemptId,
    score: attempt.total_score === null ? '' : String(attempt.total_score),
    overall: attempt.feedback?.zh_tw || '',
    composition: attempt.composition || '',
    revision: attempt.revision?.zh_tw || '',
    fields: Object.fromEntries(results.items.map((item) => {
      const answer = results.answers.find((value) => value.attempt_id === attemptId && value.item_id === item.id)
      return [item.id, { answerText: answer?.answer_text || '', feedback: answer?.feedback?.zh_tw || '' }]
    })),
  }
}

export function CustomQuizReviewPage() {
  const { sessionId = '', questionId = '' } = useParams()
  const [locale] = useState(() => storedPresenterLocale(sessionId))
  const t = presenterLookup(locale)
  const [results, setResults] = useState<PresenterQuizResults | null>(null)
  const [busyItemId, setBusyItemId] = useState('')
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [showAnswers, setShowAnswers] = useState(false)
  const [selectedAttemptId, setSelectedAttemptId] = useState('')
  const [writingDraft, setWritingDraft] = useState<WritingReviewDraft | null>(null)
  const [writingBusy, setWritingBusy] = useState<'ai' | 'save' | ''>('')
  const [saved, setSaved] = useState(false)
  const [readingCue, setReadingCue] = useState(-1)
  const [error, setError] = useState('')
  const [showWritingNames, setShowWritingNames] = useState<boolean | null>(null)

  const loadQuiz = useCallback(async (): Promise<PresenterQuizResults | null> => {
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) {
      setError(t('noPresenterRightsHere'))
      return null
    }
    const { data, error: loadError } = await requireSupabase().functions.invoke('presenter-action', {
      body: { action: 'get_custom_quiz_results', sessionId, presenterToken, questionId },
    })
    if (loadError) {
      setError(await functionErrorMessage(loadError, t('quizLoadFailed')))
      return null
    }
    const loaded = (data as PresenterQuizResults | null) || null
    setResults(loaded)
    setError('')
    return loaded
  }, [questionId, sessionId, t])

  useEffect(() => {
    void loadQuiz()
    const timer = window.setInterval(() => void loadQuiz(), 2500)
    return () => window.clearInterval(timer)
  }, [loadQuiz])

  async function updateAnswer(itemId: string, acceptedAnswers: string[]) {
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) throw new Error(t('noPresenterRights'))
    setBusyItemId(itemId)
    setError('')
    try {
      const { data, error: updateError } = await requireSupabase().functions.invoke('presenter-action', {
        body: { action: 'update_custom_quiz_key', sessionId, presenterToken, questionId, itemId, acceptedAnswers },
      })
      if (updateError) throw new Error(await functionErrorMessage(updateError, t('answerUpdateFailed')))
      if (!data?.success) throw new Error(data?.message || t('answerUpdateFailed'))
      await loadQuiz()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('answerUpdateFailed'))
    } finally {
      setBusyItemId('')
    }
  }

  const pictureWriting = results?.quiz?.requested_type === 'picture_writing'
  const writing = results?.quiz?.graded === false && !pictureWriting && !results.quiz.interaction_mode
  const pictureItem = pictureWriting ? results?.items.find((item) => item.type === 'ordering') : null
  function pictureSegments(attemptId: string) {
    if (!results || !pictureItem) return []
    const answer = results.answers.find((value) => value.attempt_id === attemptId && value.item_id === pictureItem.id)
    try {
      const parsed = JSON.parse(answer?.answer_text || '[]') as unknown
      if (!Array.isArray(parsed)) return []
      return parsed.filter((segment) => segment?.panelId && typeof segment?.text === 'string').map((segment) => ({
        panelId: String(segment.panelId),
        text: String(segment.text),
        image: pictureItem.option_images[pictureItem.options.indexOf(String(segment.panelId))] || '',
      }))
    } catch { return [] }
  }

  const attempts = useMemo(() => results?.attempts || [], [results])
  // Null means "follow the main presenter setting". The first local press
  // becomes an override for this window only; polling never writes it back to
  // the class and never resets the teacher's choice here.
  const writingNamesVisible = showWritingNames ?? !results?.anonymousEnabled
  const attemptName = (attempt: PresenterQuizResults['attempts'][number] | undefined, index: number) => (
    !attempt ? '' : writingNamesVisible ? attempt.participant_name : t('anonymousStudent', { n: index + 1 })
  )
  useEffect(() => {
    if ((!pictureWriting && !writing) || !attempts.length) return
    setSelectedAttemptId((current) => attempts.some((attempt) => attempt.id === current) ? current : attempts[0].id)
  }, [attempts, pictureWriting, writing])

  useEffect(() => {
    if (!writing || !results || !selectedAttemptId) return
    setWritingDraft((current) => current?.attemptId === selectedAttemptId ? current : writingDraftFor(results, selectedAttemptId))
    setSaved(false)
  }, [results, selectedAttemptId, writing])

  const attemptIndex = Math.max(0, attempts.findIndex((attempt) => attempt.id === selectedAttemptId))
  const stepAttempt = useCallback((delta: number) => {
    setSelectedAttemptId((current) => {
      if (!attempts.length) return current
      const at = Math.max(0, attempts.findIndex((attempt) => attempt.id === current))
      return attempts[(at + delta + attempts.length) % attempts.length].id
    })
  }, [attempts])

  useEffect(() => {
    if (!pictureWriting && !writing) return
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (event.key === 'Escape') void window.lingoActDesktop?.close()
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') stepAttempt(1)
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') stepAttempt(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pictureWriting, stepAttempt, writing])

  function currentWritingInput(): WritingReviewSaveInput | null {
    if (!writingDraft || !results) return null
    const score = writingDraft.score.trim() === '' ? null : Number(writingDraft.score)
    if (score !== null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      setError(t('writingScoreInvalid'))
      return null
    }
    return {
      attemptId: writingDraft.attemptId,
      score,
      overall: writingDraft.overall,
      composition: writingDraft.composition,
      revision: writingDraft.revision,
      fields: results.items.map((item) => ({
        itemId: item.id,
        answerText: writingDraft.fields[item.id]?.answerText || '',
        text: writingDraft.fields[item.id]?.feedback || '',
      })),
    }
  }

  async function runAiReview() {
    const input = currentWritingInput()
    if (!input) return
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) return setError(t('noPresenterRights'))
    setWritingBusy('ai')
    setSaved(false)
    setError('')
    try {
      // Preserve any edits already made in this window before asking the AI to
      // read the piece. Otherwise the new review would be based on the stale
      // database copy and quietly replace the teacher's unsaved work.
      const { error: saveError } = await requireSupabase().functions.invoke('presenter-action', {
        body: { action: 'save_writing_review', sessionId, presenterToken, ...input },
      })
      if (saveError) throw new Error(await functionErrorMessage(saveError, t('reviewSaveFailed')))
      const { error: reviewError } = await requireSupabase().functions.invoke('presenter-action', {
        body: { action: 'analyze_writing_attempt', sessionId, presenterToken, attemptId: input.attemptId, force: true },
      })
      if (reviewError) throw new Error(await functionErrorMessage(reviewError, t('markFailed')))
      const loaded = await loadQuiz()
      if (loaded) setWritingDraft(writingDraftFor(loaded, input.attemptId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('markFailed'))
    } finally {
      setWritingBusy('')
    }
  }

  async function saveWritingReview() {
    const input = currentWritingInput()
    if (!input) return
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) return setError(t('noPresenterRights'))
    setWritingBusy('save')
    setSaved(false)
    setError('')
    try {
      const { data, error: saveError } = await requireSupabase().functions.invoke('presenter-action', {
        body: { action: 'save_writing_review', sessionId, presenterToken, ...input },
      })
      if (saveError) throw new Error(await functionErrorMessage(saveError, t('reviewSaveFailed')))
      if (!data?.attempt) throw new Error(data?.message || t('reviewSaveFailed'))
      const loaded = await loadQuiz()
      if (loaded) setWritingDraft(writingDraftFor(loaded, input.attemptId))
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('reviewSaveFailed'))
    } finally {
      setWritingBusy('')
    }
  }

  const reviewProps: QuizReviewProps | null = results ? {
    busyItemId,
    draftAnswers,
    results,
    onDraftChange: (itemId, value) => setDraftAnswers((current) => ({ ...current, [itemId]: value })),
    onUpdateAnswer: updateAnswer,
    showAnswers,
    writing: Boolean(writing),
  } : null

  return (
    <PresenterLocaleContext.Provider value={locale}>
      <main className="custom-quiz-native-page">
        <header>
          <div>
            <p className="eyebrow"><Brain size={18} />{pictureWriting ? t('storyOrdering') : writing ? t('writingReviewTitle') : t('quizReviewTitle')}</p>
            <h1>{results?.quiz?.title || (results ? t('quizGenerating') : t('loadingQuiz'))}</h1>
          </div>
          <button aria-label={t('closeQuizWindow')} className="icon-button" title={t('close')} type="button" onClick={() => window.lingoActDesktop?.close()}><X size={24} /></button>
        </header>
        {error && <p className="error custom-quiz-native-error">{error}</p>}
        {results?.quiz.interaction_mode ? <InteractionResults results={results} anonymousEnabled /> : results && pictureWriting ? (
          <div className="picture-writing-expanded picture-writing-native">
            <aside>
              {results.attempts.map((attempt) => (
                <button className={selectedAttemptId === attempt.id ? 'is-on' : ''} key={attempt.id} type="button" onClick={() => setSelectedAttemptId(attempt.id)}>
                  <strong>{attempt.participant_name}</strong>
                  <small>{attempt.status === 'graded' ? `${attempt.total_score}/${attempt.max_score}` : t('grading')}</small>
                  <span>{pictureSegments(attempt.id).map((segment) => <img alt="" key={segment.panelId} src={segment.image} />)}</span>
                </button>
              ))}
              {!results.attempts.length && <p className="muted">{t('noAnswersYet')}</p>}
            </aside>
            <main>
              {attempts.length > 0 && (
                <div className="picture-writing-native-step">
                  <button aria-label={t('reviewPrevious')} className="icon-button" disabled={attempts.length < 2} title={t('reviewPrevious')} type="button" onClick={() => stepAttempt(-1)}><CaretLeft size={24} /></button>
                  <span><strong>{attempts[attemptIndex]?.participant_name}</strong><small>{attemptIndex + 1} / {attempts.length}</small></span>
                  <button aria-label={t('reviewNext')} className="icon-button" disabled={attempts.length < 2} title={t('reviewNext')} type="button" onClick={() => stepAttempt(1)}><CaretRight size={24} /></button>
                </div>
              )}
              {results.attempts.find((attempt) => attempt.id === selectedAttemptId)?.feedback?.zh_tw && <p className="picture-writing-native-feedback">{results.attempts.find((attempt) => attempt.id === selectedAttemptId)?.feedback?.zh_tw}</p>}
              {pictureSegments(selectedAttemptId).map((segment, index) => <article key={segment.panelId}><div><b>{index + 1}</b><img alt="" src={segment.image} /></div><p>{segment.text}</p></article>)}
            </main>
          </div>
        ) : results && writing ? (
          <div className="writing-review-native">
            <aside aria-label={t('writingStudentList')}>
              <div className="writing-review-name-toggle">
                <strong>{t('writingStudentList')}</strong>
                <button type="button" onClick={() => setShowWritingNames((current) => !(current ?? !results.anonymousEnabled))}>
                  {writingNamesVisible ? <EyeSlash size={16} /> : <Eye size={16} />}
                  {writingNamesVisible ? t('hideStudentNames') : t('showStudentNames')}
                </button>
              </div>
              {attempts.map((attempt, index) => (
                <button className={selectedAttemptId === attempt.id ? 'is-on' : ''} key={attempt.id} type="button" onClick={() => setSelectedAttemptId(attempt.id)}>
                  <strong>{attemptName(attempt, index)}</strong>
                  <small>{attempt.total_score === null ? t('statusPending') : `${attempt.total_score}/100`}</small>
                </button>
              ))}
              {!attempts.length && <p className="muted">{t('noAnswersYet')}</p>}
            </aside>
            <section className="writing-review-workspace">
              {writingDraft ? (
                <>
                  <div className="writing-review-native-heading">
                    <button aria-label={t('reviewPrevious')} className="icon-button" disabled={attempts.length < 2} title={t('reviewPrevious')} type="button" onClick={() => stepAttempt(-1)}><CaretLeft size={24} /></button>
                    <span><strong>{attemptName(attempts[attemptIndex], attemptIndex)}</strong><small>{attemptIndex + 1} / {attempts.length}</small></span>
                    <button aria-label={t('reviewNext')} className="icon-button" disabled={attempts.length < 2} title={t('reviewNext')} type="button" onClick={() => stepAttempt(1)}><CaretRight size={24} /></button>
                    <button className="writing-review-ai" disabled={Boolean(writingBusy)} type="button" onClick={() => void runAiReview()}>{writingBusy === 'ai' ? <CircleNotch className="spin" size={17} /> : <Sparkle size={17} />}{t('aiReviewWriting')}</button>
                  </div>
                  <div className="writing-review-native-fields">
                    {results.items.map((item, index) => (
                      <article key={item.id}>
                        <h2><span>{index + 1}</span>{item.prompt_text}</h2>
                        <label><span>{t('studentWritingLabel')}</span><textarea rows={4} value={writingDraft.fields[item.id]?.answerText || ''} onChange={(event) => setWritingDraft((current) => current ? { ...current, fields: { ...current.fields, [item.id]: { ...current.fields[item.id], answerText: event.target.value } } } : current)} /></label>
                        <label><span>{t('fieldFeedbackLabel')}</span><textarea rows={3} value={writingDraft.fields[item.id]?.feedback || ''} onChange={(event) => setWritingDraft((current) => current ? { ...current, fields: { ...current.fields, [item.id]: { ...current.fields[item.id], feedback: event.target.value } } } : current)} /></label>
                      </article>
                    ))}
                  </div>
                  <article className="writing-review-native-article"><label><span>{t('composedArticle')}</span><textarea rows={10} value={writingDraft.composition} onChange={(event) => setWritingDraft((current) => current ? { ...current, composition: event.target.value } : current)} /></label></article>
                  <article className="writing-review-native-article is-revision"><label><span>{t('revisedArticleLabel')}</span><textarea placeholder={t('revisionPendingTeacher')} rows={10} value={writingDraft.revision} onChange={(event) => setWritingDraft((current) => current ? { ...current, revision: event.target.value } : current)} /></label></article>
                  <article className="writing-review-native-marking">
                    <label className="writing-review-score-editor"><span>{t('scoreOutOf100')}</span><input inputMode="numeric" max="100" min="0" type="number" value={writingDraft.score} onChange={(event) => setWritingDraft((current) => current ? { ...current, score: event.target.value } : current)} /></label>
                    <label><span>{t('overallFeedbackLabel')}</span><textarea rows={5} value={writingDraft.overall} onChange={(event) => setWritingDraft((current) => current ? { ...current, overall: event.target.value } : current)} /></label>
                    <div className="writing-review-native-save">{saved && <span>{t('reviewSaved')}</span>}<button disabled={Boolean(writingBusy)} type="button" onClick={() => void saveWritingReview()}>{writingBusy === 'save' ? <CircleNotch className="spin" size={17} /> : <FloppyDisk size={17} />}{writingBusy === 'save' ? t('savingReview') : t('saveReview')}</button></div>
                  </article>
                </>
              ) : <p className="muted">{t('noAnswersYet')}</p>}
            </section>
          </div>
        ) : results && reviewProps ? (
          <div className={`custom-quiz-native-content${results.readingPassage ? ' has-reading' : results.screenshot ? '' : ' is-single'}`}>
            {results.readingPassage ? (
              <aside className="custom-quiz-reading-panel">
                <ReadingPassageView
                  activeCue={readingCue}
                  cues={results.readingCues}
                  fontControls
                  imageUrl={results.readingImageUrl}
                  locale={locale}
                  passage={results.readingPassage}
                  player={results.readingClip ? (
                    <ListeningPlayer
                      clip={results.readingClip}
                      karaokeCues={results.readingCues}
                      locale={locale}
                      questionId={questionId}
                      replayLimit={null}
                      variant="inline"
                      onActiveCue={setReadingCue}
                    />
                  ) : null}
                />
              </aside>
            ) : results.screenshot ? <aside className="custom-quiz-source-panel"><h2>{t('sourceScreenshot')}</h2><img alt={t('sourceScreenshotAlt')} src={results.screenshot.public_url} /></aside> : null}
            <section className="custom-quiz-question-panel">
              <h2>{t('questionsAndAnswers')}</h2>
              <label className="show-answers-toggle"><input checked={showAnswers} type="checkbox" onChange={(event) => setShowAnswers(event.target.checked)} />{t('showAnswersToggle')}</label>
              <QuizAnswerEditor {...reviewProps} />
            </section>
          </div>
        ) : !error ? <p className="muted custom-quiz-native-loading">{t('loadingQuizAndShot')}</p> : null}
      </main>
    </PresenterLocaleContext.Provider>
  )
}
