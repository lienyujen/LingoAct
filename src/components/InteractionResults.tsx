import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PresenterQuizResults } from '../types'
import { usePresenterLocale } from '../lib/presenterI18n'
import { getPresenterToken } from '../lib/presenterAuth'
import { requireSupabase } from '../lib/supabase'
import { orderingRanking } from '../lib/orderingResults'
import { DragAnswers } from './DragAnswers'
import { InteractionReadout } from './InteractionReadout'

export function InteractionResults({ results, anonymousEnabled }: { results: PresenterQuizResults; anonymousEnabled: boolean }) {
  const zh = usePresenterLocale() === 'zh-TW', item = results.items[0]
  const incomingKey = results.keys.find(k => k.item_id === item?.id)?.accepted_answers || []
  const signature = JSON.stringify(incomingKey)
  const [key, setKey] = useState(incomingKey), [editing, setEditing] = useState(false), [draft, setDraft] = useState<string[]>([])
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [reveal, setReveal] = useState(false)
  useEffect(() => { setKey(JSON.parse(signature)) }, [signature])
  const answers = results.answers.filter(a => a.item_id === item?.id && a.answer_values?.length === item.options.length)
  const ranked = orderingRanking(item?.options || [], answers.map(a => a.answer_values || []))
  const order = JSON.stringify(ranked.map(r => r.item)), list = useRef<HTMLOListElement>(null), previous = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const next = new Map<string, number>()
    for (const row of [...(list.current?.children || [])] as HTMLElement[]) {
      const id = row.dataset.rankKey!, y = row.offsetTop, before = previous.current.get(id)
      next.set(id, y)
      if (before !== undefined && before !== y && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) row.animate([{ transform: `translateY(${before - y}px)` }, { transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,0,0,1)' })
    }
    previous.current = next
  }, [order])
  if (!item) return null
  const correct = answers.filter(a => key.length > 0 && key.every((v, i) => a.answer_values?.[i] === v)).length
  const marked = key.length > 0
  const label = (value: string) => item.option_images?.length ? <img src={item.option_images[item.options.indexOf(value)]} alt="" /> : value
  const mistakes = new Map<string, number>()
  for (const a of answers) {
    if (key.every((v, i) => a.answer_values?.[i] === v)) continue
    const text = (a.answer_values || []).join(item.sentence_mode ? '' : ' → ')
    mistakes.set(text, (mistakes.get(text) || 0) + 1)
  }
  async function save(values: string[]) {
    setBusy(true); setError('')
    try {
      const { error } = await requireSupabase().functions.invoke('presenter-action', { body: { action: 'interaction_key', sessionId: results.quiz.session_id, presenterToken: getPresenterToken(results.quiz.session_id), questionId: results.quiz.question_id, values } })
      if (error) throw error
      setKey(values); setEditing(false)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return <div className="interaction-results">
    <p>{zh ? `已作答 ${answers.length} 人` : `${answers.length} responses`}{marked ? (zh ? ` · 答對 ${correct} 人` : ` · ${correct} correct`) : (zh ? ' · 這一題沒有標準答案' : ' · No answer key')}</p>
    {marked && <><progress max={answers.length || 1} value={correct} /><label className="interaction-check"><input type="checkbox" checked={reveal} onChange={e => setReveal(e.target.checked)} />{zh ? '顯示正確答案' : 'Reveal answer key'}</label>{reveal && <InteractionReadout item={item} values={key} />}</>}
    {!marked && item.type === 'ordering' && answers.length > 0 && <>
      <h3>{zh ? '平均排序結果' : 'Average ranking'}</h3>
      <ol ref={list} className="interaction-ranking">{ranked.map(r => <li key={r.item} data-rank-key={r.item}>{label(r.item)}{answers.length > 1 && <small>{zh ? r.agreement === 100 ? '全班一致' : r.agreement >= 60 ? '多數這樣排' : '意見分歧' : r.agreement === 100 ? 'Unanimous' : r.agreement >= 60 ? 'Most agree' : 'Opinions differ'}</small>}</li>)}</ol>
    </>}
    {marked && item.type === 'ordering' && !item.option_images?.length && <details><summary>{zh ? '最常見的錯誤順序' : 'Common wrong sequences'}</summary>{[...mistakes].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([text, n]) => <p key={text}>{text} · {n}</p>)}</details>}
    {item.type === 'matching' && <div>{item.pair_prompts.map((prompt, i) => {
      const counts = new Map<string, number>(); answers.forEach(a => { const v = a.answer_values![i]; counts.set(v, (counts.get(v) || 0) + 1) })
      const wrong = [...counts].filter(([v]) => v !== key[i]).sort((a, b) => b[1] - a[1])[0]
      return <article key={i}><strong>{prompt}</strong>{marked && <p>{zh ? '答對' : 'Correct'} {counts.get(key[i]) || 0}/{answers.length}</p>}{reveal && marked && <p>{key[i]}</p>}{wrong && <p>{zh ? marked ? '最常誤選' : '最多選擇' : 'Most selected'}：{wrong[0]} · {wrong[1]}</p>}</article>
    })}</div>}
    <button type="button" className="ghost-button" disabled={busy} onClick={() => { setEditing(!editing); setDraft(marked ? key : item.type === 'matching' ? [] : item.options) }}>{zh ? marked ? '修改正確順序／配對' : '改為有標準答案' : 'Edit answer key'}</button>
    {editing && <><DragAnswers mode={item.type === 'matching' ? 'matching' : 'ordering'} options={item.options} values={draft} prompts={item.pair_prompts} images={item.option_images} locale={zh ? 'zh-TW' : 'en'} disabled={busy} onChange={setDraft} /><button type="button" disabled={busy || draft.filter(Boolean).length !== item.options.length} onClick={() => void save(draft)}>{zh ? '儲存並重新批改' : 'Save and re-mark'}</button>{marked && <button type="button" disabled={busy} className="ghost-button" onClick={() => void save([])}>{zh ? '改為無標準答案' : 'Remove answer key'}</button>}</>}
    {error && <p role="alert" className="error">{error}</p>}
    <details><summary>{zh ? '學生的作答' : 'Student responses'}</summary>{answers.map((a, i) => {
      const student = results.attempts.find(attempt => attempt.id === a.attempt_id)
      return <article key={a.id}><strong>{anonymousEnabled ? (zh ? `匿名作答 ${i + 1}` : `Response ${i + 1}`) : student?.participant_name}</strong>{marked && <span> · {key.every((v, at) => a.answer_values?.[at] === v) ? '✓' : '✗'}</span>}<InteractionReadout item={item} values={a.answer_values || []} /></article>
    })}</details>
  </div>
}
