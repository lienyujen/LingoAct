import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Play, Plus, Trash } from '@phosphor-icons/react'
import { usePresenterLocale, usePresenterText } from '../lib/presenterI18n'
import type { ListeningAccent } from '../lib/listening'
import type { QuestionType, QuizRequestedType } from '../types'

export type PlannedActivityKind =
  | 'listen' | 'capture' | 'flashcard' | 'quiz'
  | 'sentence' | 'picture' | 'picture_ordering' | 'writing' | 'photo'
  | 'text' | 'file' | 'exit_ticket'

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
const KINDS: PlannedActivityKind[] = ['listen', 'capture', 'flashcard', 'quiz', 'sentence', 'picture', 'picture_ordering', 'writing', 'photo', 'text', 'file', 'exit_ticket']
const GROUPS: Array<{ id: string; kinds: PlannedActivityKind[] }> = [
  { id: 'listen', kinds: ['listen'] },
  { id: 'express', kinds: ['sentence', 'picture', 'picture_ordering', 'writing', 'photo'] },
  { id: 'understand', kinds: ['capture', 'flashcard', 'quiz'] },
  { id: 'materials', kinds: ['text', 'file'] },
  { id: 'wrap', kinds: ['exit_ticket'] },
]

function cleanActivity(value: unknown): PlannedActivity | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<PlannedActivity>
  if (typeof item.id !== 'string' || !KINDS.includes(item.kind as PlannedActivityKind)) return null
  return { ...item, id: item.id, kind: item.kind as PlannedActivityKind, prompt: typeof item.prompt === 'string' ? item.prompt.slice(0, 5000) : '', url: typeof item.url === 'string' ? item.url.slice(0, 2048) : undefined }
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
    quizType: kind === 'writing' ? 'writing' : kind === 'flashcard' ? 'flashcard' : 'random',
    count: 'auto', coaching: kind === 'writing', pictureMode: 'spoken', aiGrading: false,
    prepareSeconds: null, answerSeconds: kind === 'sentence' ? 120 : null,
  }
}

