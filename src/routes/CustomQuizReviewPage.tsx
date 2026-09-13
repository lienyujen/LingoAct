import { useCallback, useEffect, useState } from 'react'
import { Brain, X } from '@phosphor-icons/react'
import { useParams } from 'react-router-dom'
import { QuizAnswerEditor } from '../components/CustomQuizResult'
import { InteractionResults } from '../components/InteractionResults'
import type { QuizReviewProps } from '../components/CustomQuizResult'
import { getPresenterToken } from '../lib/presenterAuth'
import { PresenterLocaleContext, presenterLookup, storedPresenterLocale } from '../lib/presenterI18n'
import { requireSupabase } from '../lib/supabase'
import type { PresenterQuizResults } from '../types'

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

export function CustomQuizReviewPage() {
  const { sessionId = '', questionId = '' } = useParams()
  // This window has no provider above it, so it reads the class's locale once
  // and then provides it for QuizAnswerEditor the same way the main one does.
  const [locale] = useState(() => storedPresenterLocale(sessionId))
  const t = presenterLookup(locale)
  const [results, setResults] = useState<PresenterQuizResults | null>(null)
  const [busyItemId, setBusyItemId] = useState('')
  const [draftAnswers, setDraftAnswers] = useState<Record<string, string>>({})
  const [showAnswers, setShowAnswers] = useState(false)
  const [selectedAttemptId, setSelectedAttemptId] = useState('')
  const [error, setError] = useState('')

  const loadQuiz = useCallback(async () => {
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) {
      setError(t('noPresenterRightsHere'))
      return
    }
    const { data, error: loadError } = await requireSupabase().functions.invoke('presenter-action', {
      body: { action: 'get_custom_quiz_results', sessionId, presenterToken, questionId },
    })
    if (loadError) {
      setError(await functionErrorMessage(loadError, t('quizLoadFailed')))
      return
    }
    setResults((data as PresenterQuizResults | null) || null)
    setError('')
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
        body: {
          action: 'update_custom_quiz_key',
          sessionId,
          presenterToken,
          questionId,
          itemId,
          acceptedAnswers,
        },
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

  // 寫作教練 has no answer key to reveal or correct, so this window becomes a
  // reading of the fields rather than an editor for them.
  const pictureWriting = results?.quiz?.requested_type === 'picture_writing'
  const writing = results?.quiz?.graded === false && !pictureWriting
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

  useEffect(() => {
    if (!pictureWriting || !results?.attempts.length) return
    setSelectedAttemptId((current) => results.attempts.some((attempt) => attempt.id === current) ? current : results.attempts[0].id)
  }, [pictureWriting, results])
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
          <p className="eyebrow"><Brain size={18} />{pictureWriting ? t('storyOrdering') : writing ? t('writingFieldsView') : t('quizReviewTitle')}</p>
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
            {results.attempts.find((attempt) => attempt.id === selectedAttemptId)?.feedback?.zh_tw && <p className="picture-writing-native-feedback">{results.attempts.find((attempt) => attempt.id === selectedAttemptId)?.feedback?.zh_tw}</p>}
            {pictureSegments(selectedAttemptId).map((segment, index) => <article key={segment.panelId}><div><b>{index + 1}</b><img alt="" src={segment.image} /></div><p>{segment.text}</p></article>)}
          </main>
        </div>
      ) : results && reviewProps ? (
        <div className={`custom-quiz-native-content${results.screenshot ? '' : ' is-single'}`}>
          {/* A file-sourced quiz has no screenshot; keeping the panel would leave
              half the window empty for the questions to squeeze beside. */}
          {results.screenshot && (
            <aside className="custom-quiz-source-panel">
              <h2>{t('sourceScreenshot')}</h2>
              <img alt={t('sourceScreenshotAlt')} src={results.screenshot.public_url} />
            </aside>
          )}
          <section className="custom-quiz-question-panel">
            <h2>{writing ? t('writingFields') : t('questionsAndAnswers')}</h2>
            {!writing && (
              <label className="show-answers-toggle">
                <input checked={showAnswers} type="checkbox" onChange={(event) => setShowAnswers(event.target.checked)} />
                {t('showAnswersToggle')}
              </label>
            )}
            <QuizAnswerEditor {...reviewProps} />
          </section>
        </div>
      ) : !error ? <p className="muted custom-quiz-native-loading">{t('loadingQuizAndShot')}</p> : null}
    </main>
    </PresenterLocaleContext.Provider>
  )
}
