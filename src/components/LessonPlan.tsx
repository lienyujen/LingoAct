import { useState } from 'react'
import { ArrowDown, ArrowUp, Play, Plus, Trash } from '@phosphor-icons/react'
import { usePresenterLocale, usePresenterText } from '../lib/presenterI18n'

export type PlannedActivity = { id: string; kind: 'listen' | 'sentence' | 'photo' | 'text'; prompt: string }
type Plan = { goal: string; activities: PlannedActivity[] }
const emptyPlan: Plan = { goal: '', activities: [] }

function readPlan(key: string): Plan {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    if (!value || typeof value.goal !== 'string' || !Array.isArray(value.activities)) return emptyPlan
    return { goal: value.goal.slice(0, 200), activities: value.activities.filter((item: PlannedActivity) =>
      item && typeof item.id === 'string' && ['listen', 'sentence', 'photo', 'text'].includes(item.kind)
      && typeof item.prompt === 'string' && item.prompt.length <= 300).slice(0, 20) }
  } catch { return emptyPlan }
}

export function LessonPlan({ courseName, busy = false, onStart }: {
  courseName: string; busy?: boolean; onStart?: (activity: PlannedActivity) => void
}) {
  // A named course can reuse a sequence without copying student work into it.
  const storageKey = `lingoact_lesson_plan_v1:${courseName.trim()}`
  const [plan, setPlan] = useState(() => readPlan(storageKey))
  const [kind, setKind] = useState<PlannedActivity['kind']>('sentence')
  const [prompt, setPrompt] = useState('')
  const [notice, setNotice] = useState('')
  const t = usePresenterText()
  const chinese = usePresenterLocale() === 'zh-TW'
  const labels = { listen: t('listeningStudio'), sentence: t('sentenceWall'), photo: t('photoTask'), text: t('textDispatch') }

  function save(next: Plan) {
    setPlan(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
      setNotice('')
    } catch { setNotice(chinese ? '無法儲存到這台電腦。請保留此頁面。' : 'Could not save on this computer. Keep this page open.') }
  }

  function move(index: number, offset: number) {
    const activities = [...plan.activities]
    const other = index + offset
    if (other < 0 || other >= activities.length) return
    ;[activities[index], activities[other]] = [activities[other], activities[index]]
    save({ ...plan, activities })
  }

  return <details className="teacher-disclosure lesson-plan">
    <summary>{chinese ? '備課小抄' : 'Lesson plan'}{plan.activities.length ? ` · ${plan.activities.length}` : ''}</summary>
    <p className="muted">{chinese ? '課程目標與活動順序會自動保存在這台電腦。開啟活動後，確認內容再派送。' : 'Goals and activities are saved on this computer. Open an activity, review it, then send.'}</p>
    <label>{chinese ? '今天想讓學生學會什麼？' : 'What should students be able to do?'}
      <input maxLength={200} value={plan.goal} onChange={(event) => save({ ...plan, goal: event.target.value })} placeholder={chinese ? '例如：用「因為…所以…」說明自己的選擇' : 'e.g. Explain a choice using “because”'} />
    </label>
    {plan.goal && <p className="muted">{chinese ? '這是老師的備課筆記，尚不會自動加入 AI 提示。' : 'This teacher note is not automatically included in AI prompts.'}</p>}
    <ol className="lesson-plan-list">
      {plan.activities.map((item, index) => <li key={item.id}>
        <strong>{index + 1}. {labels[item.kind]}</strong><p>{item.prompt}</p>
        <div className="lesson-plan-actions">
          {onStart && <button disabled={busy} type="button" onClick={() => onStart(item)}><Play size={15} />{chinese ? '開啟活動' : 'Open activity'}</button>}
          <button className="ghost-button icon-button" disabled={index === 0 || busy} type="button" aria-label={chinese ? '往前移' : 'Move up'} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
          <button className="ghost-button icon-button" disabled={index === plan.activities.length - 1 || busy} type="button" aria-label={chinese ? '往後移' : 'Move down'} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          <button className="ghost-button icon-button" disabled={busy} type="button" aria-label={chinese ? '移除備課項目' : 'Remove planned activity'} onClick={() => save({ ...plan, activities: plan.activities.filter((candidate) => candidate.id !== item.id) })}><Trash size={16} /></button>
        </div>
      </li>)}
    </ol>
    <label>{chinese ? '加入一個活動' : 'Add an activity'}
      <select value={kind} onChange={(event) => setKind(event.target.value as PlannedActivity['kind'])}>
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <textarea aria-label={chinese ? '活動內容' : 'Activity content'} rows={3} maxLength={300} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={chinese ? '輸入題目、語音稿或要分享的文字' : 'Enter a prompt, listening script, or text to share'} />
    <button className="ghost-button" type="button" disabled={busy || !prompt.trim() || plan.activities.length >= 20} onClick={() => {
      save({ ...plan, activities: [...plan.activities, { id: crypto.randomUUID(), kind, prompt: prompt.trim() }] })
      setPrompt('')
    }}><Plus size={16} />{chinese ? '加入備課小抄' : 'Add to plan'}</button>
    {notice && <p className="error" role="status">{notice}</p>}
  </details>
}
