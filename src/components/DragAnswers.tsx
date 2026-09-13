import { useEffect, useId, useRef, useState } from 'react'
import Sortable from 'sortablejs'
import type { ParticipantLocale } from '../lib/participantI18n'
import { participantText } from '../lib/participantI18n'

type Props = { mode: 'ordering' | 'sentence' | 'matching'; options: string[]; values: string[]; prompts?: string[]; labels?: string[]; images?: string[]; disabled?: boolean; locale: ParticipantLocale; onChange: (values: string[]) => void }
export function DragAnswers(props: Props) {
  const { mode, options, values, prompts = [], labels = options, images = [], disabled, locale } = props
  const group = useId(), root = useRef<HTMLDivElement>(null), latest = useRef(props)
  latest.current = props
  const signature = JSON.stringify([mode, options, prompts])
  const [selected, setSelected] = useState('')
  useEffect(() => { setSelected('') }, [signature])
  useEffect(() => {
    if (!root.current || disabled) return
    const instances = [...root.current.querySelectorAll<HTMLElement>('[data-drag-zone]')].map(element => Sortable.create(element, {
      group, animation: 160, forceFallback: true, fallbackTolerance: 3, delay: 150, delayOnTouchOnly: true, touchStartThreshold: 5,
      ghostClass: 'interaction-ghost', chosenClass: 'interaction-chosen', dragClass: 'interaction-drag', draggable: '[data-value]',
      filter: '.interaction-move', preventOnFilter: false,
      onEnd(event) {
        const word = event.item.dataset.value!, target = event.to.dataset.dragZone!
        // Sortable reports the gesture, but React remains the only DOM owner.
        event.item.remove(); event.from.insertBefore(event.item, event.from.children[event.oldIndex ?? 0] || null)
        const current = latest.current
        if (current.mode === 'ordering') {
          const next = [...current.values], from = next.indexOf(word)
          if (from < 0 || event.newIndex == null) return
          next.splice(from, 1); next.splice(event.newIndex, 0, word); current.onChange(next)
        } else if (current.mode === 'sentence') {
          const next = current.values.filter(v => v !== word)
          if (target !== 'bank') next.splice(event.newIndex ?? next.length, 0, word)
          current.onChange(next)
        } else {
          const next = (current.prompts || []).map((_, i) => current.values[i] === word ? '' : current.values[i] || '')
          if (target !== 'bank') next[Number(target)] = word
          current.onChange(next)
        }
      },
    }))
    return () => { for (const sortable of instances) sortable.destroy() }
  }, [disabled, group, signature])
  const bank = options.filter(v => !values.includes(v))
  const label = (v: string) => labels[options.indexOf(v)] || v
  function tile(v: string, i: number, inBank = false) {
    const image = images[options.indexOf(v)]
    return <li data-value={v} key={v} className={selected === v ? 'interaction-tile is-selected' : 'interaction-tile'}>
      <button type="button" disabled={disabled} aria-pressed={mode === 'matching' ? selected === v : undefined} onClick={() => {
        if (mode === 'matching') setSelected(selected === v ? '' : v)
        else if (mode === 'sentence') props.onChange(inBank ? [...values, v] : values.filter(value => value !== v))
      }}>{image ? <img src={image} alt={`${i + 1}`} draggable={false} /> : label(v)}</button>
      {!inBank && mode !== 'matching' && <span className="interaction-move">{[-1, 1].map(delta => <button className="interaction-move" type="button" key={delta} disabled={disabled || i + delta < 0 || i + delta >= values.length} aria-label={participantText(locale, delta < 0 ? 'orderingUp' : 'orderingDown')} onClick={() => { const next = [...values]; [next[i], next[i + delta]] = [next[i + delta], next[i]]; props.onChange(next) }}>{delta < 0 ? '↑' : '↓'}</button>)}</span>}
    </li>
  }
  return <div ref={root} className={`drag-answers is-${mode}`}>
    <p className="muted">{locale === 'zh-TW' ? mode === 'matching' ? '把答案拖到對應格；也可以先點答案，再點配對格。' : mode === 'sentence' ? '把詞塊拖入下方句子區；也可以點選詞塊，再用箭頭調整。' : '拖曳項目，或用箭頭調整順序。' : mode === 'matching' ? 'Drag answers into matching slots, or select an answer and then a slot.' : mode === 'sentence' ? 'Drag or tap fragments into the sentence, then reorder them.' : 'Drag items or use the arrows to reorder.'}{mode !== 'ordering' && ` · ${values.filter(Boolean).length}/${options.length}`}</p>
    {mode !== 'ordering' && <ul data-drag-zone="bank" className="interaction-bank">{bank.map((v, i) => tile(v, i, true))}</ul>}
    {mode === 'matching' ? <ol className="interaction-matches">{prompts.map((prompt, i) => <li key={`${prompt}-${i}`}>
      <strong>{prompt}</strong>
      <ul data-drag-zone={i} className="interaction-slot">{values[i] && tile(values[i], i)}</ul>
      <button type="button" className="ghost-button" disabled={disabled || (!selected && !values[i])} onClick={() => {
        const next = prompts.map((_, at) => values[at] === selected && selected ? '' : values[at] || '')
        next[i] = selected; props.onChange(next); setSelected('')
      }}>{selected ? label(selected) : values[i] ? '↩' : '＋'}</button>
    </li>)}</ol> : <ol data-drag-zone="answer" className="interaction-answer">{values.map((v, i) => tile(v, i))}</ol>}
  </div>
}
