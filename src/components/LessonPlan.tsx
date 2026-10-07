import { uiText } from '../lib/uiText'
import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Play, Plus, Trash } from '@phosphor-icons/react'
import { ACTIVITIES, SKILL_TABS, activitiesFor } from '../lib/activities'
import type { ActivityId } from '../lib/activities'
import { APP_PROFILE } from '../lib/appProfiles'
import { usePresenterLocale, usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'
import { useWorkspaceText } from '../lib/workspaceText'
import type { ListeningAccent } from '../lib/listening'
import type { QuestionType, QuizRequestedType } from '../types'

// The tools that are not one of the four skills: they sit above the skill tabs
// in the panel and they belong here for the same reason, because a lesson that
// sends a file or ends on an Exit Ticket is a lesson with those steps in it.
export type ToolKind = 'captureQuestion' | 'textDispatch' | 'wordCloud' | 'fileTransfer' | 'exitTicket'
export type PlannedActivityKind = ActivityId | ToolKind

const TOOL_KINDS: ToolKind[] = ['captureQuestion', 'textDispatch', 'wordCloud', 'fileTransfer']

export type PlannedActivity = {
  id: string
  kind: PlannedActivityKind
  prompt: string
  url?: string
  listeningKind?: 'passage' | 'dialogue'
  accent?: ListeningAccent
  dispatchTarget?: 'audio' | 'read_aloud' | 'quiz'
  replayLimit?: number | null
  source?: 'screenshot' | 'file'
  questionType?: QuestionType
  options?: string[]
  allowMultiple?: boolean
  quizType?: QuizRequestedType
  count?: string
  coaching?: boolean
  pictureMode?: 'spoken' | 'written'
  aiGrading?: boolean
  prepareSeconds?: number | null
  answerSeconds?: number | null
}

type Plan = { goal: string; activities: PlannedActivity[] }
const emptyPlan: Plan = { goal: '', activities: [] }

const KINDS: PlannedActivityKind[] = [...ACTIVITIES.map((activity) => activity.id), ...TOOL_KINDS, 'exitTicket']

// What a saved plan called these before the list was derived from the activity
// table. Without this a teacher's plan would quietly lose every item the day
// the names changed, which is worse than the drift it is fixing.
const RENAMED: Record<string, PlannedActivityKind> = {
  listen: 'listeningStudio',
  flashcard: 'flashcards',
  quiz: 'captureQuestion',
  sentence: 'sentenceWall',
  picture: 'pictureTalk',
  picture_ordering: 'storyOrdering',
  writing: 'writingCoach',
  photo: 'photoTask',
  capture: 'captureQuestion',
  text: 'textDispatch',
  file: 'fileTransfer',
  exit_ticket: 'exitTicket',
}

// Which extra controls a kind offers. Written once here rather than as a chain
// of conditions in the markup, so adding an activity is one row.
type Control = 'listening' | 'material' | 'quizType' | 'coaching' | 'questionType'
  | 'pictureMode' | 'aiGrading' | 'prepare' | 'answer' | 'link'

const CONTROLS: Partial<Record<PlannedActivityKind, Control[]>> = {
  listeningStudio: ['listening'],
  flashcards: ['material'],
  writingCoach: ['material', 'coaching'],
  ordering: ['material'],
  matching: ['material'],
  pronunciation: ['prepare', 'answer'],
  oralResponse: ['prepare', 'answer'],
  drawing: ['answer'],
  pictureTalk: ['pictureMode', 'answer'],
  storyOrdering: ['aiGrading'],
  sentenceWall: ['answer'],
  captureQuestion: ['questionType', 'quizType', 'prepare', 'answer'],
  textDispatch: ['link'],
}

// The kinds that are opened and then set up in their own panel, so the plan
// asks for nothing but a note.
const NOTE_ONLY: PlannedActivityKind[] = ['fileTransfer', 'exitTicket', 'wordCloud', 'reading']

function cleanActivity(value: unknown): PlannedActivity | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<PlannedActivity> & { kind?: string }
  const kind = (RENAMED[item.kind || ''] || item.kind) as PlannedActivityKind
  if (typeof item.id !== 'string' || !KINDS.includes(kind)) return null
  return {
    ...item,
    id: item.id,
    kind,
    prompt: typeof item.prompt === 'string' ? item.prompt.slice(0, 5000) : '',
    url: typeof item.url === 'string' ? item.url.slice(0, 2048) : undefined,
  }
}

