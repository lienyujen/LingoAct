import { useEffect, useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import type { Question } from '../types'
import type { ParticipantLocale } from '../lib/participantI18n'

type Context = { waiting?: boolean; role?: string; partner?: string; material?: string; result?: string; previous?: { text: string; audioUrl: string } }
export function ParticipantTeachingContext({ question, sessionId, participantId, participantToken, locale, active }: {
  question: Question; sessionId: string; participantId: string; participantToken: string; locale: ParticipantLocale; active: boolean
}) {
  const zh = locale === 'zh-TW'
  const [context, setContext] = useState<Context | null>(null)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await requireSupabase().functions.invoke('participant-action', {
        body: { action: 'teaching_context', sessionId, participantId, participantToken, questionId: question.id },
      })
      if (cancelled) return
      if (error) setError(error.message)
      else { setContext(data); setError('') }
    }
    void load()
    const timer = question.teaching_mode === 'pair' && active ? window.setInterval(() => void load(), 5000) : undefined
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [question.id, question.teaching_mode, sessionId, participantId, participantToken, active])
  async function submit() {
    setBusy(true); setError('')
    try {
      const { data, error } = await requireSupabase().functions.invoke('participant-action', {
        body: { action: 'teaching_pair_submit', sessionId, participantId, participantToken, questionId: question.id, result },
      })
      if (error) throw error
      setContext(data)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }
  return <section className="panel participant-teaching-context">
    {question.learning_focus && <p><strong>{zh ? '這一輪的重點' : 'This round’s focus'}</strong><br />{question.learning_focus}</p>}
    {(question.discussion_samples || []).map(sample => <article key={sample.label}>
      <strong>{zh ? '作品' : 'Work'} {sample.label}</strong><p>{sample.text}</p>
      {sample.images.map((image, i) => <img key={i} src={image} alt="" />)}
    </article>)}
    {context?.previous && (context.previous.text || context.previous.audioUrl) && <details>
      <summary>{zh ? '看看／聽聽自己的上一輪' : 'Read / listen to your previous round'}</summary>
      <p>{context.previous.text}</p>{context.previous.audioUrl && <audio controls src={context.previous.audioUrl} />}
    </details>}
    {question.teaching_mode === 'pair' && <>
      {!context && <p>{zh ? '載入分組資料…' : 'Loading your pair…'}</p>}
      {context?.waiting && <p>{zh ? '本輪尚未分組，請告訴老師。' : 'You are not assigned to a pair this round. Please tell your teacher.'}</p>}
      {context?.role && <>
        <h2>{context.role} · {zh ? '同伴' : 'Partner'}: {context.partner}</h2>
        <p>{context.material}</p>
        {context.result ? <article><strong>{zh ? '共同結果（已送出）' : 'Shared result (submitted)'}</strong><p>{context.result}</p></article> : <>
          <label>{zh ? '先和同伴討論，再由其中一人送出共同結果。' : 'Talk with your partner, then either of you can submit your shared result.'}
            <textarea maxLength={4000} value={result} onChange={e => setResult(e.target.value)} disabled={!active || busy} />
          </label>
          <button type="button" disabled={!active || busy || !result.trim()} onClick={() => void submit()}>{zh ? '送出共同結果' : 'Submit shared result'}</button>
        </>}
      </>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
