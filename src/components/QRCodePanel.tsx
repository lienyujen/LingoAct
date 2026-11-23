import { QRCodeSVG } from 'qrcode.react'
import { CaretUp, Minus, QrCode, X } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import type { HTMLAttributes } from 'react'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  joinUrl: string
  linkable?: boolean
  onClose?: () => void
  onMinimize?: () => void
  onCollapse?: () => void
  qrInteractionProps?: Pick<HTMLAttributes<HTMLDivElement>, 'onDoubleClick'>
}

export function QRCodePanel({ joinUrl, linkable, onClose, onMinimize, onCollapse, qrInteractionProps }: Props) {
  const t = usePresenterText()
  const [showCode, setShowCode] = useState(true)
  const codeId = useId()
  const compact = Boolean(onCollapse)
  useEffect(() => { if (!compact) setShowCode(true) }, [compact])
  return (
    <section className="panel qr-panel">
      <div className="panel-heading">
        {/* The label is its own element so it can be the thing that truncates.
            As a bare text node in a flex heading it had no box to clip, so it
            pushed the window buttons out of a 194px panel instead — and in
            English 「加入場次」 becomes "Join the class", which took the close
            button off the edge of the window entirely. */}
        <h2>
          <img alt="" className="qr-lingoact-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} />
          <span className="qr-heading-label">{t('joinClass')}</span>
        </h2>
        {(onCollapse || onMinimize || onClose) && (
          <div
            className="qr-window-actions"
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            {onCollapse && (
              <>
                <button aria-label={t('joinClass')} aria-controls={codeId} aria-expanded={showCode} title={t('joinClass')} type="button" onClick={() => setShowCode(open => !open)}>
                  <QrCode size={18} />
                </button>
                <button aria-label={t('collapse')} title={t('collapse')} type="button" onClick={onCollapse}>
                  <CaretUp size={18} />
                </button>
              </>
            )}
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
      <div id={codeId} className="qr-code-content" hidden={compact && !showCode}>
      <div className="qr-box" {...qrInteractionProps}>
        <QRCodeSVG marginSize={2} value={joinUrl} size={172} />
      </div>
      {linkable
        ? <a className="join-url" href={joinUrl} target="_blank" rel="noreferrer" title={joinUrl}>{joinUrl}</a>
        : <p className="join-url" title={joinUrl}>{joinUrl}</p>}
      </div>
    </section>
  )
}
