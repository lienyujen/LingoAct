import { useEffect, useState } from 'react'
import { PaperPlaneTilt, PencilLine, X } from '@phosphor-icons/react'
import { TimingRow } from './TimingRow'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  initialPrompt?: string
  initialAnswerSeconds?: number | null
  busy: boolean
  error: string
  open: boolean
  onCancel: () => void
  onOpen: (promptText: string, answerSeconds: number | null) => void
}

// 即時 means improvised: a teacher reaches for this in the middle of explaining
// a 句型, so it asks for the one thing it cannot guess and nothing else.
const ANSWER_PRESETS: Array<number | null> = [null, 60, 120, 180]

export function SentenceWallModal({ busy, error, open, onCancel, onOpen, initialPrompt = '', initialAnswerSeconds = 120 }: Props) {
  const t = usePresenterText()
  const [promptText, setPromptText] = useState('')
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(120)

  useEffect(() => {
    setPromptText(open ? initialPrompt : '')
    setAnswerSeconds(initialAnswerSeconds)
  }, [initialAnswerSeconds, open, initialPrompt])

  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="modal sentence-wall-modal"
        onSubmit={(event) => {
          event.preventDefault()
          if (promptText.trim()) onOpen(promptText.trim(), answerSeconds)
        }}
      >
        <div className="modal-heading">
          <div>
            <h2><PencilLine size={19} />{t('sentenceWall')}</h2>
            <p className="muted">{t('sentenceWallSub')}</p>
          </div>
          <button className="ghost-button icon-button" aria-label={t('close')} type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <label>
          {t('sentenceWallLabel')}
          <textarea
            maxLength={300}
            placeholder={t('sentenceWallPlaceholder')}
            rows={3}
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
          />
        </label>
        <TimingRow
          label={t('answerTime')}
          offLabel={t('noTimeLimit')}
          presets={ANSWER_PRESETS}
          value={answerSeconds}
          onChange={setAnswerSeconds}
        />
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>{t('cancel')}</button>
          <button disabled={busy || !promptText.trim()} type="submit">
            <PaperPlaneTilt size={17} />{busy ? t('opening') : t('sendAndOpenWall')}
          </button>
        </div>
      </form>
    </div>
  )
}
