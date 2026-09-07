import { QRCodeSVG } from 'qrcode.react'
import { Minus, QrCode, X } from '@phosphor-icons/react'
import type { HTMLAttributes } from 'react'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  joinUrl: string
  onClose?: () => void
  onMinimize?: () => void
  qrInteractionProps?: Pick<HTMLAttributes<HTMLDivElement>, 'onDoubleClick'>
}

export function QRCodePanel({ joinUrl, onClose, onMinimize, qrInteractionProps }: Props) {
  const t = usePresenterText()
  return (
    <section className="panel qr-panel">
      <div className="panel-heading">
        <h2>
          <span className="heading-icon">
            <QrCode size={16} />
          </span>{t('joinClass')}
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
      <div className="qr-box" {...qrInteractionProps}>
        <QRCodeSVG marginSize={2} value={joinUrl} size={172} />
      </div>
      <p className="join-url" title={joinUrl}>{joinUrl}</p>
    </section>
  )
}