function readPlan(v2Key: string, v1Key: string): Plan {
  try {
    const value = JSON.parse(localStorage.getItem(v2Key) || localStorage.getItem(v1Key) || 'null')
    if (!value || typeof value.goal !== 'string' || !Array.isArray(value.activities)) return emptyPlan
    return { goal: value.goal.slice(0, 200), activities: value.activities.map(cleanActivity).filter(Boolean).slice(0, 20) as PlannedActivity[] }
  } catch { return emptyPlan }
}

function initialActivity(kind: PlannedActivityKind): PlannedActivity {
  return {
    id: '', kind, prompt: '', listeningKind: 'passage', accent: 'standard_guoyu', dispatchTarget: 'audio', replayLimit: null,
    source: 'screenshot', questionType: 'multiple_choice', options: ['A', 'B', 'C', 'D'], allowMultiple: false,
    quizType: 'random',
    count: 'auto', coaching: kind === 'writingCoach', pictureMode: 'spoken', aiGrading: false,
    prepareSeconds: null, answerSeconds: kind === 'sentenceWall' ? 120 : null,
  }
}

const TOOL_LABELS: Record<ToolKind, PresenterMessageKey> = {
  captureQuestion: 'captureQuestion',
  textDispatch: 'textDispatch',
  wordCloud: 'wordCloud',
  fileTransfer: 'fileTransfer',
  exitTicket: 'generateExitTicket',
}

