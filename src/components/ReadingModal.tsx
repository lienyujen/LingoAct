import { useEffect, useState } from 'react'
import { BookOpen, SpeakerHigh, X } from '@phosphor-icons/react'
import { requireSupabase } from '../lib/supabase'
import { edgeFunctionErrorMessage } from '../lib/edgeError'
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

// What the teacher chose last time. A reading dispatch has seven switches on it
// and a teacher uses the same six of them every lesson; making them tick the
// same boxes each time is the cost of offering the choice at all. Kept on this
// computer beside the class lists, not in the session: it is how this teacher
// works, not a property of one afternoon.
//
// The source material is deliberately not remembered — that is the one thing
// that is different every time.
const SETTINGS_KEY = 'lingoact:reading-settings'

type Remembered = {
  stretch: number
  withQuiz: boolean
  quizCount: number
  focus: string[]
  withAudio: boolean
  accent: Accent
  useImage: boolean
  shareShot: boolean
  verbatim: boolean
}

function readSettings(): Partial<Remembered> {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    return raw ? JSON.parse(raw) as Partial<Remembered> : {}
  } catch {
    return {}
  }
}

function writeSettings(settings: Remembered) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Choosing again next time is a small price; failing to dispatch is not.
  }
}

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
  // On when there is a capture, because that is why they captured. Off means
  // the picture is for the class and the teacher's own text is the material.
  const [useImage, setUseImage] = useState(true)
  const [verbatim, setVerbatim] = useState(false)
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
    const saved = readSettings()
    setSourceText('')
    setDirection('')
    setStretch(saved.stretch ?? 0)
    setWithQuiz(saved.withQuiz ?? true)
    setQuizCount(saved.quizCount ?? 5)
    setFocus(saved.focus?.length ? saved.focus : FOCUS.map(([key]) => key))
    setWithAudio(saved.withAudio ?? false)
    setAccent(saved.accent ?? 'standard_guoyu')
    setShareShot(saved.shareShot ?? false)
    setUseImage(saved.useImage ?? true)
    setVerbatim(saved.verbatim ?? false)
    setError('')
    setPassage(null)
  }, [open])

  if (!open) return null

  async function dispatch() {
    if (busy) return
    if (verbatim && !sourceText.trim()) {
      setError(t('readingNeedsText'))
      return
    }
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
      // The path travels with the id: the function needs it to confirm the
      // upload landed and to write the screenshots row the question points at.
      let shotPath: string | null = null
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
        shotPath = prepared.storagePath as string
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
          storagePath: shotPath,
          shareScreenshot: shareShot,
          useImage,
          verbatim,
          clipId,
        },
      })
      // The SDK's own message is the same sentence for every failure, with
      // the reason sitting unread on the response.
      if (dispatchError) throw new Error(await edgeFunctionErrorMessage(dispatchError, t('readingFailed')))
      if (data?.message && !data?.passage) throw new Error(data.message)
      const written = (data?.passage || null) as ReadingPassage | null
      setPassage(written)

      if (withAudio && written?.body) {
        // Read aloud after the fact rather than before: the passage the class
        // hears has to be the passage they were given, and until it is written
        // there is nothing to read.
        setStatus(t('readingSpeaking'))
        // Both of these used to swallow their errors, so a failed clip looked
        // exactly like a passage with no audio asked for: nothing on the
        // student's screen and nothing said about it.
        const { data: clip, error: clipError } = await supabase.functions.invoke('synthesize-listening', {
          body: {
            sessionId,
            presenterToken,
            transcript: written.body,
            kind: 'passage',
            accent,
          },
        })
        if (clipError) throw new Error(await edgeFunctionErrorMessage(clipError, t('readingAudioFailed')))
        clipId = clip?.clip?.id || null
        if (!clipId) throw new Error(clip?.message || t('readingAudioFailed'))

        const { error: attachError } = await supabase.functions.invoke('presenter-action', {
          body: { action: 'attach_reading_audio', sessionId, presenterToken, questionId: written.question_id, clipId },
        })
        if (attachError) throw new Error(await edgeFunctionErrorMessage(attachError, t('readingAudioFailed')))
      }
      writeSettings({ stretch, withQuiz, quizCount, focus, withAudio, accent, useImage, shareShot, verbatim })
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

        {/* The capture and the teacher's own words are both here, always.
            Which one the passage is written from is a tick, not a fork in the
            flow — a teacher who captured a page may still want to type the
            paragraph they actually care about. */}
        {(capture || screenshotId) && (
          <div className="reading-capture">
            {previewUrl && <img alt="" className="capture-preview" src={previewUrl} />}
            <label className="interaction-check reading-check">
              <input
                checked={useImage && !verbatim}
                disabled={verbatim}
                type="checkbox"
                onChange={(event) => setUseImage(event.target.checked)}
              />
              {t('readingUseImage')}
            </label>
            <small className="muted">{t('readingUseImageHint')}</small>
            <label className="interaction-check reading-check">
              <input checked={shareShot} type="checkbox" onChange={(event) => setShareShot(event.target.checked)} />
              {t('readingShareShot')}
            </label>
            <small className="muted">{t('readingShareShotHint')}</small>
          </div>
        )}

        <label className="reading-field">
          {t('readingSource')}
          <textarea
            autoFocus={!capture}
            placeholder={t('readingSourcePlaceholder')}
            rows={capture || screenshotId ? 4 : 6}
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
          />
        </label>

        <label className="interaction-check reading-check">
          <input checked={verbatim} type="checkbox" onChange={(event) => setVerbatim(event.target.checked)} />
          {t('readingVerbatim')}
        </label>
        <small className="muted">{t('readingVerbatimHint')}</small>

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
        {!verbatim && (
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
        )}

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
