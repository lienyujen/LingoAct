import { QRCodeSVG } from 'qrcode.react'
import { Minus, QrCode, X } from '@phosphor-icons/react'
import { useState } from 'react'
import type { HTMLAttributes } from 'react'
import { useWorkspaceText } from '../lib/workspaceText'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  compact?: boolean
  onToggleControls?: () => void
  joinUrl: string
  onClose?: () => void
  onMinimize?: () => void
  qrInteractionProps?: Pick<HTMLAttributes<HTMLDivElement>, 'onDoubleClick'>
}

export function QRCodePanel({ joinUrl, onClose, onMinimize, qrInteractionProps, compact = false, onToggleControls }: Props) {
  const t = usePresenterText()
  const w = useWorkspaceText()
  const [joinExpanded, setJoinExpanded] = useState(false)
  return (
    <section className="panel qr-panel">
      <div className="panel-heading">
        {/* The label is its own element so it can be the thing that truncates.
            As a bare text node in a flex heading it had no box to clip, so it
            pushed the window buttons out of a 194px panel instead — and in
            English 「加入場次」 becomes "Join the class", which took the close
            button off the edge of the window entirely. */}
        <h2>
          <span className="heading-icon">
            <QrCode size={16} />
          </span>
          <span className="qr-heading-label">{t('joinClass')}</span>
        </h2>
        {(onMinimize || onClose) && (
          <div
            className="qr-window-actions"
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            {onMinimize && (
              <button aria-label={t('minimize')} title={t('minimize')} type="button" onClick={onMinimize}>
                <Minus size={18} />
              </button>
            )}
            {onClose && (
              <button aria-label={t('close')} title={t('close')} type="button" onClick={onClose}>
                <X size={18} />
              </button>
            )}
          </div>
        )}
      </div>
      {compact && <button className="ghost-button join-disclosure" aria-expanded={joinExpanded} type="button" onClick={() => setJoinExpanded(!joinExpanded)}><QrCode size={16} />{w.showJoin}</button>}
      <div className="qr-box" hidden={compact && !joinExpanded} {...qrInteractionProps}>
        <QRCodeSVG marginSize={2} value={joinUrl} size={172} />
      </div>
      {(!compact || joinExpanded) && <p className="join-url" title={joinUrl}>{joinUrl}</p>}
      {onToggleControls && <button className="ghost-button panel-toggle" type="button" onClick={onToggleControls}>{compact ? w.hideControls : w.openControls}</button>}
    </section>
  )
}
