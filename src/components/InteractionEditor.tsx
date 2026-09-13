import { useState } from 'react'
import { usePresenterLocale } from '../lib/presenterI18n'
import { sliceInteractionImage } from '../lib/screenshotInteraction'
import type { InteractionDraft, InteractionGenerated } from '../lib/screenshotInteraction'

export function InteractionEditor({ value, direction, previewUrl, onChange, onDirectionChange, onGenerate, onBusy }: {
  value: InteractionDraft; direction: string; previewUrl: string | null
  onChange: (value: InteractionDraft) => void; onDirectionChange: (value: string) => void
  onGenerate: (request: Record<string, unknown>) => Promise<InteractionGenerated>; onBusy: (busy: boolean) => void
}) {
  const zh = usePresenterLocale() === 'zh-TW'
  const [slicing, setSlicing] = useState(value.tiles.length > 0), [count, setCount] = useState(value.tiles.length || 4), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const change = (fields: Partial<InteractionDraft>) => onChange({ ...value, ...fields })
  async function generate() {
    setBusy(true); onBusy(true); setError('')
    try {
      const data = await onGenerate({ kind: slicing ? 'regions' : 'ordering', sentenceMode: value.sentenceMode, direction, count })
      if (slicing) {
        const tiles = await sliceInteractionImage(previewUrl!, (data.regions || []).slice(0, count))
        if (tiles.length < 2) throw new Error(zh ? '找不到足夠的區塊，請換截圖或補充出題方向。' : 'Not enough regions. Try another screenshot or add instructions.')
        change({ tiles, items: [] })
      } else {
        const items = (data.items || []).map(s => s.trim()).filter(Boolean).slice(0, 8)
        if (items.length < 2 || new Set(items).size !== items.length) throw new Error(zh ? '找不到足夠且不同的排序項目，請補充出題方向。' : 'No usable sequence. Please clarify your instructions.')
        change({ items, tiles: [] })
      }
      if (!direction.trim() && data.title) onDirectionChange(data.title)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false); onBusy(false) }
  }
  return <div className="interaction-editor">
    <label>{zh ? '出題方向（選填）' : 'Instructions (optional)'}<textarea maxLength={2000} rows={3} value={direction} onChange={e => onDirectionChange(e.target.value)} placeholder={value.kind === 'matching' ? (zh ? '例如：找出 5 個中文詞和意思做成配對題。這是派送前唯一的設定，不會預覽答案。' : 'Match five words to meanings. Answers will not be previewed.') : ''} /></label>
    <label className="interaction-check"><input type="checkbox" checked={value.shareScreenshot} onChange={e => change({ shareScreenshot: e.target.checked })} />{zh ? '同時把截圖給學生看' : 'Share the source screenshot'}</label>
    {value.kind === 'ordering' && <>
      <label className="interaction-check"><input type="checkbox" checked={slicing} onChange={e => { setSlicing(e.target.checked); change({ hasAnswer: !e.target.checked, sentenceMode: false, tiles: [], items: [] }) }} />{zh ? '用截圖分割出題' : 'Split screenshot into tiles'}</label>
      {slicing ? <label>{zh ? '切成幾塊' : 'Number of tiles'}<select value={count} onChange={e => { setCount(Number(e.target.value)); change({ tiles: [] }) }}>{[3, 4, 5, 6].map(n => <option key={n}>{n}</option>)}</select></label>
        : <label className="interaction-check"><input type="checkbox" checked={value.sentenceMode} onChange={e => change({ sentenceMode: e.target.checked, items: [] })} />{zh ? '語句排序' : 'Sentence ordering'}</label>}
      <button type="button" disabled={busy || !previewUrl} onClick={() => void generate()}>{busy ? (zh ? '產生中…' : 'Preparing…') : (zh ? 'AI 產生題目' : 'Generate items')}</button>
      <label className="interaction-check"><input type="checkbox" checked={value.hasAnswer} onChange={e => change({ hasAnswer: e.target.checked })} />{zh ? '有標準答案' : 'Use an answer key'}</label>
      {(value.items.length > 0 || value.tiles.length > 0) && <p className="muted">{zh ? '請確認順序；派送時才會打散。' : 'Review the order. Items are shuffled when sent.'}</p>}
      {(slicing ? value.tiles : value.items).map((item, i, list) => <div className="interaction-edit-row" key={i}>
        {slicing ? <img src={item} alt="" /> : <input value={item} aria-label={`${i + 1}`} onChange={e => change({ items: value.items.map((v, at) => at === i ? e.target.value : v) })} />}
        {([-1, 1] as const).map(delta => <button type="button" key={delta} disabled={i + delta < 0 || i + delta >= list.length} onClick={() => { const next = [...list]; [next[i], next[i + delta]] = [next[i + delta], next[i]]; change(slicing ? { tiles: next } : { items: next }) }}>{delta < 0 ? '↑' : '↓'}</button>)}
      </div>)}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>
}
