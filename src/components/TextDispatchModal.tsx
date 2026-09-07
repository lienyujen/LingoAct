import { Link, PaperPlaneTilt, X } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  busy: boolean
  error: string
  open: boolean
  // 造句牆 hands its write-up over here rather than sending it itself: it is the
  // class's own writing, and what of it goes out is the teacher's call.
  initialBody?: string
  onCancel: () => void
  onSend: (body: string, url: string) => void
}

export function TextDispatchModal({ busy, error, initialBody = '', open, onCancel, onSend }: Props) {
  const t = usePresenterText()
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')

  useEffect(() => {
    if (open) setBody(initialBody)
    else {
      setBody('')
      setUrl('')
    }
  }, [initialBody, open])

  if (!open) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    if (body.trim() || url.trim()) onSend(body.trim(), url.trim())
  }

  return (
    <div className="modal-backdrop text-dispatch-backdrop" role="presentation">
      <form className="modal text-dispatch-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <h2>{t('textDispatch')}</h2>
            <p className="muted">{t('textDispatchSub')}</p>
          </div>
          <button className="ghost-button icon-button" aria-label={t('closeTextDispatch')} title={t('close')} type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <label>
          {t('textLabel')}
          <textarea
            maxLength={5000}
            placeholder={t('textPlaceholder')}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <label>
          <span className="field-label-with-icon"><Link size={16} />{t('urlLabel')}</span>
          <input
            inputMode="url"
            maxLength={2048}
            placeholder="https://example.com"
            type="text"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>{t('cancel')}</button>
          <button disabled={busy || (!body.trim() && !url.trim())} type="submit">
            <PaperPlaneTilt size={17} />{busy ? t('sending') : t('sendNow')}
          </button>
        </div>
      </form>
    </div>
  )
}
