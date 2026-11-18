import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import type { ParticipantLocale } from '../lib/participantI18n'
import { hanCharacters, moeStrokePracticeUrl } from '../lib/hanStrokePractice'
import type { checkHanWriting } from '../lib/hanStrokePractice'
import { edgeFunctionErrorMessage } from '../lib/edgeError'
import type { Ink, InkPoint } from '../lib/hanStrokePractice'
import { requireSupabase } from '../lib/supabase'

export type StrokeCredentials = { sessionId: string; participantId: string; participantToken: string; questionId?: string }

function WritingBoard({ character, credentials, english }: { character: string; credentials: StrokeCredentials; english: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ink = useRef<Ink>([])
  const pointer = useRef<number | null>(null)
  const [strokeCount, setStrokeCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ReturnType<typeof checkHanWriting> | null>(null)
  const attempt = useRef<string | null>(null)

  async function submit() {
    if (busy || result || !strokeCount || !credentials.questionId || pointer.current !== null) return
    setBusy(true)
    setError('')
    attempt.current ||= crypto.randomUUID()
    const sampled = ink.current.map(stroke => {
      const count = Math.min(stroke.length, 80)
      return Array.from({ length: count }, (_, i) => {
        const point = stroke[Math.round(i * (stroke.length - 1) / Math.max(1, count - 1))]
        return { x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10 }
      })
    })
    try {
      const { data, error: failure } = await requireSupabase().functions.invoke('participant-action', {
        body: { action: 'submit_handwriting_check', ...credentials, character, ink: sampled, checkId: attempt.current },
      })
      if (failure) throw new Error(await edgeFunctionErrorMessage(failure, '無法送出手寫結果。'))
      const check = data?.check
      if (!check) throw new Error('未收到手寫結果。')
      setResult(check.result === 'stroke' ? { status: 'stroke', stroke: check.wrong_stroke } : { status: check.result })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法送出手寫結果。')
    } finally { setBusy(false) }
  }

  function point(event: PointerEvent<HTMLCanvasElement>): InkPoint {
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(320, (event.clientX - left) * 320 / width)), y: Math.max(0, Math.min(320, (event.clientY - top) * 320 / height)) }
  }

  function paint(a: InkPoint, b: InkPoint) {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#182235'
    ctx.fillStyle = ctx.strokeStyle
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.beginPath()
    if (a === b) { ctx.arc(a.x, a.y, 2.5, 0, 2 * Math.PI); ctx.fill(); return }
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (busy || pointer.current !== null || event.button !== 0 || ink.current.length >= 64) return
    const at = point(event)
    event.currentTarget.setPointerCapture(event.pointerId)
    pointer.current = event.pointerId
    attempt.current = null
    setError('')
    ink.current.push([at])
    paint(at, at)
    setStrokeCount(ink.current.length)
    setResult(null)
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (event.pointerId !== pointer.current) return
    const stroke = ink.current.at(-1)
    if (!stroke || stroke.length >= 350) return
    const at = point(event)
    paint(stroke.at(-1)!, at)
    stroke.push(at)
  }

  function end(event: PointerEvent<HTMLCanvasElement>) {
    if (pointer.current === event.pointerId) pointer.current = null
  }

  function reset() {
    attempt.current = null
    setError('')
    ink.current = []
    pointer.current = null
    canvas.current?.getContext('2d')?.clearRect(0, 0, 320, 320)
    setStrokeCount(0)
    setResult(null)
  }

  return (
    <div className="han-writing-board">
      <p>{english ? 'Write the character from memory, then check your writing.' : '在空白格中默寫，再檢查字形和筆順。'}</p>
      <canvas ref={canvas} width={320} height={320} aria-label={english ? 'Handwriting area' : '漢字手寫區'}
        onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} />
      <div className="segmented-control">
        <button type="button" disabled={busy} onClick={reset}>{english ? 'Clear' : '清除'}</button>
        <button type="button" disabled={!strokeCount || busy || Boolean(result) || !credentials.questionId} onClick={() => void submit()}>
          {english ? 'Check writing' : '檢查手寫'}
        </button>
      </div>
      <p aria-live="polite">
        {error || (busy ? (english ? 'Checking and saving…' : '檢查並儲存中…') : result?.status === 'match' ? (english ? 'Matches the target character.' : '寫對了，字形和筆順符合目標字。')
              : result?.status === 'count' ? (english ? 'Check the number of strokes and try again.' : '筆畫數與目標字不同，請再試一次。')
                : result?.status === 'stroke' ? (english ? `Review stroke ${result.stroke} and try again.` : `請檢查第 ${result.stroke} 筆的形狀、方向和位置。`) : '')}
      </p>
    </div>
  )
}

export function StrokePracticeLinks({ text, locale, credentials }: { text: string; locale: ParticipantLocale; credentials?: StrokeCredentials }) {
  const characters = hanCharacters(text)
  const [selection, setSelection] = useState('')
  const [writing, setWriting] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  if (!characters.length) return null
  const english = locale === 'en'
  const label = english ? 'Stroke practice' : '筆順練習'
  return (
    <div className="stroke-practice-links">
      {label}{' '}
      {characters.map(character => credentials
        ? <button key={character} className="ghost-button" type="button" aria-label={`${label}: ${character}`}
            onClick={() => { setSelection(character); setWriting(false); dialog.current?.showModal() }}>{character}</button>
        : <a key={character} href={moeStrokePracticeUrl(character)} target="_blank" rel="noopener noreferrer"
            aria-label={`${label}: ${character}`} style={{ marginInlineEnd: '0.65em' }}>{character} ↗</a>)}
      {credentials && <dialog ref={dialog} className="han-practice-dialog" onClose={() => setSelection('')}>
        <div className="panel-heading">
          <strong>{writing ? (english ? 'Write from memory' : '自己寫一遍') : `${label} · ${selection}`}</strong>
          <button type="button" onClick={() => dialog.current?.close()}>{english ? 'Close' : '關閉'}</button>
        </div>
        {selection && (writing
          ? <WritingBoard key={selection} character={selection} credentials={credentials} english={english} />
          : <iframe title={`${label}: ${selection}`} src={moeStrokePracticeUrl(selection)} referrerPolicy="no-referrer" />)}
        <div className="segmented-control">
          {credentials.questionId && <button type="button" onClick={() => setWriting(value => !value)}>{writing ? label : english ? 'Write from memory' : '自己寫一遍'}</button>}
          {!writing && selection && <a href={moeStrokePracticeUrl(selection)} target="_blank" rel="noopener noreferrer">{english ? 'Open official practice ↗' : '另開教育部練習 ↗'}</a>}
        </div>
      </dialog>}
    </div>
  )
}
