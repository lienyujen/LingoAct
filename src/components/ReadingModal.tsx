import { useEffect, useState } from 'react'
import { BookOpen, SpeakerHigh, X } from '@phosphor-icons/react'
import { requireSupabase } from '../lib/supabase'
import { usePresenterText } from '../lib/presenterI18n'
import type { ReadingPassage } from '../types'

type Props = {
  open: boolean
  sessionId: string
  presenterToken: string
  // The capture the teacher just took, when they came in that way. Uploaded on
  // dispatch rather than on open, so backing out of the panel costs nothing.
  capture?: File | null
  // The capture, when the teacher came here from 截圖派題 rather than by
  // pasting. Its text is read off the image by the same call that writes the
  // passage, so nothing is transcribed twice.
  screenshotId?: string | null
  onClose: () => void
  onDispatched: () => void
}

type Accent = 'standard_guoyu' | 'putonghua' | 'taiwanese'

// The four reading abilities, in the order they get harder.
const FOCUS = [
  ['retrieve', 'readingRetrieve'],
  ['understand', 'readingUnderstand'],
  ['infer', 'readingInfer'],
  ['evaluate', 'readingEvaluate'],
] as const

export function ReadingModal({ open, sessionId, presenterToken, screenshotId, capture, onClose, onDispatched }: Props) {
  const t = usePresenterText()
  const [sourceText, setSourceText] = useState('')
  const [direction, setDirection] = useState('')
  const [stretch, setStretch] = useState(0)
  const [withQuiz, setWithQuiz] = useState(true)
  const [quizCount, setQuizCount] = useState(5)
  // All four by default, which is what 綜合 means — and what the generator was
  // silently not doing when nothing said otherwise.
  const [focus, setFocus] = useState<string[]>(FOCUS.map(([key]) => key))
  const [withAudio, setWithAudio] = useState(false)
  // A photograph is usually worth showing the class; a page of text usually is
  // not, because the passage is the version they can read.
  const [shareShot, setShareShot] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [accent, setAccent] = useState<Accent>('standard_guoyu')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [passage, setPassage] = useState<ReadingPassage | null>(null)

  useEffect(() => {
    if (!capture) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(capture)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [capture])

  useEffect(() => {
    if (!open) return
    setSourceText('')
    setDirection('')
    setStretch(0)
    setWithQuiz(true)
    setQuizCount(5)
    setFocus(FOCUS.map(([key]) => key))
    setWithAudio(false)
    setShareShot(false)
    setError('')
    setPassage(null)
  }, [open])

  if (!open) return null

  async function dispatch() {
    if (busy) return
    if (!sourceText.trim() && !direction.trim() && !screenshotId && !capture) {
      setError(t('readingNeedsSomething'))
      return
    }
    setBusy(true)
    setError('')
    setStatus('')
    try {
      // The clip is made first when it was asked for, so the passage row can
      // point at it: the class gets the text and the voice together rather than
      // the text now and the voice a moment later.
      let clipId: string | null = null
      const supabase = requireSupabase()

      // The capture goes to storage first and travels as an id, the same way
      // every other screenshot in the app does — a megabyte of base64 in the
      // request body is how you find the edge function's size limit.
      let shotId = screenshotId || null
      if (capture && !shotId) {
        setStatus(t('readingUploading'))
        const { data: prepared, error: prepareError } = await supabase.functions.invoke('presenter-action', {
          body: { action: 'prepare_screenshot_upload', sessionId, presenterToken, fileName: capture.name },
        })
        if (prepareError) throw prepareError
        if (!prepared?.screenshotId || !prepared?.storagePath || !prepared?.uploadToken) {
          throw new Error(prepared?.message || t('readingFailed'))
        }
        const { error: uploadError } = await supabase.storage
          .from('lingoact-screenshots')
          .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, capture, {
            contentType: capture.type || 'image/png',
            upsert: false,
          })
        if (uploadError) throw uploadError
        shotId = prepared.screenshotId as string
      }
      setStatus(t('readingWorking'))

      const { data, error: dispatchError } = await supabase.functions.invoke('presenter-action', {
        body: {
          action: 'dispatch_reading',
          sessionId,
          presenterToken,
          sourceText: sourceText.trim(),
          direction: direction.trim(),
          levelStretch: stretch,
          withQuiz,
          quizCount,
          comprehension: focus,
          screenshotId: shotId,
          shareScreenshot: shareShot,
          clipId,
        },
      })
      if (dispatchError) throw dispatchError
      if (data?.message) throw new Error(data.message)
      const written = (data?.passage || null) as ReadingPassage | null
      setPassage(written)

      if (withAudio && written?.body) {
        // Read aloud after the fact rather than before: the passage the class
        // hears has to be the passage they were given, and until it is written
        // there is nothing to read.
        const { data: clip } = await supabase.functions.invoke('synthesize-listening', {
          body: {
            sessionId,
            presenterToken,
            transcript: written.body,
            kind: 'passage',
            accent,
          },
        })
        clipId = clip?.clip?.id || null
        if (clipId) {
          await supabase.functions.invoke('presenter-action', {
            body: { action: 'attach_reading_audio', sessionId, presenterToken, questionId: written.question_id, clipId },
          })
        }
      }
      onDispatched()
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t('readingFailed'))
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section aria-label={t('readingActivity')} aria-modal="true" className="modal reading-modal" role="dialog">
        <header className="reading-modal-head">
          <BookOpen size={20} />
          <h2>{t('readingActivity')}</h2>
          <button aria-label={t('close')} className="icon-button" title={t('close')} type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {capture || screenshotId
          ? (
            <div className="reading-capture">
              {previewUrl && <img alt="" className="capture-preview" src={previewUrl} />}
              <p className="muted">{t('readingFromCapture')}</p>
              <label className="interaction-check reading-check">
                <input checked={shareShot} type="checkbox" onChange={(event) => setShareShot(event.target.checked)} />
                {t('readingShareShot')}
              </label>
              <small className="muted">{t('readingShareShotHint')}</small>
            </div>
          )
          : (
            <label className="reading-field">
              {t('readingSource')}
              <textarea
                autoFocus
                placeholder={t('readingSourcePlaceholder')}
                rows={6}
                value={sourceText}
                onChange={(event) => setSourceText(event.target.value)}
              />
            </label>
          )}

        <label className="reading-field">
          {t('readingDirection')}
          <input
            placeholder={t('readingDirectionPlaceholder')}
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          />
        </label>

        {/* 超綱: i+1 and i+2. Off by default, because a class is set to a level
            for a reason and stretching them is a decision, not a default. */}
        <div className="reading-field">
          {t('readingStretch')}
          <div className="segmented-control">
            {[0, 1, 2].map((value) => (
              <button
                aria-pressed={stretch === value}
                className={stretch === value ? 'selected' : ''}
                key={value}
                type="button"
                onClick={() => setStretch(value)}
              >
                {value === 0 ? t('readingStretchNone') : `i+${value}`}
              </button>
            ))}
          </div>
        </div>

        <label className="interaction-check reading-check">
          <input checked={withQuiz} type="checkbox" onChange={(event) => setWithQuiz(event.target.checked)} />
          {t('readingWithQuiz')}
        </label>

        {withQuiz && (
          <div className="reading-quiz-options">
            <div className="reading-field">
              {t('readingCount')}
              <div className="segmented-control">
                {[3, 5, 8].map((value) => (
                  <button
                    aria-pressed={quizCount === value}
                    className={quizCount === value ? 'selected' : ''}
                    key={value}
                    type="button"
                    onClick={() => setQuizCount(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="reading-field">
              {t('readingFocus')}
              <div className="reading-focus">
                {FOCUS.map(([key, label]) => {
                  const on = focus.includes(key)
                  return (
                    <button
                      aria-pressed={on}
                      className={on ? 'selected' : ''}
                      key={key}
                      type="button"
                      onClick={() => setFocus((current) => (
                        // Never all off: a quiz has to be testing something, and
                        // an empty list silently means "all four" downstream,
                        // which would not be what the teacher just pressed.
                        current.includes(key)
                          ? (current.length > 1 ? current.filter((entry) => entry !== key) : current)
                          : [...current, key]
                      ))}
                    >
                      {t(label)}
                    </button>
                  )
                })}
              </div>
              <small className="muted">{t('readingFocusHint')}</small>
            </div>
          </div>
        )}

        <label className="interaction-check reading-check">
          <input checked={withAudio} type="checkbox" onChange={(event) => setWithAudio(event.target.checked)} />
          <SpeakerHigh size={16} />{t('readingWithAudio')}
        </label>

        {withAudio && (
          <div className="segmented-control reading-accents">
            {([
              ['standard_guoyu', 'accentStandardGuoyu'],
              ['putonghua', 'accentPutonghua'],
              ['taiwanese', 'accentTaiwanese'],
            ] as const).map(([value, label]) => (
              <button
                aria-pressed={accent === value}
                className={accent === value ? 'selected' : ''}
                key={value}
                type="button"
                onClick={() => setAccent(value)}
              >
                {t(label)}
              </button>
            ))}
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {passage && <p className="muted">{t('readingSent', { n: passage.vocabulary?.length || 0, g: passage.grammar?.length || 0 })}</p>}

        <div className="reading-modal-actions">
          <button disabled={busy} type="button" onClick={() => void dispatch()}>
            {busy ? (status || t('readingWorking')) : t('readingSend')}
          </button>
          <button className="ghost-button" type="button" onClick={onClose}>{t('close')}</button>
        </div>
      </section>
    </div>
  )
}
