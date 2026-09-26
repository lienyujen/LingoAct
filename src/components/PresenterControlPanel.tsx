import { Chat, ClosedCaptioning, Cloud, DiceFive, DoorOpen, Eye, EyeSlash, Gear, Hand, MonitorArrowUp, PaperPlaneTilt, BellRinging, Share, Sparkle, Users, Waveform } from '@phosphor-icons/react'
import { useState } from 'react'
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
  // How many hands are up right now. Zero hides the control entirely, so the
  // panel only mentions it when there is something to deal with.
  raisedCount: number
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
  onOpenPicture?: () => void
  onOpenPictureWriting?: () => void
  onDrawLottery: () => void
  onStartBuzzer: () => void
  onOpenListeningStudio: () => void
  onOpenSentenceWall: () => void
  onOpenPhotoTask: () => void
  onOpenTextDispatch: () => void
  onOpenFileTransfer: () => void
  onOpenReading: () => void
  // Only on the desktop app, where there is a screen to capture.
  onCaptureReading?: () => void
  onOpenRoster: () => void
  onOpenWordCloud: () => void
  onOpenSettings: () => void
  onToggleRecording: () => void
  onToggleCaptionVisibility: () => void
  onGenerateExitTicket: () => void
  onLowerHands: () => void
  onEndClass: () => void
}

export function PresenterControlPanel({
  session,
  onlineCount,
  raisedCount,
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
  onOpenPicture,
  onOpenPictureWriting,
  onDrawLottery,
  onStartBuzzer,
  onOpenListeningStudio,
  onOpenSentenceWall,
  onOpenPhotoTask,
  onOpenTextDispatch,
  onOpenFileTransfer,
  onOpenReading,
  onCaptureReading,
  onOpenRoster,
  onOpenWordCloud,
  onOpenSettings,
  onToggleRecording,
  onToggleCaptionVisibility,
  onGenerateExitTicket,
  onLowerHands,
  onEndClass,
}: Props) {
  const t = usePresenterText()
  const w = useWorkspaceText()
  const [category, setCategory] = useState<SkillTab>(APP_PROFILE.defaultSkill)
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
    // 截圖 is the door a teacher reaches for with a textbook page already on
    // screen, which is most of the time; pasting is the other door.
    reading: onCaptureReading || onOpenReading,
  }

  return (
    <section className="panel control-panel">
      <div className="metric-row">
        <div className="metric">
          <span className="metric-icon"><Users size={18} /></span>
          {/* A link rather than a button so it reads as part of the sentence;
              the roster opens beside the panel instead of covering it. */}
          <button className="online-count-link" type="button" onClick={onOpenRoster}>{t('onlineCount', { n: onlineCount })}</button>
          {/* Sits with the count rather than among the actions: it is news
              about the class, and it disappears the moment it is dealt with. */}
          {raisedCount > 0 && (
            <button
              className="roster-hand is-clear"
              disabled={busy}
              title={t('lowerAllHands')}
              type="button"
              onClick={onLowerHands}
            >
              <Hand size={15} />{raisedCount}
            </button>
          )}
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

      {/* The four a teacher reaches for during a class, two by two at the top
          where they can be hit without reading. 課堂工具 used to be folded away
          under the activity library, which put the most-used things furthest
          down the panel. They share one colour because they are one group:
          ways to put something in front of the class. */}
      <div className="control-action-grid tool-grid">
        {onCaptureScreen && (
          <button
            className="control-action tool-action"
            type="button"
            title={t('captureQuestionHint')}
            onClick={onCaptureScreen}
            disabled={busy}
          >
            <span className="control-action-icon"><MonitorArrowUp size={18} /></span>
            {t('captureQuestion')}
          </button>
        )}
        <button className="control-action tool-action" type="button" onClick={onOpenTextDispatch} disabled={busy}>
          <span className="control-action-icon"><PaperPlaneTilt size={18} /></span>
          {t('textDispatch')}
        </button>
        <button className="control-action tool-action" type="button" onClick={onOpenWordCloud} disabled={busy}>
          <span className="control-action-icon"><Cloud size={18} /></span>
          {t('wordCloud')}
        </button>
        {isPlusEdition && (
          <button className="control-action tool-action" type="button" onClick={onOpenFileTransfer} disabled={busy}>
            <span className="control-action-icon"><Share size={18} /></span>
            {t('fileTransfer')}
          </button>
        )}
      </div>
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
