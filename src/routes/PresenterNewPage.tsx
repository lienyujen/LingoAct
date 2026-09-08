import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, ArrowsClockwise, CircleNotch, Door, ChartBar, Gear, SignIn, Sparkle, Trash, X } from '@phosphor-icons/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SetupNotice } from '../components/SetupNotice'
import { LanguagePairFields } from '../components/LanguagePairFields'
import { resolveTrack } from '../lib/teachingTracks'
import { BackendSetup } from '../components/BackendSetup'
import { getPresenterToken, savePresenterToken } from '../lib/presenterAuth'
import { hasOwnerKey } from '../lib/ownerKey'
import { deleteManagedSession, endManagedSession, listManagedSessions } from '../lib/presenterSessions'
import type { ManagedSession } from '../lib/presenterSessions'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { courseSummary, defaultCourse, readCoursePresets, saveCoursePreset } from '../lib/coursePresets'
import type { CoursePreset } from '../lib/coursePresets'
import { LessonPlan } from '../components/LessonPlan'

async function getFunctionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return '建立場次失敗'

  const response = (error as Error & { context?: Response }).context
  if (!response) return error.message

  try {
    const body = await response.clone().json()
    if (typeof body?.message === 'string') return body.message
  } catch {
    // Fall back to the SDK message when the response is not JSON.
  }

  return error.message
}