export function LessonPlan({ courseName, busy = false, onStart }: {
  courseName: string; busy?: boolean; onStart?: (activity: PlannedActivity, goal: string) => void
}) {
  const base = courseName.trim()
  const storageKey = `lingoact_lesson_plan_v2:${base}`
  const legacyKey = `lingoact_lesson_plan_v1:${base}`
  const [plan, setPlan] = useState(() => readPlan(storageKey, legacyKey))
  const [group, setGroup] = useState<string>(APP_PROFILE.defaultSkill)
  const [draft, setDraft] = useState<PlannedActivity>(() => initialActivity(
    activitiesFor(APP_PROFILE.defaultSkill, APP_PROFILE.activityOrder?.[APP_PROFILE.defaultSkill])[0]?.id || 'reading',
  ))
  const [notice, setNotice] = useState('')
  const t = usePresenterText()
  const w = useWorkspaceText()
  const chinese = ['zh-TW', 'zh-CN'].includes(usePresenterLocale())

  // The same table the activity menu is built from, so the plan can never offer
  // something the app does not have — or miss something it does.
  const groups = useMemo(() => [
    ...SKILL_TABS.map((tab) => ({
      id: tab as string,
      label: w[tab],
      kinds: activitiesFor(tab, APP_PROFILE.activityOrder?.[tab]).map((activity) => activity.id as PlannedActivityKind),
    })),
    { id: 'tools', label: w.tools, kinds: TOOL_KINDS as PlannedActivityKind[] },
    { id: 'wrap', label: w.wrap, kinds: ['exitTicket'] as PlannedActivityKind[] },
  ], [w])

  const labelFor = (kind: PlannedActivityKind) => {
    const activity = ACTIVITIES.find((item) => item.id === kind)
    return t(activity ? activity.label : TOOL_LABELS[kind as ToolKind])
  }

  const availableKinds = groups.find((item) => item.id === group)?.kinds || []
  const controls = CONTROLS[draft.kind] || []
  const has = (control: Control) => controls.includes(control)

  const promptMeta = useMemo(() => {
    if (draft.kind === 'listeningStudio') return [chinese ? '課文或對話' : 'Passage or dialogue', chinese ? '貼上要轉成語音的文字' : 'Paste the text to turn into speech']
    if (draft.kind === 'sentenceWall') return [chinese ? '造句題目' : 'Sentence prompt', chinese ? '例如：用「因為…所以…」說明原因' : 'e.g. Explain a reason using “because”']
    if (draft.kind === 'pictureTalk' || draft.kind === 'storyOrdering') return [chinese ? '圖片與故事方向' : "Image topic and story goals", chinese ? '例如：兩個學生在雨天互相幫助' : 'e.g. Two students help each other on a rainy day']
    if (draft.kind === 'photoTask') return [chinese ? '任務說明' : 'Task', chinese ? '學生要拍什麼、說明什麼？' : 'What should students photograph and describe?']
    if (draft.kind === 'textDispatch') return [chinese ? '要派送的文字' : 'Text to send', chinese ? '輸入學生要看到的內容' : 'What students should see']
    if (draft.kind === 'reading') return [chinese ? '這篇要講什麼（選填）' : "Passage topic (optional)", chinese ? '例如：週末的市場，或留空由截圖決定' : 'e.g. A weekend market — or leave it to the capture']
    if (draft.kind === 'pronunciation' || draft.kind === 'oralResponse' || draft.kind === 'drawing') return [chinese ? '題目' : 'Prompt', chinese ? '學生會看到的題目' : 'What students will see']
    if (draft.kind === 'captureQuestion' && draft.questionType !== 'custom_quiz') return [chinese ? '題目' : 'Prompt', chinese ? '學生會看到的題目' : 'What students will see']
    if (NOTE_ONLY.includes(draft.kind)) return [chinese ? '備註（選填）' : 'Note (optional)', chinese ? '例如：下課前派送' : 'e.g. Send before class ends']
    return [chinese ? '出題方向' : 'Direction', chinese ? '說明教材範圍、練習目標與難度' : "Describe the source material, learning goal, and difficulty level"]
  }, [chinese, draft.kind, draft.questionType])

  function save(next: Plan) {
    setPlan(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setNotice('') }
    catch { setNotice(chinese ? '無法儲存到這台電腦。請保留此頁面。' : 'Could not save on this computer. Keep this page open.') }
  }
  function move(index: number, offset: number) {
    const activities = [...plan.activities]; const other = index + offset
    if (other < 0 || other >= activities.length) return
    ;[activities[index], activities[other]] = [activities[other], activities[index]]
    save({ ...plan, activities })
  }
  function chooseGroup(id: string) {
    const first = groups.find((item) => item.id === id)?.kinds[0] || 'reading'
    setGroup(id); setDraft(initialActivity(first))
  }
  function summary(item: PlannedActivity) {
    const parts = [item.prompt]
    if (item.kind === 'listeningStudio') {
      parts.push(item.listeningKind === 'dialogue' ? (chinese ? '對話' : 'Dialogue') : (chinese ? '課文段落' : 'Passage'))
      const accentKey = item.accent === 'putonghua' ? 'accentPutonghua' : item.accent === 'taiwanese' ? 'accentTaiwanese' : 'accentStandardGuoyu'
      const dispatchKey = item.dispatchTarget === 'quiz' ? 'sendListeningQuiz' : item.dispatchTarget === 'read_aloud' ? 'sendReadAloud' : 'sendAudioOnly'
      parts.push(t(accentKey), t(dispatchKey))
    }
    if ((CONTROLS[item.kind] || []).includes('material')) parts.push(item.count === 'auto' ? (chinese ? '數量自動' : "Let AI decide") : `${item.count}`)
    if (item.kind === 'textDispatch' && item.url) parts.push(item.url)
    return parts.filter(Boolean).join(' · ') || (chinese ? '開啟後再選擇教材' : 'Choose the material after opening')
  }
  const promptRequired = !NOTE_ONLY.includes(draft.kind)

  return <details className="teacher-disclosure lesson-plan">
    <summary>{chinese ? uiText("授課錦囊") : 'Lesson plan'}{plan.activities.length ? ` · ${plan.activities.length}` : ''}</summary>
    <p className="muted">{chinese ? uiText("課程目標與活動順序會自動保存在這台電腦。開啟後確認內容再派送。") : "Your goals and planned activities are saved on this computer. Open an activity, review it, then send it to your students."}</p>
    <label>{chinese ? uiText("今天想讓學生學會什麼？") : 'What should students be able to do?'}
      <input maxLength={200} value={plan.goal} onChange={(event) => save({ ...plan, goal: event.target.value })} placeholder={chinese ? uiText("例如：用「因為…所以…」說明自己的選擇") : 'e.g. Explain a choice using “because”'} />
    </label>
    {plan.goal && <p className="muted">{chinese ? uiText("從錦囊開啟 AI 活動時，這個目標會作為出題參考，不會顯示給學生。") : "AI uses this goal to create activities launched from your plan. Students do not see the goal."}</p>}
    <ol className="lesson-plan-list">
      {plan.activities.map((item, index) => <li key={item.id}>
        <strong>{index + 1}. {labelFor(item.kind)}</strong><p>{summary(item)}</p>
        <div className="lesson-plan-actions">
          {onStart && <button disabled={busy} type="button" onClick={() => onStart(item, plan.goal.trim())}><Play size={15} />{chinese ? uiText("開啟活動") : 'Open activity'}</button>}
          <button className="ghost-button icon-button" disabled={index === 0 || busy} type="button" aria-label={chinese ? uiText("往前移") : 'Move up'} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button className="ghost-button icon-button" disabled={index === plan.activities.length - 1 || busy} type="button" aria-label={chinese ? uiText("往後移") : 'Move down'} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          <button className="ghost-button icon-button" disabled={busy} type="button" aria-label={chinese ? uiText("移除項目") : 'Remove planned activity'} onClick={() => save({ ...plan, activities: plan.activities.filter((candidate) => candidate.id !== item.id) })}><Trash size={16} /></button>
        </div>
      </li>)}
    </ol>
    <div className="lesson-plan-groups" aria-label={chinese ? uiText("活動類別") : 'Activity category'}>
      {groups.map((item) => <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => chooseGroup(item.id)}>{item.label}</button>)}
    </div>
    <label>{chinese ? uiText("加入一個活動") : 'Add an activity'}
      <select value={draft.kind} onChange={(event) => setDraft(initialActivity(event.target.value as PlannedActivityKind))}>{availableKinds.map((value) => <option key={value} value={value}>{labelFor(value)}</option>)}</select>
    </label>
    {has('listening') && <div className="lesson-plan-options">
      <select aria-label={chinese ? uiText("內容形式") : 'Format'} value={draft.listeningKind} onChange={(e) => setDraft({ ...draft, listeningKind: e.target.value as 'passage' | 'dialogue' })}><option value="passage">{chinese ? uiText("課文段落") : 'Passage'}</option><option value="dialogue">{chinese ? uiText("對話") : 'Dialogue'}</option></select>
      <select aria-label={chinese ? uiText("中文口音") : 'Mandarin accent'} value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value as ListeningAccent })}><option value="standard_guoyu">{t('accentStandardGuoyu')}</option><option value="putonghua">{t('accentPutonghua')}</option><option value="taiwanese">{t('accentTaiwanese')}</option></select>
      <select aria-label={chinese ? uiText("預計派送方式") : "Planned activity"} value={draft.dispatchTarget} onChange={(e) => setDraft({ ...draft, dispatchTarget: e.target.value as PlannedActivity['dispatchTarget'] })}><option value="audio">{t('sendAudioOnly')}</option><option value="read_aloud">{t('sendReadAloud')}</option><option value="quiz">{t('sendListeningQuiz')}</option></select>
      <select aria-label={t('replayCount')} value={draft.replayLimit ?? 'unlimited'} onChange={(e) => setDraft({ ...draft, replayLimit: e.target.value === 'unlimited' ? null : Number(e.target.value) })}><option value="unlimited">{chinese ? uiText("不限次") : 'Unlimited'}</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
      {draft.dispatchTarget === 'read_aloud' && <select aria-label={t('prepareTime')} value={draft.prepareSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, prepareSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noPrepare')}</option><option value="10">{uiText("10 秒")}</option><option value="20">{uiText("20 秒")}</option><option value="30">{uiText("30 秒")}</option></select>}
      {draft.dispatchTarget === 'read_aloud' && <select aria-label={t('readAloudTime')} value={draft.answerSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, answerSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noTimeLimit')}</option><option value="30">{uiText("30 秒")}</option><option value="60">{uiText("60 秒")}</option><option value="90">{uiText("90 秒")}</option></select>}
    </div>}
    {has('questionType') && <>
      <div className="lesson-plan-options">
        <select aria-label={chinese ? uiText("題型") : 'Question type'} value={draft.questionType} onChange={(e) => setDraft({ ...draft, questionType: e.target.value as QuestionType })}><option value="multiple_choice">{t('typeMultipleChoice')}</option><option value="poll">{t('typePoll')}</option><option value="short_answer">{t('typeShortAnswer')}</option><option value="custom_quiz">{t('typeCustomQuiz')}</option><option value="file_upload">{t('typeFileUpload')}</option><option value="send_screen">{t('typeSendScreen')}</option></select>
        {draft.questionType === 'custom_quiz' && <select aria-label={chinese ? uiText("測驗題型") : 'Quiz type'} value={draft.quizType} onChange={(e) => setDraft({ ...draft, quizType: e.target.value as QuizRequestedType })}><option value="random">{t('typeRandom')}</option><option value="multiple_choice">{t('typeMultipleChoice')}</option><option value="fill_blank">{t('typeFillBlank')}</option><option value="short_answer">{t('typeShortAnswerQuiz')}</option><option value="ordering">{t('typeOrdering')}</option><option value="matching">{t('typeMatching')}</option></select>}
      </div>
      {['multiple_choice', 'poll'].includes(draft.questionType || '') && <>
        <label>{t('options')}<textarea rows={3} value={(draft.options || []).join('\n')} onChange={(e) => setDraft({ ...draft, options: e.target.value.split('\n').slice(0, 8) })} /></label>
        <label className="lesson-plan-check"><input checked={draft.allowMultiple} type="checkbox" onChange={(e) => setDraft({ ...draft, allowMultiple: e.target.checked })} />{t('allowMultiple')}</label>
      </>}
    </>}
    {has('material') && <div className="lesson-plan-options">
      <select aria-label={chinese ? uiText("教材來源") : 'Material source'} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as 'screenshot' | 'file' })}><option value="screenshot">{chinese ? uiText("上課時截圖") : 'Capture in class'}</option><option value="file">{chinese ? uiText("上課時選檔") : 'Choose a file in class'}</option></select>
      <select aria-label={chinese ? uiText("數量") : 'Count'} value={draft.count} onChange={(e) => setDraft({ ...draft, count: e.target.value })}><option value="auto">{t('autoDecide')}</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
      {has('coaching') && <label className="lesson-plan-check"><input checked={draft.coaching} type="checkbox" onChange={(e) => setDraft({ ...draft, coaching: e.target.checked })} />{chinese ? uiText("開啟 AI 鷹架提問") : "Enable AI writing support"}</label>}
    </div>}
    {(has('prepare') || has('answer')) && <div className="lesson-plan-options">
      {has('prepare') && <select aria-label={t('prepareTime')} value={draft.prepareSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, prepareSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noPrepare')}</option><option value="10">{uiText("10 秒")}</option><option value="20">{uiText("20 秒")}</option><option value="30">{uiText("30 秒")}</option></select>}
      {has('answer') && <select aria-label={t('answerTime')} value={draft.answerSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, answerSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noTimeLimit')}</option><option value="30">{uiText("30 秒")}</option><option value="60">{uiText("60 秒")}</option><option value="90">{uiText("90 秒")}</option><option value="120">{uiText("120 秒")}</option><option value="180">{uiText("180 秒")}</option></select>}
      {has('pictureMode') && <select aria-label={chinese ? uiText("作答方式") : 'Answer mode'} value={draft.pictureMode} onChange={(e) => setDraft({ ...draft, pictureMode: e.target.value as 'spoken' | 'written' })}><option value="spoken">{t('modeSpoken')}</option><option value="written">{t('modeWritten')}</option></select>}
    </div>}
    {has('aiGrading') && <label className="lesson-plan-check"><input checked={draft.aiGrading} type="checkbox" onChange={(e) => setDraft({ ...draft, aiGrading: e.target.checked })} />{t('pictureAiGrading')}</label>}
    <label>{uiText(promptMeta[0])}<textarea aria-label={uiText(promptMeta[0])} rows={3} maxLength={draft.kind === 'textDispatch' ? 5000 : 2000} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder={uiText(promptMeta[1])} /></label>
    {has('link') && <label>{chinese ? uiText("連結（選填）") : 'Link (optional)'}<input value={draft.url || ''} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://" /></label>}
    <button className="ghost-button" type="button" disabled={busy || (promptRequired && !draft.prompt.trim()) || plan.activities.length >= 20} onClick={() => {
      save({ ...plan, activities: [...plan.activities, { ...draft, id: crypto.randomUUID(), prompt: draft.prompt.trim(), url: draft.url?.trim() }] }); setDraft(initialActivity(draft.kind))
    }}><Plus size={16} />{chinese ? uiText("加入錦囊") : 'Add to plan'}</button>
    {notice && <p className="error" role="status">{uiText(notice)}</p>}
  </details>
}
