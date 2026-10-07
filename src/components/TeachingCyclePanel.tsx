import { uiText } from '../lib/uiText'
import { useEffect, useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import { usePresenterLocale } from '../lib/presenterI18n'
import type { Participant, Question } from '../types'

type Sample = { id: string; text: string; images: string[] }
type Need = { finding: string; evidenceIds: string[]; nextPrompt: string }
type Props = { question: Question; sessionId: string; presenterToken: string; participants: Participant[]; active: boolean; onDispatched: (question: Question) => void }

export function TeachingCyclePanel({ question, sessionId, presenterToken, participants, active, onDispatched }: Props) {
  const zh = ['zh-TW', 'zh-CN'].includes(usePresenterLocale())
  const [mode, setMode] = useState('')
  const [focus, setFocus] = useState('')
  const [samples, setSamples] = useState<Sample[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [needs, setNeeds] = useState<Need[]>([])
  const [roster, setRoster] = useState<string[]>([])
  const [materialA, setMaterialA] = useState('')
  const [materialB, setMaterialB] = useState('')
  const [pairs, setPairs] = useState<Array<{ id: string; participant_a: string; participant_b: string; result: string | null }>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function call(action: string, fields = {}) {
    const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
      body: { action, sessionId, presenterToken, questionId: question.id, ...fields },
    })
    if (error) throw error
    if (data?.message) throw new Error(data.message)
    return data
  }
  useEffect(() => { setMode(''); setFocus(''); setSelected([]); setSamples([]); setNeeds([]); setPairs([]); setError('') }, [question.id])
  async function run(work: () => Promise<void>) {
    setBusy(true); setError('')
    try { await work() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  async function loadSamples() {
    const data = await call('teaching_samples')
    setSamples(data.samples || []); setPairs(data.pairs || [])
  }
  function openPair() {
    setMode('pair'); setFocus(''); setMaterialA(''); setMaterialB('')
    // Start with the largest complete set of pairs. The teacher can still
    // remove or replace anyone, but a two-person class should not need four
    // extra clicks before a shared task becomes available.
    setRoster(participants.slice(0, participants.length - participants.length % 2).map(p => p.id))
  }
  async function dispatch() {
    const data = await call(mode === 'repeat' || mode === 'followup' ? 'teaching_repeat' : mode === 'pair' ? 'teaching_pair' : 'teaching_discuss', {
      focus, responseType: mode === 'followup' ? 'short_answer' : undefined, sampleIds: selected, participantIds: roster, materialA, materialB,
    })
    onDispatched(data.question)
  }
  const canRepeat = ['short_answer', 'pronunciation', 'oral_response', 'custom_quiz'].includes(question.type) && question.teaching_mode !== 'pair'
  return <details className="panel teaching-cycle-panel">
    <summary>{zh ? uiText("下一步教學") : 'Next teaching step'}</summary>
    <div className="teaching-cycle-actions">
      {canRepeat && <button disabled={busy || !active} type="button" onClick={() => { setMode('repeat'); setFocus('') }}>{zh ? uiText("再練一次") : "Practice again"}</button>}
      <button disabled={busy} type="button" onClick={() => { setMode('discuss'); void run(loadSamples) }}>{zh ? uiText("挑作品討論") : 'Discuss student work'}</button>
      <button disabled={busy} type="button" onClick={() => { setMode('diagnose'); void run(loadSamples) }}>{zh ? uiText("看看全班卡在哪") : 'Review learning needs'}</button>
      <button disabled={busy || !active || participants.length < 2} type="button" onClick={openPair}>{zh ? uiText("兩人共同任務") : 'Pair task'}</button>
      {question.teaching_mode === 'pair' && <button disabled={busy} type="button" onClick={() => void run(loadSamples)}>{zh ? uiText("更新各組結果") : 'Refresh pair results'}</button>}
    </div>
    {mode && <div className="teaching-cycle-editor">
      <label>{zh ? mode === 'repeat' ? uiText("這一輪只練什麼？") : mode === 'pair' ? uiText("共同任務") : uiText("討論問題") : mode === 'pair' ? 'Shared task' : 'Focus / discussion prompt'}
        <textarea maxLength={500} value={focus} onChange={e => setFocus(e.target.value)} placeholder={zh ? uiText("例如：加上一句原因，讓讀者更容易理解。") : 'For example: add a reason to make your meaning clearer.'} />
      </label>
      {mode === 'repeat' && <p className="muted">{zh ? uiText("沿用原教材，保留上一輪作答。派送後，全班開始新的一輪。") : "Reuse the same material. Previous responses are saved, and sending the activity starts a new round for the class."}</p>}
      {mode === 'discuss' && <>
        <p className="muted">{zh ? uiText("選 1–3 份；派送前請確認原文內沒有姓名等個人資訊。") : "Choose 1–3 samples of student work. Check for names and other personal information before sharing them."}</p>
        {!samples.length && <p>{zh ? uiText("目前沒有可選作品。") : 'No work available yet.'}</p>}
        {samples.map((s, i) => <label className="teaching-sample" key={s.id}>
          <input type="checkbox" checked={selected.includes(s.id)} disabled={!selected.includes(s.id) && selected.length >= 3} onChange={e => setSelected(v => e.target.checked ? [...v, s.id] : v.filter(id => id !== s.id))} />
          <span><strong>{zh ? uiText("作品") : 'Work'} {i + 1}</strong><p>{s.text}</p>{s.images.map((image, at) => <img key={at} src={image} alt="" />)}</span>
        </label>)}
      </>}
      {mode === 'diagnose' && <>
        <button disabled={busy || !samples.length} type="button" onClick={() => void run(async () => {
          const data = await call('teaching_diagnose', { focus }); setNeeds(data.needs || [])
        })}>{zh ? uiText("AI 分析本題（最多 40 份）") : "Analyze responses with AI (up to 40 submissions)"}</button>
        {needs.map((n, i) => <article key={i}>
          <strong>{n.finding}</strong>
          {n.evidenceIds.map(id => <blockquote key={id}>{samples.find(s => s.id === id)?.text}</blockquote>)}
          <p>{n.nextPrompt}</p>
          <button type="button" disabled={!active || !canRepeat} onClick={() => { setFocus(n.nextPrompt); setMode('followup') }}>{zh ? uiText("用這個重點再練") : "Practice this skill"}</button>
        </article>)}
      </>}
      {mode === 'pair' && <>
        <p className="muted">{zh ? uiText("每組兩人共同完成上面的任務；A、B 各自只會看到自己的資料。") : "Partners work together on the task. Each student sees only their own material: A or B."}</p>
        <label>{zh ? uiText("A 的資料") : 'Material A'}<textarea maxLength={4000} value={materialA} onChange={e => setMaterialA(e.target.value)} /></label>
        <label>{zh ? uiText("B 的資料") : 'Material B'}<textarea maxLength={4000} value={materialB} onChange={e => setMaterialB(e.target.value)} /></label>
        <p>{zh ? uiText("勾選學生，依下方名單順序兩人一組。請選偶數位；每組一人送出共同結果。") : "Select an even number of students. They will be paired in the order listed below. One student in each pair submits their shared response."}</p>
        {participants.map(p => <label className="teaching-sample" key={p.id}><input type="checkbox" checked={roster.includes(p.id)} onChange={e => setRoster(v => e.target.checked ? [...v, p.id] : v.filter(id => id !== p.id))} />{p.name}</label>)}
        <p>{participants.filter(p => roster.includes(p.id)).map((p, i) => `${Math.floor(i / 2) + 1}${i % 2 ? 'B' : 'A'}: ${p.name}`).join(' · ')}</p>
      </>}
      {mode !== 'diagnose' && <button disabled={busy || !active || !focus.trim() || (mode === 'discuss' && !selected.length) || (mode === 'pair' && (!materialA.trim() || !materialB.trim() || roster.length < 2 || roster.length % 2 !== 0))} type="button" onClick={() => void run(dispatch)}>{busy ? (zh ? uiText("派送中…") : 'Sending…') : (zh ? uiText("派送給全班") : 'Send to class')}</button>}
    </div>}
    {pairs.map((p, i) => <article key={p.id}><strong>{zh ? uiText("第") : 'Pair'} {i + 1} {zh ? uiText("組") : ''}: {participants.find(v => v.id === p.participant_a)?.name} / {participants.find(v => v.id === p.participant_b)?.name}</strong><p>{p.result || (zh ? uiText("尚未送出") : 'Not submitted')}</p></article>)}
    {error && <p role="alert" className="error">{uiText(error)}</p>}
  </details>
}
