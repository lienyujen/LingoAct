import { Chat, ClosedCaptioning, Cloud, DiceFive, DoorOpen, Eye, EyeSlash, Gear, Image, MonitorArrowUp, PaperPlaneTilt, PencilLine, BellRinging, Shapes, Share, Sparkle, Users, Waveform } from '@phosphor-icons/react'
import { isPlusEdition } from '../lib/edition'
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
  onDrawLottery: () => void
  onStartBuzzer: () => void
  onOpenListeningStudio: () => void
  onOpenPictureStudio: () => void
  onOpenSentenceWall: () => void
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
  onDrawLottery,
  onStartBuzzer,
  onOpenListeningStudio,
  onOpenPictureStudio,
  onOpenSentenceWall,
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
  return (
    <section className="panel control-panel">
      <div className="metric-row">
        <div className="metric">
          <span className="metric-icon"><Users size={18} /></span>
          {/* A link rather than a button so it reads as part of the sentence;
              the roster opens beside the panel instead of covering it. */}
          <button className="online-count-link" type="button" onClick={onOpenRoster}>線上 {onlineCount} 人</button>
        </div>
        <div className="metric-actions">
          <button
            aria-label="開始搶答"
            className={`ghost-button metric-action energy-action buzzer-menu-button${buzzerActive ? ' active' : ''}`}
            disabled={busy || !onlineCount}
            title={onlineCount ? (buzzerActive ? '重新開始搶答' : '開始搶答') : '目前沒有線上學員'}
            type="button"
            onClick={onStartBuzzer}
          >
            <BellRinging size={19} />
          </button>
          <button
            aria-label="抽籤"
            className="ghost-button metric-action energy-action"
            disabled={busy || !onlineCount}
            title={onlineCount ? '從線上學員中抽籤' : '目前沒有線上學員'}
            type="button"
            onClick={onDrawLottery}
          >
            <DiceFive size={19} />
          </button>
          {isPlusEdition && (
            <button
              aria-label="教師端設定"
              className="ghost-button metric-action"
              title="課程錄製、字幕、即時口譯語音與麥克風設定"
              type="button"
              onClick={onOpenSettings}
            >
              <Gear size={19} />
            </button>
          )}
        </div>
      </div>

      <div className="control-section">
        <p className="control-section-label"><Shapes size={15} />課堂活動</p>
        <div className="control-action-grid">
          {onCaptureScreen && (
            <button className="control-action share-action" type="button" onClick={onCaptureScreen} disabled={busy}>
              <span className="control-action-icon"><MonitorArrowUp size={18} /></span>
              截圖派題
            </button>
          )}
          <button className="control-action listening-control-action" type="button" onClick={onOpenListeningStudio} disabled={busy}>
            <span className="control-action-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" /></svg>
            </span>
            聽力播音室
          </button>
          <button className="control-action picture-control-action" type="button" onClick={onOpenPictureStudio} disabled={busy}>
            <span className="control-action-icon"><Image size={18} /></span>
            看圖說話
          </button>
          <button className="control-action picture-control-action" type="button" onClick={onOpenSentenceWall} disabled={busy}>
            <span className="control-action-icon"><PencilLine size={18} /></span>
            即時造句牆
          </button>
          <button className="control-action share-action" type="button" onClick={onOpenTextDispatch} disabled={busy}>
            <span className="control-action-icon"><PaperPlaneTilt size={18} /></span>
            文字派送
          </button>
          <button className="control-action energy-control-action" type="button" onClick={onOpenWordCloud} disabled={busy}>
            <span className="control-action-icon"><Cloud size={18} /></span>
            彈幕文字雲
          </button>
          {isPlusEdition && (
            <>
              <button className="control-action share-action" type="button" onClick={onOpenFileTransfer} disabled={busy}>
                <span className="control-action-icon"><Share size={18} /></span>
                檔案傳送
              </button>
            </>
          )}
        </div>
      </div>

      <div className="control-section">
        <p className="control-section-label"><Sparkle size={15} />課堂收尾</p>
        <div className="control-footer-actions">
          <button className="exit-ticket-button" type="button" onClick={onGenerateExitTicket} disabled={busy || Boolean(session.exit_ticket_prompt)}>
            <Sparkle size={17} />
            {session.exit_ticket_prompt ? 'Exit Ticket 已派送' : 'AI 生成 Exit Ticket'}
          </button>
        </div>
      </div>

      <button className="end-class-button" type="button" onClick={onEndClass} disabled={busy}>
        <DoorOpen size={16} />
        下課並產生報告
      </button>

      <div className="control-section">
        <p className="control-section-label"><Eye size={15} />課堂設定</p>
        <div className="control-toggle-row">
          <button
            aria-pressed={session.danmaku_enabled}
            className={`control-toggle${session.danmaku_enabled ? ' is-active' : ''}`}
            type="button"
            onClick={onToggleDanmaku}
            disabled={busy}
          >
            {session.danmaku_enabled ? <Eye size={16} /> : <EyeSlash size={16} />}
            <span>彈幕</span>
            <b>{session.danmaku_enabled ? '開啟' : '關閉'}</b>
          </button>
          <button
            aria-pressed={session.anonymous_enabled}
            className={`control-toggle${session.anonymous_enabled ? ' is-active' : ''}`}
            type="button"
            onClick={onToggleAnonymous}
            disabled={busy}
          >
            <Chat size={16} />
            <span>匿名</span>
            <b>{session.anonymous_enabled ? '開啟' : '關閉'}</b>
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
                <span>錄製</span>
                <b>{session.caption_status === 'starting' ? '連線中' : session.recording_enabled ? '開啟' : '關閉'}</b>
              </button>
              <button
                aria-pressed={session.captions_enabled}
                className={`control-toggle${session.captions_enabled ? ' is-active' : ''}`}
                type="button"
                onClick={onToggleCaptionVisibility}
                disabled={busy || !session.recording_enabled || session.caption_status === 'starting'}
                title={session.recording_enabled ? '控制教師與學生端的即時字幕顯示' : '請先開啟課程錄製'}
              >
                <ClosedCaptioning size={16} />
                <span>字幕</span>
                <b>{session.captions_enabled ? '開啟' : '關閉'}</b>
              </button>
            </>
          )}
        </div>
        {isPlusEdition && captionError && <p className="error caption-control-error">{captionError}</p>}
      </div>


    </section>
  )
}
