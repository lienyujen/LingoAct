import { useEffect, useState } from 'react'
import { PaperPlaneTilt, PencilLine, X } from '@phosphor-icons/react'
import { TimingRow } from './TimingRow'

type Props = {
  busy: boolean
  error: string
  open: boolean
  onCancel: () => void
  onOpen: (promptText: string, answerSeconds: number | null) => void
}

// 即時 means improvised: a teacher reaches for this in the middle of explaining
// a 句型, so it asks for the one thing it cannot guess and nothing else.
const ANSWER_PRESETS: Array<number | null> = [null, 60, 120, 180]

export function SentenceWallModal({ busy, error, open, onCancel, onOpen }: Props) {
  const [promptText, setPromptText] = useState('')
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(120)

  useEffect(() => {
    if (open) return
    setPromptText('')
    setAnswerSeconds(120)
  }, [open])

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
            <h2><PencilLine size={19} />即時造句牆</h2>
            <p className="muted">每人寫一句，全班的句子會即時出現在大螢幕上</p>
          </div>
          <button className="ghost-button icon-button" aria-label="關閉" type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <label>
          造句題目
          <textarea
            maxLength={300}
            placeholder="例如：用「雖然……但是……」造一個跟天氣有關的句子"
            rows={3}
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
          />
        </label>
        <TimingRow
          label="作答時間"
          offLabel="不限時"
          presets={ANSWER_PRESETS}
          value={answerSeconds}
          onChange={setAnswerSeconds}
        />
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>取消</button>
          <button disabled={busy || !promptText.trim()} type="submit">
            <PaperPlaneTilt size={17} />{busy ? '開啟中…' : '派題並開牆'}
          </button>
        </div>
      </form>
    </div>
  )
}
