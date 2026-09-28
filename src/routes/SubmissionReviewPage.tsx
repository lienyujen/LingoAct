import { useCallback, useEffect, useMemo, useState } from 'react'
import { CaretLeft, CaretRight, PencilSimpleLine, X } from '@phosphor-icons/react'
import { useParams } from 'react-router-dom'
import { isImageFile } from '../lib/fileKinds'
import { FileTypeIcon } from '../components/FileTypeIcon'
import { getPresenterToken } from '../lib/presenterAuth'
import { PresenterLocaleContext, presenterLocaleFor, presenterLookup } from '../lib/presenterI18n'
import { requireSupabase } from '../lib/supabase'
import { useStableSignedUrls } from '../lib/stableSignedUrls'
import type { FileResponse, Question } from '../types'

const verdictLabels = {
  correct: 'verdictCorrect',
  partial: 'verdictPartial',
  incorrect: 'verdictIncorrect',
  unscored: 'verdictUnscored',
} as const

// Marking a class of handwritten answers means looking at each page properly.
// The results panel beside the class list is a column a few hundred pixels
// wide, so this is the same pages at the size they were written on, in their
// own window — the gesture 圖上點選 and 討論板 already use.
export function SubmissionReviewPage() {
  const { sessionId = '', questionId = '' } = useParams()
  // Its own window, so the provider around the presenter page is not here.
  // The language is the class's, which arrives with the session row — the same
  // way 圖上點選 and 討論板 do it.
  const [locale, setLocale] = useState(() => presenterLocaleFor(null))
  const t = presenterLookup(locale)
  const [question, setQuestion] = useState<Question | null>(null)
  const [rawResponses, setRawResponses] = useState<FileResponse[]>([])
  // This window reloads itself every four seconds, and each reload signs the
  // spoken 說明 afresh. Without this the <audio> was handed a new src mid-play
  // and stopped.
  const responses = useStableSignedUrls(rawResponses, 'caption_audio_url')
  const [anonymous, setAnonymous] = useState(false)
  const [at, setAt] = useState(0)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) {
      setError(t('reviewNoRights'))
      return
    }
    const supabase = requireSupabase()
    const [{ data: sessionRow }, { data: questionRow }, { data, error: loadError }] = await Promise.all([
      supabase.from('sessions').select('teaching_language').eq('id', sessionId).maybeSingle(),
      supabase.from('questions').select('*').eq('id', questionId).maybeSingle(),
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_file_responses', sessionId, presenterToken, questionId },
      }),
    ])
    if (loadError) {
      setError(data?.message || t('reviewLoadFailed'))
      return
    }
    setLocale(presenterLocaleFor((sessionRow as { teaching_language?: string } | null)?.teaching_language || null))
    if (questionRow) setQuestion(questionRow as Question)
    setRawResponses((data?.responses || []) as FileResponse[])
    setError('')
  }, [questionId, sessionId, t])

  useEffect(() => {
    void load()
    // Students keep handing in while the window is open, and the teacher keeps
    // marking from the panel behind it; both should show up here.
    const timer = window.setInterval(() => void load(), 4000)
    return () => window.clearInterval(timer)
  }, [load])

  // One entry per page, grouped so a student's own pages stay together and the
  // mark that covers them all travels with each one.
  const pages = useMemo(() => {
    const byStudent = new Map<string, FileResponse[]>()
    for (const response of responses) {
      const kept = byStudent.get(response.participant_id)
      if (kept) kept.push(response)
      else byStudent.set(response.participant_id, [response])
    }
    return [...byStudent.values()].flatMap((files, index) => {
      const marked = files.find((file) => file.analysis_status === 'success' && file.analysis_json) || files[0]
      const shown = files.filter((file) => file.file_url)
      return shown.map((file, page) => ({
        id: file.id,
        url: file.file_url as string,
        name: file.name,
        mimeType: file.mime_type,
        drawable: isImageFile(file.mime_type, file.name),
        owner: anonymous ? t('anonymousUpload', { n: index + 1 }) : file.participant_name,
        page: shown.length > 1 ? t('reviewPageOf', { n: page + 1, total: shown.length }) : '',
        status: marked.analysis_status,
        analysis: marked.analysis_json,
        // 拍照描述 hands in a picture with something said about it, and the
        // description is the answer — looking at the photograph alone would be
        // marking the wrong half.
        caption: file.caption || '',
        captionAudio: file.caption_audio_url || '',
      }))
    })
  }, [anonymous, responses, t])

  const total = pages.length
  const index = total ? Math.min(at, total - 1) : 0
  const current = pages[index]

  const move = useCallback((delta: number) => {
    setAt((now) => (total ? (now + delta + total) % total : 0))
  }, [total])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void window.lingoActDesktop?.close()
      if (event.key === 'ArrowRight' || event.key === 'PageDown') move(1)
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  const analysis = current?.analysis || null

  return (
    <PresenterLocaleContext.Provider value={locale}>
    <main className="submission-review-window">
      <header>
        <div>
          <p className="eyebrow"><PencilSimpleLine size={17} />{t(question?.type === 'drawing' ? 'drawingReview' : 'uploadReview')}</p>
          <h1>{question?.prompt_text || question?.title || t('studentAnswers')}</h1>
        </div>
        <label className="show-answers-toggle">
          <input checked={anonymous} type="checkbox" onChange={(event) => setAnonymous(event.target.checked)} />
          {t('showAnonymously')}
        </label>
        <button aria-label={t('close')} className="icon-button" title={t('close')} type="button" onClick={() => void window.lingoActDesktop?.close()}>
          <X size={24} />
        </button>
      </header>

      {error && <p className="error">{error}</p>}
      {!error && !total && <p className="muted">{t('reviewNothingYet')}</p>}

      {current && (
        <div className="submission-review-body">
          <div className="submission-review-stage">
            <button aria-label={t('reviewPrevious')} className="icon-button" disabled={total < 2} type="button" onClick={() => move(-1)}>
              <CaretLeft size={30} />
            </button>
            {current.drawable ? (
              <img alt={current.name} src={current.url} />
            ) : (
              <a className="submission-review-file" download href={current.url} rel="noreferrer" target="_blank">
                <FileTypeIcon mimeType={current.mimeType} name={current.name} size={56} />
                <strong>{current.name}</strong>
                <span className="muted">{t('reviewCannotShow')}</span>
              </a>
            )}
            <button aria-label={t('reviewNext')} className="icon-button" disabled={total < 2} type="button" onClick={() => move(1)}>
              <CaretRight size={30} />
            </button>
          </div>

          <aside className="submission-review-side">
            <div className="submission-review-who">
              <strong>{current.owner}</strong>
              {current.page && <span className="muted">{current.page}</span>}
              <span className="submission-review-count">{index + 1} / {total}</span>
            </div>
            {(current.caption || current.captionAudio) && (
              <div className="submission-review-caption">
                {current.caption && <p>{current.caption}</p>}
                {current.captionAudio && <audio controls preload="metadata" src={current.captionAudio} />}
              </div>
            )}
            {analysis ? (
              <>
                <div className="submission-review-verdict">
                  {analysis.verdict && (
                    <span className={`file-verdict is-${analysis.verdict}`}>
                      {verdictLabels[analysis.verdict as keyof typeof verdictLabels]
                        ? t(verdictLabels[analysis.verdict as keyof typeof verdictLabels])
                        : analysis.verdict}
                    </span>
                  )}
                  {typeof analysis.score === 'number' && <span className="upload-score">{t('points', { n: analysis.score })}</span>}
                </div>
                <p>{analysis.summary_zh_tw}</p>
                {analysis.strengths_zh_tw.length > 0 && (
                  <>
                    <h2>{t('didWell')}</h2>
                    <ul>{analysis.strengths_zh_tw.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
                  </>
                )}
                {analysis.improvements_zh_tw.length > 0 && (
                  <>
                    <h2>{t('couldImprove')}</h2>
                    <ul>{analysis.improvements_zh_tw.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
                  </>
                )}
              </>
            ) : (
              <p className="muted">
                {current.status === 'analyzing' ? t('reviewMarking')
                  : current.status === 'unsupported' ? t('reviewUnsupported')
                  : t('reviewNotMarked')}
              </p>
            )}
          </aside>
        </div>
      )}

      {total > 1 && (
        // Thirty students is thirty presses of an arrow to reach the last one.
        <nav className="submission-review-strip" aria-label={t('reviewAllAnswers')}>
          {pages.map((page, pageIndex) => (
            <button
              aria-current={pageIndex === index}
              aria-label={page.owner}
              className={`submission-review-chip${pageIndex === index ? ' is-current' : ''}`}
              key={page.id}
              title={page.owner}
              type="button"
              onClick={() => setAt(pageIndex)}
            >
              {page.drawable
                ? <img alt="" src={page.url} />
                : <span className="submission-review-chip-file"><FileTypeIcon mimeType={page.mimeType} name={page.name} size={22} /></span>}
            </button>
          ))}
        </nav>
      )}
    </main>
    </PresenterLocaleContext.Provider>
  )
}