export function LessonPlan({ courseName, busy = false, onStart }: {
  courseName: string; busy?: boolean; onStart?: (activity: PlannedActivity, goal: string) => void
}) {
  const base = courseName.trim()
  const storageKey = `lingoact_lesson_plan_v2:${base}`
  const legacyKey = `lingoact_lesson_plan_v1:${base}`
  const [plan, setPlan] = useState(() => readPlan(storageKey, legacyKey))
  const [group, setGroup] = useState('express')
  const [draft, setDraft] = useState<PlannedActivity>(() => initialActivity('sentence'))
  const [notice, setNotice] = useState('')
  const t = usePresenterText()
  const chinese = usePresenterLocale() === 'zh-TW'
  const labels: Record<PlannedActivityKind, string> = {
    listen: t('listeningStudio'), capture: t('captureQuestion'), flashcard: t('flashcards'), quiz: t('typeCustomQuiz'),
    sentence: t('sentenceWall'), picture: t('pictureTalk'), picture_ordering: t('storyOrdering'), writing: t('writingCoach'),
    photo: t('photoTask'), text: t('textDispatch'), file: t('fileTransfer'), exit_ticket: t('generateExitTicket'),
  }
  const groupLabels: Record<string, string> = chinese
    ? { listen: '聽與朗讀', express: '說與寫', understand: '閱讀與詞彙', materials: '教材派送', wrap: '收尾' }
    : { listen: 'Listen & read aloud', express: 'Speak & write', understand: 'Reading & vocabulary', materials: 'Materials', wrap: 'Wrap up' }
  const availableKinds = GROUPS.find((item) => item.id === group)?.kinds || []
  const promptMeta = useMemo(() => {
    if (draft.kind === 'listen') return [chinese ? '課文或對話' : 'Passage or dialogue', chinese ? '貼上要轉成語音的文字' : 'Paste the text to turn into speech']
    if (draft.kind === 'sentence') return [chinese ? '造句題目' : 'Sentence prompt', chinese ? '例如：用「因為…所以…」說明原因' : 'e.g. Explain a reason using “because”']
    if (draft.kind === 'picture' || draft.kind === 'picture_ordering') return [chinese ? '圖片與故事方向' : 'Picture and story direction', chinese ? '例如：兩個學生在雨天互相幫助' : 'e.g. Two students help each other on a rainy day']
    if (draft.kind === 'photo') return [chinese ? '任務說明' : 'Task', chinese ? '學生要拍什麼、說明什麼？' : 'What should students photograph and describe?']
    if (draft.kind === 'text') return [chinese ? '要派送的文字' : 'Text to send', chinese ? '輸入學生要看到的內容' : 'What students should see']
    if (draft.kind === 'file' || draft.kind === 'exit_ticket') return [chinese ? '備註（選填）' : 'Note (optional)', chinese ? '例如：下課前派送' : 'e.g. Send before class ends']
    return [chinese ? '出題方向' : 'Direction', chinese ? '說明教材範圍、練習目標與難度' : 'Material, learning target and difficulty']
  }, [chinese, draft.kind])

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
    const first = GROUPS.find((item) => item.id === id)?.kinds[0] || 'sentence'
    setGroup(id); setDraft(initialActivity(first))
  }
  function summary(item: PlannedActivity) {
    const parts = [item.prompt]
    if (item.kind === 'listen') {
      parts.push(item.listeningKind === 'dialogue' ? (chinese ? '對話' : 'Dialogue') : (chinese ? '課文段落' : 'Passage'))
      const accentKey = item.accent === 'putonghua' ? 'accentPutonghua' : item.accent === 'taiwanese' ? 'accentTaiwanese' : 'accentStandardGuoyu'
      const dispatchKey = item.dispatchTarget === 'quiz' ? 'sendListeningQuiz' : item.dispatchTarget === 'read_aloud' ? 'sendReadAloud' : 'sendAudioOnly'
      parts.push(t(accentKey), t(dispatchKey))
    }
    if (['flashcard', 'quiz', 'writing'].includes(item.kind)) parts.push(item.count === 'auto' ? (chinese ? '數量自動' : 'Auto count') : `${item.count}`)
    if (item.kind === 'text' && item.url) parts.push(item.url)
    return parts.filter(Boolean).join(' · ') || (chinese ? '開啟後再選擇教材' : 'Choose the material after opening')
  }
  const promptRequired = !['file', 'exit_ticket'].includes(draft.kind)

  return <details className="teacher-disclosure lesson-plan">
    <summary>{chinese ? '備課小抄' : 'Lesson plan'}{plan.activities.length ? ` · ${plan.activities.length}` : ''}</summary>
    <p className="muted">{chinese ? '課程目標與活動順序會自動保存在這台電腦。開啟後確認內容再派送。' : 'Goals and activities are saved on this computer. Open an activity, review it, then send.'}</p>
    <label>{chinese ? '今天想讓學生學會什麼？' : 'What should students be able to do?'}
      <input maxLength={200} value={plan.goal} onChange={(event) => save({ ...plan, goal: event.target.value })} placeholder={chinese ? '例如：用「因為…所以…」說明自己的選擇' : 'e.g. Explain a choice using “because”'} />
    </label>
    {plan.goal && <p className="muted">{chinese ? '從小抄開啟 AI 活動時，這個目標會作為出題參考，不會顯示給學生。' : 'AI activities opened from this plan use the goal as private context.'}</p>}
    <ol className="lesson-plan-list">
      {plan.activities.map((item, index) => <li key={item.id}>
        <strong>{index + 1}. {labels[item.kind]}</strong><p>{summary(item)}</p>
        <div className="lesson-plan-actions">
          {onStart && <button disabled={busy} type="button" onClick={() => onStart(item, plan.goal.trim())}><Play size={15} />{chinese ? '開啟活動' : 'Open activity'}</button>}
          <button className="ghost-button icon-button" disabled={index === 0 || busy} type="button" aria-label={chinese ? '往前移' : 'Move up'} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button className="ghost-button icon-button" disabled={index === plan.activities.length - 1 || busy} type="button" aria-label={chinese ? '往後移' : 'Move down'} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          <button className="ghost-button icon-button" disabled={busy} type="button" aria-label={chinese ? '移除備課項目' : 'Remove planned activity'} onClick={() => save({ ...plan, activities: plan.activities.filter((candidate) => candidate.id !== item.id) })}><Trash size={16} /></button>
        </div>
      </li>)}
    </ol>
    <div className="lesson-plan-groups" aria-label={chinese ? '活動類別' : 'Activity category'}>
      {GROUPS.map((item) => <button key={item.id} type="button" aria-pressed={group === item.id} onClick={() => chooseGroup(item.id)}>{groupLabels[item.id]}</button>)}
    </div>
    <label>{chinese ? '加入一個活動' : 'Add an activity'}
      <select value={draft.kind} onChange={(event) => setDraft(initialActivity(event.target.value as PlannedActivityKind))}>{availableKinds.map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select>
    </label>
    {draft.kind === 'listen' && <div className="lesson-plan-options">
      <select aria-label={chinese ? '內容形式' : 'Format'} value={draft.listeningKind} onChange={(e) => setDraft({ ...draft, listeningKind: e.target.value as 'passage' | 'dialogue' })}><option value="passage">{chinese ? '課文段落' : 'Passage'}</option><option value="dialogue">{chinese ? '對話' : 'Dialogue'}</option></select>
      <select aria-label={chinese ? '中文口音' : 'Mandarin accent'} value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value as ListeningAccent })}><option value="standard_guoyu">{t('accentStandardGuoyu')}</option><option value="putonghua">{t('accentPutonghua')}</option><option value="taiwanese">{t('accentTaiwanese')}</option></select>
      <select aria-label={chinese ? '預計派送方式' : 'Planned dispatch'} value={draft.dispatchTarget} onChange={(e) => setDraft({ ...draft, dispatchTarget: e.target.value as PlannedActivity['dispatchTarget'] })}><option value="audio">{t('sendAudioOnly')}</option><option value="read_aloud">{t('sendReadAloud')}</option><option value="quiz">{t('sendListeningQuiz')}</option></select>
      <select aria-label={t('replayCount')} value={draft.replayLimit ?? 'unlimited'} onChange={(e) => setDraft({ ...draft, replayLimit: e.target.value === 'unlimited' ? null : Number(e.target.value) })}><option value="unlimited">{chinese ? '不限次' : 'Unlimited'}</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select>
      {draft.dispatchTarget === 'read_aloud' && <select aria-label={t('prepareTime')} value={draft.prepareSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, prepareSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noPrepare')}</option><option value="10">10 秒</option><option value="20">20 秒</option><option value="30">30 秒</option></select>}
      {draft.dispatchTarget === 'read_aloud' && <select aria-label={t('readAloudTime')} value={draft.answerSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, answerSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noTimeLimit')}</option><option value="30">30 秒</option><option value="60">60 秒</option><option value="90">90 秒</option></select>}
    </div>}
    {draft.kind === 'capture' && <>
      <div className="lesson-plan-options">
        <select value={draft.questionType} onChange={(e) => setDraft({ ...draft, questionType: e.target.value as QuestionType })}><option value="multiple_choice">{t('typeMultipleChoice')}</option><option value="poll">{t('typePoll')}</option><option value="short_answer">{t('typeShortAnswer')}</option><option value="oral_response">{t('typeOralResponse')}</option><option value="pronunciation">{t('typePronunciation')}</option><option value="file_upload">{t('typeFileUpload')}</option><option value="send_screen">{t('typeSendScreen')}</option></select>
        {['oral_response', 'pronunciation'].includes(draft.questionType || '') && <select aria-label={t('prepareTime')} value={draft.prepareSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, prepareSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noPrepare')}</option><option value="10">10 秒</option><option value="20">20 秒</option><option value="30">30 秒</option></select>}
        {!['file_upload', 'send_screen'].includes(draft.questionType || '') && <select aria-label={t('answerTime')} value={draft.answerSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, answerSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noTimeLimit')}</option><option value="30">30 秒</option><option value="60">60 秒</option><option value="90">90 秒</option><option value="180">180 秒</option></select>}
      </div>
      {['multiple_choice', 'poll'].includes(draft.questionType || '') && <>
        <label>{t('options')}<textarea rows={3} value={(draft.options || []).join('\n')} onChange={(e) => setDraft({ ...draft, options: e.target.value.split('\n').slice(0, 8) })} /></label>
        <label className="lesson-plan-check"><input checked={draft.allowMultiple} type="checkbox" onChange={(e) => setDraft({ ...draft, allowMultiple: e.target.checked })} />{t('allowMultiple')}</label>
      </>}
    </>}
    {['flashcard', 'quiz', 'writing'].includes(draft.kind) && <div className="lesson-plan-options">
      <select aria-label={chinese ? '教材來源' : 'Material source'} value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as 'screenshot' | 'file' })}><option value="screenshot">{chinese ? '上課時截圖' : 'Capture in class'}</option><option value="file">{chinese ? '上課時選檔' : 'Choose a file in class'}</option></select>
      <select aria-label={chinese ? '數量' : 'Count'} value={draft.count} onChange={(e) => setDraft({ ...draft, count: e.target.value })}><option value="auto">{t('autoDecide')}</option>{Array.from({ length: 10 }, (_, index) => index + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select>
      {draft.kind === 'quiz' && <select aria-label={chinese ? '題型' : 'Question type'} value={draft.quizType} onChange={(e) => setDraft({ ...draft, quizType: e.target.value as QuizRequestedType })}><option value="random">{t('typeRandom')}</option><option value="multiple_choice">{t('typeMultipleChoice')}</option><option value="fill_blank">{t('typeFillBlank')}</option><option value="short_answer">{t('typeShortAnswerQuiz')}</option><option value="ordering">{t('typeOrdering')}</option><option value="matching">{t('typeMatching')}</option></select>}
      {draft.kind === 'writing' && <label className="lesson-plan-check"><input checked={draft.coaching} type="checkbox" onChange={(e) => setDraft({ ...draft, coaching: e.target.checked })} />{chinese ? '開啟 AI 鷹架提問' : 'Enable AI coaching'}</label>}
    </div>}
    {draft.kind === 'sentence' && <select aria-label={t('answerTime')} value={draft.answerSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, answerSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noTimeLimit')}</option><option value="60">60 秒</option><option value="120">120 秒</option><option value="180">180 秒</option></select>}
    {draft.kind === 'picture' && <div className="lesson-plan-options"><select value={draft.pictureMode} onChange={(e) => setDraft({ ...draft, pictureMode: e.target.value as 'spoken' | 'written' })}><option value="spoken">{t('modeSpoken')}</option><option value="written">{t('modeWritten')}</option></select><select aria-label={t('answerTime')} value={draft.answerSeconds ?? 'none'} onChange={(e) => setDraft({ ...draft, answerSeconds: e.target.value === 'none' ? null : Number(e.target.value) })}><option value="none">{t('noTimeLimit')}</option><option value="60">60 秒</option><option value="120">120 秒</option><option value="180">180 秒</option></select></div>}
    {draft.kind === 'picture_ordering' && <label className="lesson-plan-check"><input checked={draft.aiGrading} type="checkbox" onChange={(e) => setDraft({ ...draft, aiGrading: e.target.checked })} />{t('pictureAiGrading')}</label>}
    <label>{promptMeta[0]}<textarea aria-label={promptMeta[0]} rows={3} maxLength={draft.kind === 'text' ? 5000 : 2000} value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} placeholder={promptMeta[1]} /></label>
    {draft.kind === 'text' && <label>{chinese ? '連結（選填）' : 'Link (optional)'}<input value={draft.url || ''} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="https://" /></label>}
    <button className="ghost-button" type="button" disabled={busy || (promptRequired && !draft.prompt.trim()) || plan.activities.length >= 20} onClick={() => {
      save({ ...plan, activities: [...plan.activities, { ...draft, id: crypto.randomUUID(), prompt: draft.prompt.trim(), url: draft.url?.trim() }] }); setDraft(initialActivity(draft.kind))
    }}><Plus size={16} />{chinese ? '加入備課小抄' : 'Add to plan'}</button>
    {notice && <p className="error" role="status">{notice}</p>}
  </details>
}