export function PresenterNewPage() {
  const [courses, setCourses] = useState(readCoursePresets)
  const initialCourse = courses[0] || defaultCourse
  const [title, setTitle] = useState(initialCourse.title)
  // 華語文 explained in Chinese, because that is the room this was built for.
  // All of it travels with the session, so the class is set up before anyone
  // joins and no activity has to ask again.
  const [teachingTrack, setTeachingTrack] = useState(initialCourse.teachingTrack)
  const [guidanceLanguage, setGuidanceLanguage] = useState(initialCourse.guidanceLanguage)
  const [levelFramework, setLevelFramework] = useState(initialCourse.levelFramework)
  const [levelCode, setLevelCode] = useState(initialCourse.levelCode)
  const [readingAnnotation, setReadingAnnotation] = useState(initialCourse.readingAnnotation)
  const [courseSettingsOpen, setCourseSettingsOpen] = useState(!courses.length)
  const [courseNotice, setCourseNotice] = useState('')
  const course = { title: title.trim(), teachingTrack, guidanceLanguage, levelFramework, levelCode, readingAnnotation }

  function chooseCourse(value: CoursePreset) {
    setTitle(value.title)
    setTeachingTrack(value.teachingTrack)
    setGuidanceLanguage(value.guidanceLanguage)
    setLevelFramework(value.levelFramework)
    setLevelCode(value.levelCode)
    setReadingAnnotation(value.readingAnnotation)
    setCourseSettingsOpen(false)
    setCourseNotice('')
  }

  function rememberCourse() {
    if (!course.title) { setCourseNotice('請先填寫課程名稱。'); return }
    if (saveCoursePreset(course)) {
      setCourses(readCoursePresets())
      setCourseNotice('已儲存在這台電腦，下次可直接選用。')
      setCourseSettingsOpen(false)
    } else setCourseNotice('這台電腦無法儲存設定，仍可直接開始上課。')
  }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [systemSetupOpen, setSystemSetupOpen] = useState(false)
  const [managementBusy, setManagementBusy] = useState(false)
  const [managementError, setManagementError] = useState('')
  const [managementNotice, setManagementNotice] = useState('')
  const [managedSessions, setManagedSessions] = useState<ManagedSession[]>([])
  const [pendingAction, setPendingAction] = useState<{ type: 'end' | 'delete'; session: ManagedSession } | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  const activeSessions = useMemo(() => managedSessions.filter((session) => session.status === 'active'), [managedSessions])
  const endedSessions = useMemo(() => managedSessions.filter((session) => session.status === 'ended'), [managedSessions])

  async function createSession(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!isSupabaseConfigured) {
      setError('請先設定 Supabase。')
      return
    }

    setBusy(true)
    try {
      const { data, error: createError } = await requireSupabase().functions.invoke('create-session', {
        body: {
          title: title.trim() || '未命名場次',
          teachingLanguage: teachingTrack,
          guidanceLanguage,
          levelFramework,
          levelCode: levelCode || null,
          readingAnnotation,
        },
        headers: { 'x-lingoact-client': 'windows-app' },
      })

      if (createError) throw createError
      if (!data?.sessionId || !data?.presenterToken) throw new Error('建立場次時沒有取得講者權限。')
      savePresenterToken(data.sessionId, data.presenterToken)
      navigate(`/presenter/${data.sessionId}`)
    } catch (err) {
      setError(await getFunctionErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function loadManagedSessions() {
    setManagementBusy(true)
    setManagementError('')
    try {
      setManagedSessions(await listManagedSessions())
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : '無法讀取場次清單。')
    } finally {
      setManagementBusy(false)
    }
  }

  async function openManagement() {
    setManagementOpen(true)
    setManagementNotice('')
    await loadManagedSessions()
  }

  useEffect(() => {
    const routeState = location.state as { openSessionManager?: boolean } | null
    if (!routeState?.openSessionManager) return

    navigate('/presenter/new', { replace: true, state: null })
    void openManagement()
  }, [location.state, navigate])

  function rejoinSession(session: ManagedSession) {
    if (session.status !== 'active') return
    navigate(`/presenter/${session.id}`)
  }

  async function runPendingAction() {
    if (!pendingAction) return
    // A class started on another computer leaves no token here, and refusing on
    // that basis is what made the leftover sessions impossible to clear. The
    // management key stands in for it; without either, the server still says no.
    const presenterToken = getPresenterToken(pendingAction.session.id)
    if (!presenterToken && !hasOwnerKey()) {
      setPendingAction(null)
      setManagementError('這台電腦沒有這個場次的講者權限，也沒有管理金鑰。請到系統設定貼上金鑰。')
      return
    }

    setManagementBusy(true)
    setManagementError('')
    setManagementNotice('')
    try {
      if (pendingAction.type === 'delete') {
        await deleteManagedSession(pendingAction.session.id, presenterToken)
        setManagementNotice(`已永久移除「${pendingAction.session.title}」。`)
      } else {
        await endManagedSession(pendingAction.session.id, presenterToken)
        setManagementNotice(`已關閉「${pendingAction.session.title}」，課堂資料仍會保留，且不會產生 AI 課程總結。`)
      }
      setPendingAction(null)
      setManagedSessions(await listManagedSessions())
    } catch (err) {
      setManagementError(err instanceof Error ? err.message : '場次操作失敗。')
    } finally {
      setManagementBusy(false)
    }
  }

  function sessionRow(session: ManagedSession) {
    return (
      <article className="managed-session-item" key={session.id}>
        <div className="managed-session-meta">
          <div>
            <h3>{session.title}</h3>
            <span className={`status ${session.status}`}>{session.status === 'active' ? '進行中' : '已關閉'}</span>
          </div>
          <p>場次碼 {session.code} · {new Date(session.created_at).toLocaleString('zh-TW')}</p>
        </div>
        <div className="managed-session-actions">
          {session.status === 'active' ? (
            <>
              <button type="button" onClick={() => rejoinSession(session)} disabled={managementBusy}>
                <SignIn size={17} />重新加入場次
              </button>
              <button className="ghost-button" type="button" onClick={() => setPendingAction({ type: 'end', session })} disabled={managementBusy}>
                <Door size={17} />關閉場次
              </button>
            </>
          ) : (
            <button type="button" onClick={() => navigate(`/session-report/${session.id}`)} disabled={managementBusy}>
              <ChartBar size={17} />檢視課堂報告
            </button>
          )}
          <button className="danger-ghost-button" type="button" onClick={() => setPendingAction({ type: 'delete', session })} disabled={managementBusy}>
            <Trash size={17} />移除場次
          </button>
        </div>
      </article>
    )
  }

  return (
    <main className="center-page presenter-new-page">
      <SetupNotice />
      <form className="panel form-panel" onSubmit={createSession}>
        <span className="form-heading-icon"><Sparkle size={24} /></span>
        <h1>今天，讓學生開口表達</h1>
        <p className="muted">選好課程，掃碼加入，就能開始練習。</p>
        {courses.length > 0 && <label>最近的課程
          <select value={courses.some((item) => item.title === title) ? title : ''} onChange={(event) => {
            const selected = courses.find((item) => item.title === event.target.value)
            if (selected) chooseCourse(selected)
            else { chooseCourse(defaultCourse); setCourseSettingsOpen(true) }
          }}>
            <option value="">新增課程設定</option>
            {courses.map((item) => <option key={item.title} value={item.title}>{item.title}</option>)}
          </select>
        </label>}
        <label>
          課程名稱
          <input autoFocus maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：華語初級班・週二" />
        </label>
        <div className="course-summary"><strong>{courseSummary(course)}</strong><span>每次開始上課，都會建立新的課堂紀錄。</span></div>
        <details className="teacher-disclosure" open={courseSettingsOpen} onToggle={(event) => setCourseSettingsOpen(event.currentTarget.open)}>
        <summary>調整語言與程度</summary>
        <LanguagePairFields
          guidanceLanguage={guidanceLanguage}
          levelCode={levelCode}
          levelFramework={levelFramework}
          readingAnnotation={readingAnnotation}
          teachingTrack={teachingTrack}
          onAnnotationChange={setReadingAnnotation}
          onFrameworkChange={(id) => {
            setLevelFramework(id)
            // GEPT 中級 is not a TOEIC colour; carrying the code across would
            // store a level the new ladder has never heard of.
            setLevelCode('')
          }}
          onGuidanceChange={setGuidanceLanguage}
          onLevelChange={setLevelCode}
          onTrackChange={(id) => {
            setTeachingTrack(id)
            // The ladders changed with the track, so a level from the old one is
            // meaningless — TBCL 第3級 is not a school year.
            setLevelFramework(resolveTrack(id).frameworks[0])
            setLevelCode('')
            setReadingAnnotation(resolveTrack(id).annotation)
          }}
        />
        </details>
        <button className="ghost-button" type="button" onClick={rememberCourse}>記住這個課程設定</button>
        {courseNotice && <p className="muted" role="status">{courseNotice}</p>}
        {title.trim() && <LessonPlan key={title.trim()} courseName={title.trim()} />}
        {error && <p className="error">{error}</p>}
        <button disabled={busy} type="submit">
          {busy ? '準備教室中...' : '開始上課'}
          {!busy && <ArrowRight size={18} />}
        </button>
        <button className="ghost-button manage-sessions-button" disabled={busy} type="button" onClick={openManagement}>
          <ArrowsClockwise size={18} />課堂紀錄與進行中的課
        </button>
        <button className="ghost-button manage-sessions-button" disabled={busy} type="button" onClick={() => setSystemSetupOpen(true)}>
          <Gear size={18} />系統設定
        </button>
        <p className="app-credit">
          <a href="https://github.com/lienyujen/LingoAct/blob/main/LICENSE" rel="noreferrer" target="_blank">LingoAct</a>
          {' | Designed and Developed by '}
          <a href="https://www.facebook.com/lienyujen/" rel="noreferrer" target="_blank">Yujen Lien</a>
        </p>
      </form>
      {/* Reachable after setup too, so keys can be added or the project changed
          without having to clear the configuration first. */}
      {systemSetupOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="modal system-setup-modal" role="dialog" aria-modal="true" aria-label="系統設定">
            <BackendSetup onCancel={() => setSystemSetupOpen(false)} />
          </div>
        </div>
      )}
      {managementOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="manage-sessions-title" aria-modal="true" className="modal session-manager-modal" role="dialog">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">LingoAct</p>
                <h2 id="manage-sessions-title">管理場次</h2>
              </div>
              <div className="session-manager-heading-actions">
                <button aria-label="重新整理" className="icon-button ghost-button" disabled={managementBusy} title="重新整理" type="button" onClick={loadManagedSessions}>
                  <ArrowsClockwise className={managementBusy ? 'spin' : undefined} size={18} />
                </button>
                <button aria-label="關閉管理場次" className="icon-button ghost-button" disabled={managementBusy} type="button" onClick={() => setManagementOpen(false)}>
                  <X size={18} />
                </button>
              </div>
            </div>
            {managementError && <p className="error">{managementError}</p>}
            {managementNotice && <p className="success">{managementNotice}</p>}
            {managementBusy && !managedSessions.length ? (
              <div className="session-manager-loading"><CircleNotch className="spin" size={24} />讀取場次中...</div>
            ) : (
              <div className="session-manager-content">
                <section>
                  <h3>尚未結束 <span>{activeSessions.length}</span></h3>
                  <div className="managed-session-list">
                    {activeSessions.length ? activeSessions.map(sessionRow) : <p className="muted">目前沒有進行中的場次。</p>}
                  </div>
                </section>
                {endedSessions.length > 0 && (
                  <section>
                    <h3>已關閉 <span>{endedSessions.length}</span></h3>
                    <div className="managed-session-list">{endedSessions.map(sessionRow)}</div>
                  </section>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      <ConfirmDialog
        busy={managementBusy}
        confirmLabel={pendingAction?.type === 'delete' ? '永久移除' : '關閉場次'}
        description={pendingAction?.type === 'delete'
          ? `「${pendingAction?.session.title || ''}」的學員、訊息、題目、作答、派送、分析與截圖都會永久刪除，無法復原。`
          : `「${pendingAction?.session.title || ''}」將停止互動，學員會看到課程已結束；課堂資料與派送內容會保留，但不會產生 AI 課程總結。`}
        open={Boolean(pendingAction)}
        title={pendingAction?.type === 'delete' ? '確定永久移除場次？' : '確定關閉場次？'}
        onCancel={() => {
          if (!managementBusy) setPendingAction(null)
        }}
        onConfirm={runPendingAction}
      />
    </main>
  )
}
