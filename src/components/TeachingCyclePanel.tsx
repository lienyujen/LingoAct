import { useEffect, useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import { usePresenterLocale } from '../lib/presenterI18n'
import type { Participant, Question } from '../types'

type Sample = { id: string; text: string; images: string[] }
type Need = { finding: string; evidenceIds: string[]; nextPrompt: string }
type Props = { question: Question; sessionId: string; presenterToken: string; participants: Participant[]; active: boolean; onDispatched: (question: Question) => void }

export function TeachingCyclePanel({ question, sessionId, presenterToken, participants, active, onDispatched }: Props) {
  const zh = usePresenterLocale() === 'zh-TW'
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
  async function dispatch() {
    const data = await call(mode === 'repeat' || mode === 'followup' ? 'teaching_repeat' : mode === 'pair' ? 'teaching_pair' : 'teaching_discuss', {
      focus, responseType: mode === 'followup' ? 'short_answer' : undefined, sampleIds: selected, participantIds: roster, materialA, materialB,
    })
    onDispatched(data.question)
  }
  const canRepeat = ['short_answer', 'pronunciation', 'oral_response', 'custom_quiz'].includes(question.type) && question.teaching_mode !== 'pair'
  return <details className="panel teaching-cycle-panel">
    <summary>{zh ? '下一步教學' : 'Next teaching step'}</summary>
    <div className="teaching-cycle-actions">
      {canRepeat && <button disabled={busy || !active} type="button" onClick={() => { setMode('repeat'); setFocus('') }}>{zh ? '再練一次' : 'Practise again'}</button>}
      <button disabled={busy} type="button" onClick={() => { setMode('discuss'); void run(loadSamples) }}>{zh ? '挑作品討論' : 'Discuss student work'}</button>
      <button disabled={busy} type="button" onClick={() => { setMode('diagnose'); void run(loadSamples) }}>{zh ? '看看全班卡在哪' : 'Review learning needs'}</button>
      <button disabled={busy || !active} type="button" onClick={() => { setMode('pair'); setFocus(''); setRoster([]) }}>{zh ? 'A／B 資訊差' : 'A/B information gap'}</button>
      {question.teaching_mode === 'pair' && <button disabled={busy} type="button" onClick={() => void run(loadSamples)}>{zh ? '更新各組結果' : 'Refresh pair results'}</button>}
    </div>
    {mode && <div className="teaching-cycle-editor">
      <label>{zh ? mode === 'repeat' ? '這一輪只練什麼？' : '共同任務／討論問題' : 'Focus / discussion prompt'}
        <textarea maxLength={500} value={focus} onChange={e => setFocus(e.target.value)} placeholder={zh ? '例如：加上一句原因，讓讀者更容易理解。' : 'For example: add a reason to make your meaning clearer.'} />
      </label>
      {mode === 'repeat' && <p className="muted">{zh ? '沿用原教材，保留上一輪作答。派送後，全班開始新的一輪。' : 'Reuse the material and keep the previous responses. Dispatch starts a new round for the class.'}</p>}
      {mode === 'discuss' && <>
        <p className="muted">{zh ? '選 1–3 份；派送前請確認原文內沒有姓名等個人資訊。' : 'Select 1–3 works. Check the text for personal information before sharing.'}</p>
        {!samples.length && <p>{zh ? '目前沒有可選作品。' : 'No work available yet.'}</p>}
        {samples.map((s, i) => <label className="teaching-sample" key={s.id}>
          <input type="checkbox" checked={selected.includes(s.id)} disabled={!selected.includes(s.id) && selected.length >= 3} onChange={e => setSelected(v => e.target.checked ? [...v, s.id] : v.filter(id => id !== s.id))} />
          <span><strong>{zh ? '作品' : 'Work'} {i + 1}</strong><p>{s.text}</p>{s.images.map((image, at) => <img key={at} src={image} alt="" />)}</span>
        </label>)}
      </>}
      {mode === 'diagnose' && <>
        <button disabled={busy || !samples.length} type="button" onClick={() => void run(async () => {
          const data = await call('teaching_diagnose', { focus }); setNeeds(data.needs || [])
        })}>{zh ? 'AI 分析本題（最多 40 份）' : 'Analyse this task (up to 40 works)'}</button>
        {needs.map((n, i) => <article key={i}>
          <strong>{n.finding}</strong>
          {n.evidenceIds.map(id => <blockquote key={id}>{samples.find(s => s.id === id)?.text}</blockquote>)}
          <p>{n.nextPrompt}</p>
          <button type="button" disabled={!active || !canRepeat} onClick={() => { setFocus(n.nextPrompt); setMode('followup') }}>{zh ? '用這個重點再練' : 'Practise with this focus'}</button>
        </article>)}
      </>}
      {mode === 'pair' && <>
        <label>A<textarea maxLength={4000} value={materialA} onChange={e => setMaterialA(e.target.value)} /></label>
        <label>B<textarea maxLength={4000} value={materialB} onChange={e => setMaterialB(e.target.value)} /></label>
        <p>{zh ? '勾選學生，依下方名單順序兩人一組。請選偶數位；每組一人送出共同結果。' : 'Select an even number of learners; adjacent selected names form a pair. Either partner submits the shared result.'}</p>
        {participants.map(p => <label className="teaching-sample" key={p.id}><input type="checkbox" checked={roster.includes(p.id)} onChange={e => setRoster(v => e.target.checked ? [...v, p.id] : v.filter(id => id !== p.id))} />{p.name}</label>)}
        <p>{participants.filter(p => roster.includes(p.id)).map((p, i) => `${Math.floor(i / 2) + 1}${i % 2 ? 'B' : 'A'}: ${p.name}`).join(' · ')}</p>
      </>}
      {mode !== 'diagnose' && <button disabled={busy || !active || !focus.trim() || (mode === 'discuss' && !selected.length) || (mode === 'pair' && (!materialA.trim() || !materialB.trim() || roster.length < 2 || roster.length % 2 !== 0))} type="button" onClick={() => void run(dispatch)}>{busy ? (zh ? '派送中…' : 'Sending…') : (zh ? '派送給全班' : 'Send to class')}</button>}
    </div>}
    {pairs.map((p, i) => <article key={p.id}><strong>{zh ? '第' : 'Pair'} {i + 1} {zh ? '組' : ''}: {participants.find(v => v.id === p.participant_a)?.name} / {participants.find(v => v.id === p.participant_b)?.name}</strong><p>{p.result || (zh ? '尚未送出' : 'Not submitted')}</p></article>)}
    {error && <p role="alert" className="error">{error}</p>}
  </details>
}
