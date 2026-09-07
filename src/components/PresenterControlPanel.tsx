import { CardsThree, Camera, Chat, ClosedCaptioning, Cloud, DiceFive, DoorOpen, Eye, EyeSlash, Gear, MonitorArrowUp, PaperPlaneTilt, PencilLine, BellRinging, Shapes, Share, Sparkle, Users, Waveform } from '@phosphor-icons/react'
import { isPlusEdition } from '../lib/edition'
import { usePresenterText } from '../lib/presenterI18n'
import type { Session } from '../types'

type Props = {
  session: Session
  onlineCount: number
  busy: boolean
  buzzerActive: boolean
  captionError?: string
  onToggleDanmaku: () => void
  onToggleAnonymous: () => void
  onCaptureScreen?: () => void
  onCaptureFlashcards?: () => void
  onDrawLottery: () => void
  onStartBuzzer: () => void
  onOpenListeningStudio: () => void
  onOpenSentenceWall: () => void
  onOpenPhotoTask: () => void
  onOpenTextDispatch: () => void
  onOpenFileTransfer: () => void
  onOpenRoster: () => void
  onOpenWordCloud: () => void
  onOpenSettings: () => void
  onToggleRecording: () => void
  onToggleCaptionVisibility: () => void
  onGenerateExitTicket: () => void
  onEndClass: () => void
}

