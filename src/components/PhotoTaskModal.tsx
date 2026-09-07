import { useEffect, useState } from 'react'
import { Camera, PaperPlaneTilt, X } from '@phosphor-icons/react'

type Props = {
  busy: boolean
  error: string
  open: boolean
  onCancel: () => void
  onOpen: (promptText: string) => void
}

// 拍照描述. No screenshot behind it and no timer: the material is whatever the
// student walks up to, and walking up to it takes as long as it takes.
export function PhotoTaskModal({ busy, error, open, onCancel, onOpen }: Props) {
  const [promptText, setPromptText] = useState('')

  useEffect(() => {
    if (!open) setPromptText('')
  }, [open])

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
            <h2><Camera size={19} />拍照描述</h2>
            <p className="muted">學生拍下真實的東西，再用這堂課的語言寫或錄音說明</p>
          </div>
          <button className="ghost-button icon-button" aria-label="關閉" type="button" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <label>
          任務說明
          <textarea
            maxLength={500}
            placeholder="例如：在校園裡拍一樣你每天都會用到的東西，說明它是什麼、放在哪裡、你怎麼用它。"
            rows={4}
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
          />
        </label>
        <p className="muted photo-task-hint">學生每張照片下方都會有一個說明欄，可以打字，也可以直接錄音。</p>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>取消</button>
          <button disabled={busy || !promptText.trim()} type="submit">
            <PaperPlaneTilt size={17} />{busy ? '派送中…' : '派送任務'}
          </button>
        </div>
      </form>
    </div>
  )
}
