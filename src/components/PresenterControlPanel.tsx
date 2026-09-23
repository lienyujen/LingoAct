import { Chat, ClosedCaptioning, Cloud, DiceFive, DoorOpen, Eye, EyeSlash, Gear, MonitorArrowUp, PaperPlaneTilt, BellRinging, Share, Sparkle, Users, Waveform } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { activitiesFor, SKILL_TABS } from '../lib/activities'
import { APP_PROFILE } from '../lib/appProfiles'
import type { ActivityId, SkillTab } from '../lib/activities'
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
  // 朗讀發音, 口語表達 and 電寫題 are language activities that were only
  // reachable by capturing a screen and then opening a dropdown inside the
  // question editor, which is the same as not being on the menu at all.
  onCapturePronunciation?: () => void
  onCaptureOral?: () => void
  onCaptureDrawing?: () => void
  // The same editor, reached without capturing the screen. A question that is
  // not about anything on screen — 「你今天學到什麼？」, a quick poll — used to
  // require screenshotting an irrelevant corner first.
  onDispatchBlank?: () => void
  onDispatchImage?: (file: File) => void
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
  onCapturePronunciation,
  onCaptureOral,
  onCaptureDrawing,
  onDispatchBlank,
  onDispatchImage,
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
  const [category, setCategory] = useState<SkillTab>(APP_PROFILE.defaultSkill)
  const imageInput = useRef<HTMLInputElement>(null)
  // The descriptors are static; only the wiring is per-render.
  const handlers: Partial<Record<ActivityId, (() => void) | undefined>> = {
    listeningStudio: onOpenListeningStudio,
    flashcards: onCaptureFlashcards,
    pronunciation: onCapturePronunciation,
    oralResponse: onCaptureOral,
    pictureTalk: onOpenPicture,
    photoTask: onOpenPhotoTask,
    ordering: onCaptureOrdering,
    matching: onCaptureMatching,
    storyOrdering: onOpenPictureWriting,
    sentenceWall: onOpenSentenceWall,
    writingCoach: onCaptureWriting,
    drawing: onCaptureDrawing,
  }

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

      {/* 截圖派題 is not one of the activities — it is the door to every
          question type, so it sat among its siblings claiming to be one of
          them. It gets its own place above the tabs. */}
      {onCaptureScreen && (
        <button className="control-action capture-primary" type="button" onClick={onCaptureScreen} disabled={busy}>
          <span className="control-action-icon"><MonitorArrowUp size={20} /></span>
          <span className="capture-primary-text">
            <b>{t('captureQuestion')}</b>
            <small>{t('captureQuestionHint')}</small>
          </span>
        </button>
      )}
      {/* The screen capture stays one press, because it is what a teacher
          reaches for most. These are the same editor with a different
          backdrop, so they are one press too rather than a chooser in front
          of everything. */}
      {(onDispatchImage || onDispatchBlank) && (
        <p className="capture-alternatives">
          <span>{w.orDispatch}</span>
          {onDispatchImage && (
            <button type="button" disabled={busy} onClick={() => imageInput.current?.click()}>{w.fromImage}</button>
          )}
          {onDispatchBlank && (
            <button type="button" disabled={busy} onClick={onDispatchBlank}>{w.noBackdrop}</button>
          )}
        </p>
      )}
      {onDispatchImage && (
        <input
          accept="image/png,image/jpeg,image/webp"
          hidden
          ref={imageInput}
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onDispatchImage(file)
          }}
        />
      )}
      <div className="control-section activity-library">
        <h2>{w.choose}</h2>
        <div className="activity-categories" aria-label={w.choose}>
          {SKILL_TABS.map((item) => (
            <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{w[item]}</button>
          ))}
        </div>
        <p className="muted">{w[`${category}Hint`]}</p>
        <div className="control-action-grid" data-category={category}>
          {activitiesFor(category, APP_PROFILE.activityOrder?.[category]).map(({ id, label, Icon }) => {
            const onClick = handlers[id]
            if (!onClick) return null
            return (
              <button className="control-action picture-control-action" key={id} type="button" onClick={onClick} disabled={busy}>
                <span className="control-action-icon"><Icon size={18} /></span>
                {t(label)}
              </button>
            )
          })}
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