export function PresenterControlPanel({
  session,
  onlineCount,
  busy,
  buzzerActive,
  captionError,
  onToggleDanmaku,
  onToggleAnonymous,
  onCaptureScreen,
  onCaptureFlashcards,
  onDrawLottery,
  onStartBuzzer,
  onOpenListeningStudio,
  onOpenSentenceWall,
  onOpenPhotoTask,
  onOpenTextDispatch,
  onOpenFileTransfer,
  onOpenRoster,
  onOpenWordCloud,
  onOpenSettings,
  onToggleRecording,
  onToggleCaptionVisibility,
  onGenerateExitTicket,
  onEndClass,
}: Props) {
  const t = usePresenterText()
  return (
    <section className="panel control-panel">
      <div className="metric-row">
        <div className="metric">
          <span className="metric-icon"><Users size={18} /></span>
          {/* A link rather than a button so it reads as part of the sentence;
              the roster opens beside the panel instead of covering it. */}
          <button className="online-count-link" type="button" onClick={onOpenRoster}>{t('onlineCount', { n: onlineCount })}</button>
        </div>
        <div className="metric-actions">
          <button
            aria-label={t('startBuzzer')}
            className={`ghost-button metric-action energy-action buzzer-menu-button${buzzerActive ? ' active' : ''}`}
            disabled={busy || !onlineCount}
            title={onlineCount ? (buzzerActive ? t('restartBuzzer') : t('startBuzzer')) : t('noOneOnline')}
            type="button"
            onClick={onStartBuzzer}
          >
            <BellRinging size={19} />
          </button>
          <button
            aria-label={t('drawLots')}
            className="ghost-button metric-action energy-action"
            disabled={busy || !onlineCount}
            title={onlineCount ? t('drawFromOnline') : t('noOneOnline')}
            type="button"
            onClick={onDrawLottery}
          >
            <DiceFive size={19} />
          </button>
          {isPlusEdition && (
            <button
              aria-label={t('teacherSettings')}
              className="ghost-button metric-action"
              title={t('teacherSettingsHint')}
              type="button"
              onClick={onOpenSettings}
            >
              <Gear size={19} />
            </button>
          )}
        </div>
      </div>

      <div className="control-section">
        <p className="control-section-label"><Shapes size={15} />{t('classActivities')}</p>
        <div className="control-action-grid">
          {onCaptureScreen && (
            <button className="control-action share-action" type="button" onClick={onCaptureScreen} disabled={busy}>
              <span className="control-action-icon"><MonitorArrowUp size={18} /></span>
              {t('captureQuestion')}
            </button>
          )}
          <button className="control-action listening-control-action" type="button" onClick={onOpenListeningStudio} disabled={busy}>
            <span className="control-action-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
            </span>
            {t('listeningStudio')}
          </button>
          <button className="control-action picture-control-action" type="button" onClick={onOpenSentenceWall} disabled={busy}>
            <span className="control-action-icon"><PencilLine size={18} /></span>
            {t('sentenceWall')}
          </button>
          {onCaptureFlashcards && (
            <button className="control-action picture-control-action" type="button" onClick={onCaptureFlashcards} disabled={busy}>
              <span className="control-action-icon"><CardsThree size={18} /></span>
              {t('flashcards')}
            </button>
          )}
          <button className="control-action picture-control-action" type="button" onClick={onOpenPhotoTask} disabled={busy}>
            <span className="control-action-icon"><Camera size={18} /></span>
            {t('photoTask')}
          </button>
          <button className="control-action share-action" type="button" onClick={onOpenTextDispatch} disabled={busy}>
            <span className="control-action-icon"><PaperPlaneTilt size={18} /></span>
            {t('textDispatch')}
          </button>
          <button className="control-action energy-control-action" type="button" onClick={onOpenWordCloud} disabled={busy}>
            <span className="control-action-icon"><Cloud size={18} /></span>
            {t('wordCloud')}
          </button>
          {isPlusEdition && (
            <>
              <button className="control-action share-action" type="button" onClick={onOpenFileTransfer} disabled={busy}>
                <span className="control-action-icon"><Share size={18} /></span>
                {t('fileTransfer')}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="control-section">
        <p className="control-section-label"><Sparkle size={15} />{t('classWrapUp')}</p>
        <div className="control-footer-actions">
          <button className="exit-ticket-button" type="button" onClick={onGenerateExitTicket} disabled={busy || Boolean(session.exit_ticket_prompt)}>
            <Sparkle size={17} />
            {session.exit_ticket_prompt ? t('exitTicketSent') : t('generateExitTicket')}
          </button>
        </div>
      </div>

      <button className="end-class-button" type="button" onClick={onEndClass} disabled={busy}>
        <DoorOpen size={16} />
        {t('endClass')}
      </button>

      <div className="control-section">
        <p className="control-section-label"><Eye size={15} />{t('classSettings')}</p>
        <div className="control-toggle-row">
          <button
            aria-pressed={session.danmaku_enabled}
            className={`control-toggle${session.danmaku_enabled ? ' is-active' : ''}`}
            type="button"
            onClick={onToggleDanmaku}
            disabled={busy}
          >
            {session.danmaku_enabled ? <Eye size={16} /> : <EyeSlash size={16} />}
            <span>{t('danmaku')}</span>
            <b>{t(session.danmaku_enabled ? 'on' : 'off')}</b>
          </button>
          <button
            aria-pressed={session.anonymous_enabled}
            className={`control-toggle${session.anonymous_enabled ? ' is-active' : ''}`}
            type="button"
            onClick={onToggleAnonymous}
            disabled={busy}
          >
            <Chat size={16} />
            <span>{t('anonymous')}</span>
            <b>{t(session.anonymous_enabled ? 'on' : 'off')}</b>
          </button>
          {isPlusEdition && (
            <>
              <button
                aria-pressed={session.recording_enabled}
                className={`control-toggle${session.recording_enabled ? ' is-active' : ''}`}
                type="button"
                onClick={onToggleRecording}
                disabled={busy || session.caption_status === 'starting'}
              >
                <Waveform size={16} />
                <span>{t('recording')}</span>
                <b>{session.caption_status === 'starting' ? t('connecting') : t(session.recording_enabled ? 'on' : 'off')}</b>
              </button>
              <button
                aria-pressed={session.captions_enabled}
                className={`control-toggle${session.captions_enabled ? ' is-active' : ''}`}
                type="button"
                onClick={onToggleCaptionVisibility}
                disabled={busy || !session.recording_enabled || session.caption_status === 'starting'}
                title={session.recording_enabled ? t('captionToggleHint') : t('captionNeedsRecording')}
              >
                <ClosedCaptioning size={16} />
                <span>{t('captions')}</span>
                <b>{t(session.captions_enabled ? 'on' : 'off')}</b>
              </button>
            </>
          )}
        </div>
        {isPlusEdition && captionError && <p className="error caption-control-error">{captionError}</p>}
      </div>


    </section>
  )
}
