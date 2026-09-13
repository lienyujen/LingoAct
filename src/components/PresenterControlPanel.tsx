import { CardsThree, Camera, Chat, ClosedCaptioning, Cloud, DiceFive, DoorOpen, Eye, EyeSlash, Gear, MonitorArrowUp, PaperPlaneTilt, PencilLine, BellRinging, Share, Sparkle, Users, Waveform, Image } from '@phosphor-icons/react'
import { useState } from 'react'
import { useWorkspaceText } from '../lib/workspaceText'
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
  onCaptureWriting?: () => void
  onCaptureOrdering?: () => void
  onCaptureMatching?: () => void
  onOpenPicture?: () => void
  onOpenPictureWriting?: () => void
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
  onCaptureWriting,
  onCaptureOrdering,
  onCaptureMatching,
  onOpenPicture,
  onOpenPictureWriting,
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
  const w = useWorkspaceText()
  const [category, setCategory] = useState<'listen' | 'express' | 'understand'>('express')
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

      <div className="control-section activity-library">
        <h2>{w.choose}</h2>
        <div className="activity-categories" aria-label={w.choose}>
          {(['listen', 'express', 'understand'] as const).map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{w[item]}</button>)}
        </div>
        <p className="muted">{w[`${category}Hint`]}</p>
        <div className="control-action-grid" data-category={category}>
          {category === 'understand' && <>
          {onCaptureScreen && (
            <button className="control-action share-action" type="button" onClick={onCaptureScreen} disabled={busy}>
              <span className="control-action-icon"><MonitorArrowUp size={18} /></span>
              {t('captureQuestion')}
            </button>
          )}
          {onCaptureFlashcards && <button className="control-action picture-control-action" type="button" onClick={onCaptureFlashcards} disabled={busy}><span className="control-action-icon"><CardsThree size={18} /></span>{t('flashcards')}</button>}
          {onCaptureOrdering && <button className="control-action picture-control-action" type="button" onClick={onCaptureOrdering} disabled={busy}><span className="control-action-icon"><CardsThree size={18} /></span>{t('typeOrdering')}</button>}
          {onCaptureMatching && <button className="control-action picture-control-action" type="button" onClick={onCaptureMatching} disabled={busy}><span className="control-action-icon"><CardsThree size={18} /></span>{t('typeMatching')}</button>}
          </>}
          {category === 'listen' && <>
          <button className="control-action listening-control-action" type="button" onClick={onOpenListeningStudio} disabled={busy}>
            <span className="control-action-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
            </span>
            {t('listeningStudio')}
          </button>
          </>}
          {category === 'express' && <>
          <button className="control-action picture-control-action" type="button" onClick={onOpenSentenceWall} disabled={busy}>
            <span className="control-action-icon"><PencilLine size={18} /></span>
            {t('sentenceWall')}
          </button>
          {onOpenPicture && <button className="control-action picture-control-action" type="button" onClick={onOpenPicture} disabled={busy}><span className="control-action-icon"><Image size={18} /></span>{t('pictureTalk')}</button>}
          {onOpenPictureWriting && <button className="control-action picture-control-action" type="button" onClick={onOpenPictureWriting} disabled={busy}><span className="control-action-icon"><CardsThree size={18} /></span>{t('storyOrdering')}</button>}
          {onCaptureWriting && <button className="control-action picture-control-action" type="button" onClick={onCaptureWriting} disabled={busy}><span className="control-action-icon"><PencilLine size={18} /></span>{t('writingCoach')}</button>}
          <button className="control-action picture-control-action" type="button" onClick={onOpenPhotoTask} disabled={busy}>
            <span className="control-action-icon"><Camera size={18} /></span>
            {t('photoTask')}
          </button>
          </>}
        </div>
      </div>
      <details className="teacher-disclosure">
        <summary>{w.tools}</summary>
        <div className="control-action-grid">
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
      </details>

      <details className="teacher-disclosure">
        <summary>{w.wrap}</summary>
        <p className="control-section-label"><Sparkle size={15} />{t('classWrapUp')}</p>
        <div className="control-footer-actions">
          <button className="exit-ticket-button" type="button" onClick={onGenerateExitTicket} disabled={busy || Boolean(session.exit_ticket_prompt)}>
            <Sparkle size={17} />
            {session.exit_ticket_prompt ? t('exitTicketSent') : t('generateExitTicket')}
          </button>
        </div>

      <button className="end-class-button" type="button" onClick={onEndClass} disabled={busy}>
        <DoorOpen size={16} />
        {t('endClass')}
      </button>
      </details>

      <details className="teacher-disclosure">
        <summary>{t('classSettings')}</summary>
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
      </details>


    </section>
  )
}
