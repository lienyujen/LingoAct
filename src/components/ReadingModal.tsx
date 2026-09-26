import { useEffect, useState } from 'react'
import { BookOpen, SpeakerHigh, X } from '@phosphor-icons/react'
import { requireSupabase } from '../lib/supabase'
import { usePresenterText } from '../lib/presenterI18n'
import type { ReadingPassage } from '../types'

type Props = {
  open: boolean
  sessionId: string
  presenterToken: string
  // The capture, when the teacher came here from 截圖派題 rather than by
  // pasting. Its text is read off the image by the same call that writes the
  // passage, so nothing is transcribed twice.
  screenshotId?: string | null
  onClose: () => void
  onDispatched: () => void
}

type Accent = 'standard_guoyu' | 'putonghua' | 'taiwanese'

export function ReadingModal({ open, sessionId, presenterToken, screenshotId, onClose, onDispatched }: Props) {
  const t = usePresenterText()
  const [sourceText, setSourceText] = useState('')
  const [direction, setDirection] = useState('')
  const [stretch, setStretch] = useState(0)
  const [withQuiz, setWithQuiz] = useState(true)
  const [withAudio, setWithAudio] = useState(false)
  const [accent, setAccent] = useState<Accent>('standard_guoyu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [passage, setPassage] = useState<ReadingPassage | null>(null)

  useEffect(() => {
    if (!open) return
    setSourceText('')
    setDirection('')
    setStretch(0)
    setWithQuiz(true)
    setWithAudio(false)
    setError('')
    setPassage(null)
  }, [open])

  if (!open) return null

  async function dispatch() {
    if (busy) return
    if (!sourceText.trim() && !direction.trim() && !screenshotId) {
      setError(t('readingNeedsSomething'))
      return
    }
    setBusy(true)
    setError('')
    try {
      // The clip is made first when it was asked for, so the passage row can
      // point at it: the class gets the text and the voice together rather than
      // the text now and the voice a moment later.
      let clipId: string | null = null
      const supabase = requireSupabase()

      const { data, error: dispatchError } = await supabase.functions.invoke('presenter-action', {
        body: {
          action: 'dispatch_reading',
          sessionId,
          presenterToken,
          sourceText: sourceText.trim(),
          direction: direction.trim(),
          levelStretch: stretch,
          withQuiz,
          screenshotId: screenshotId || null,
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

        {screenshotId
          ? <p className="muted">{t('readingFromCapture')}</p>
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
            {busy ? t('readingWorking') : t('readingSend')}
          </button>
          <button className="ghost-button" type="button" onClick={onClose}>{t('close')}</button>
        </div>
      </section>
    </div>
  )
}
