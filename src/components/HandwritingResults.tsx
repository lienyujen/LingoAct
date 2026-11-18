import { useEffect, useState } from 'react'
import { requireSupabase } from '../lib/supabase'
import { edgeFunctionErrorMessage } from '../lib/edgeError'
import type { Ink } from '../lib/hanStrokePractice'

type Row = {
  id: string
  participant_id: string
  participants: { name: string } | null
  character: string
  ink: Ink
  result: 'match' | 'count' | 'stroke'
  wrong_stroke: number | null
  expected_strokes: number
  created_at: string
}

export function HandwritingResults({ sessionId, questionId, presenterToken }: {
  sessionId: string; questionId: string; presenterToken: string
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [page, setPage] = useState(0)
  const [more, setMore] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let timer: number | undefined
    async function refresh() {
      setLoading(true)
      try {
        const { data, error: failure } = await requireSupabase().functions.invoke('presenter-action', {
          body: { action: 'get_handwriting_checks', sessionId, questionId, presenterToken, page },
        })
        if (failure) throw new Error(await edgeFunctionErrorMessage(failure, '無法讀取手寫結果。'))
        if (!cancelled) { setRows(data.checks); setMore(data.hasMore); setError('') }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '無法讀取手寫結果。')
      } finally {
        if (!cancelled) { setLoading(false); if (page === 0) timer = window.setTimeout(refresh, 5000) }
      }
    }
    void refresh()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [open, page, sessionId, questionId, presenterToken])

  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const key = `${row.participant_id}:${row.character}`
    groups.set(key, [...(groups.get(key) || []), row])
  }

  return (
    <details className="panel result-panel" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>生字手寫與重練</summary>
      {error && <p role="alert">{error}</p>}
      {open && !rows.length && <p>{loading ? '讀取中…' : '還沒有手寫檢查紀錄。'}</p>}
      {[...groups.values()].map(group => (
        <section key={group[0].id} className="handwriting-result-group">
          <h3>{group[0].participants?.name || '學生'} · {group[0].character}</h3>
          <div className="handwriting-result-cards">
            {[...group].reverse().map(row => (
              <figure key={row.id}>
                <svg viewBox="0 0 320 320" role="img" aria-label={`${row.character}的實際手寫筆跡`}>
                  {row.ink.map((stroke, i) => {
                    const color = row.wrong_stroke === i + 1 ? 'var(--danger)' : 'currentColor'
                    return stroke.length === 1
                      ? <circle key={i} cx={stroke[0].x} cy={stroke[0].y} r="3" fill={color} />
                      : <polyline key={i} points={stroke.map(point => `${point.x},${point.y}`).join(' ')}
                        stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  })}
                </svg>
                <figcaption>
                  <strong>{row.result === 'match' ? '寫對' : row.result === 'count'
                    ? `寫了 ${row.ink.length} 筆，應為 ${row.expected_strokes} 筆` : `第 ${row.wrong_stroke} 筆需重練`}</strong>
                  <small>{new Date(row.created_at).toLocaleTimeString('zh-TW')}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      {(page > 0 || more) && <div className="segmented-control">
        <button type="button" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>較新紀錄</button>
        <button type="button" disabled={!more || loading} onClick={() => setPage(value => value + 1)}>較早紀錄</button>
      </div>}
    </details>
  )
}
