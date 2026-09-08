import { useEffect, useState } from 'react'
import { Camera, PaperPlaneTilt, X } from '@phosphor-icons/react'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  initialPrompt?: string
  busy: boolean
  error: string
  open: boolean
  onCancel: () => void
  onOpen: (promptText: string) => void
}

// 拍照描述. No screenshot behind it and no timer: the material is whatever the
// student walks up to, and walking up to it takes as long as it takes.
export function PhotoTaskModal({ busy, error, open, onCancel, onOpen, initialPrompt = '' }: Props) {
  const t = usePresenterText()
  const [promptText, setPromptText] = useState('')

  useEffect(() => {
    setPromptText(open ? initialPrompt : '')
  }, [open, initialPrompt])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal photo-task-modal"
        onSubmit={(event) => {
          event.preventDefault()
          if (promptText.trim()) onOpen(promptText.trim())
        }}
      >
        <div className="modal-heading">
          <div>
            <h2><Camera size={19} />{t('photoTask')}</h2>
            <p className="muted">{t('photoTaskSub')}</p>
          </div>
          <button className="ghost-button icon-button" aria-label={t('close')} type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <label>
          {t('photoTaskLabel')}
          <textarea
            maxLength={500}
            placeholder={t('photoTaskPlaceholder')}
            rows={4}
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
          />
        </label>
        <p className="muted photo-task-hint">{t('photoTaskHint')}</p>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>{t('cancel')}</button>
          <button disabled={busy || !promptText.trim()} type="submit">
            <PaperPlaneTilt size={17} />{busy ? t('sending') : t('sendTask')}
          </button>
        </div>
      </form>
    </div>
  )
}
