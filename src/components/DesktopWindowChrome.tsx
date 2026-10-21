import { ArrowLeft, DotsSixVertical, Minus, X } from '@phosphor-icons/react'
import { usePresenterText } from '../lib/presenterI18n'
import { JapaneseInterfaceSelector } from './JapaneseInterfaceSelector'
import { APP_PROFILE } from '../lib/appProfiles'

interface DesktopWindowChromeProps {
  confirmClose?: boolean
  onBack?: () => void | Promise<void>
}

export function DesktopWindowChrome({ confirmClose = true, onBack }: DesktopWindowChromeProps) {
  const t = usePresenterText()
  if (!window.lingoActDesktop) return null

  function requestClose() {
    if (onBack) {
      void onBack()
      return
    }
    if (!confirmClose || window.confirm(t('confirmCloseApp'))) window.lingoActDesktop?.close()
  }

  return (
    <header className="desktop-window-chrome">
      <div className="desktop-drag-handle" title={t('dragWindow')}>
        <DotsSixVertical size={16} />
        <span>{APP_PROFILE.id === 'japanese' ? APP_PROFILE.productName : 'LingoAct'}</span>
      </div>
      <div className="desktop-window-actions">
        <JapaneseInterfaceSelector />
        {onBack && (
          <button aria-label={t('backToSessions')} title={t('backToSessions')} type="button" onClick={() => void onBack()}>
            <ArrowLeft size={16} />
          </button>
        )}
        <button aria-label={t('minimize')} title={t('minimize')} type="button" onClick={() => window.lingoActDesktop?.minimize()}>
          <Minus size={16} />
        </button>
        <button aria-label={onBack ? t('closeReport') : t('close')} title={onBack ? t('closeReport') : t('close')} type="button" onClick={requestClose}>
          <X size={16} />
        </button>
      </div>
    </header>
  )
}
