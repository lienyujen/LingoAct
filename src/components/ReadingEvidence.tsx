import { useRef, useState } from 'react'
import { readingEvidenceSentences } from '../../supabase/functions/_shared/reading-evidence'
import type { Answer } from '../types'

export function ReadingEvidence({ body, prompt, active, answer, english, onSubmit }: {
  body: string
  prompt: string
  active: boolean
  answer: Answer | null
  english: boolean
  onSubmit: (quote: string, explanation: string) => Promise<void>
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sentences = readingEvidenceSentences(body)
  const quote = selected === null ? '' : sentences[selected]
  async function submit() {
    if (!active || busy || answer || !quote || !draft.trim()) return
    setBusy(true)
    setError('')
    try { await onSubmit(quote, draft.trim()) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to submit.') }
    finally { setBusy(false) }
  }

  return (
    <section className="panel participant-question">
      <h2>{english ? 'Evidence from the text' : '圈選原文證據'}</h2>
      <p>{prompt}</p>
      <p>{english ? 'Select one sentence. Explain how it supports your answer.' : '圈選一句原文，再寫下這句如何支持你的答案。'}</p>
      <div className="evidence-passage">
        {sentences.map((sentence, i) => (
          <button key={i} type="button" disabled={!active || busy || Boolean(answer)}
            aria-pressed={answer ? sentence === answer.answer_value : i === selected}
            onClick={() => setSelected(i === selected ? null : i)}>{sentence}</button>
        ))}
      </div>
      {answer ? <div><blockquote>{answer.answer_value}</blockquote><p>{answer.answer_text}</p></div> : active && (
        <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <label>{english ? 'Your answer and explanation' : '我的答案與理由'}
            <textarea value={draft} maxLength={500} disabled={busy} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <button type="submit" disabled={!quote || !draft.trim() || busy}>{english ? 'Submit' : '送出'}</button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

export function ReadingEvidenceComparison({ answers, prompt }: { answers: Answer[]; prompt: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const valid = answers.filter((answer) => answer.answer_value && answer.answer_text)
  const selected = valid.filter((answer) => chosen.includes(answer.id))
  const projected = selected.length ? selected : valid.slice(0, 2)
  return (
    <>
      <p>選擇最多兩則回覆一起投影。未選時顯示前兩則。</p>
      {valid.map((answer, index) => (
        <label key={answer.id} className="answer-item">
          <input type="checkbox" checked={chosen.includes(answer.id)} disabled={selected.length >= 2 && !chosen.includes(answer.id)}
            onChange={(event) => setChosen(event.target.checked ? [...chosen, answer.id] : chosen.filter(id => id !== answer.id))} />
          回覆 {index + 1}
          <blockquote>{answer.answer_value}</blockquote>
          <p>{answer.answer_text}</p>
        </label>
      ))}
      <button type="button" disabled={!projected.length} onClick={() => dialog.current?.showModal()}>匿名投影比較</button>
      <dialog ref={dialog} className="evidence-projection">
        <div className="panel-heading"><h2>原文證據比較</h2><button type="button" onClick={() => dialog.current?.close()}>關閉投影</button></div>
        <p>{prompt}</p>
        <div className="evidence-comparison">
          {projected.map((answer, index) => (
            <article key={answer.id}><h3>回覆 {index + 1}</h3><blockquote>{answer.answer_value}</blockquote><p>{answer.answer_text}</p></article>
          ))}
        </div>
      </dialog>
    </>
  )
}
