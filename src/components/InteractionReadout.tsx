import type { QuizItem } from '../types'
export function InteractionReadout({ item, values }: { item: QuizItem; values: string[] }) {
  if (item.type === 'matching') return <dl className="interaction-readout">{item.pair_prompts.map((p, i) => <div key={i}><dt>{p}</dt><dd>{values[i] || '—'}</dd></div>)}</dl>
  if (item.option_images?.length) return <ol className="interaction-readout tiles">{values.map(v => <li key={v}><img src={item.option_images[item.options.indexOf(v)]} alt="" /></li>)}</ol>
  return <p className="interaction-readout">{values.join(item.sentence_mode ? '' : ' → ')}</p>
}
