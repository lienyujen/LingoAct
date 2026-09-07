import { useState } from 'react'
import { Eye, EyeSlash, PaperPlaneTilt, Sparkle } from '@phosphor-icons/react'
import type { SentenceWallComposition } from '../lib/sentenceWall'

type Props = {
  sentenceCount: number
  wallEnabled: boolean
  isCurrentQuestion: boolean
  composition: SentenceWallComposition | null
  onToggleWall: (enabled: boolean) => Promise<void>
  onCompose: () => Promise<void>
  onDispatch: (composition: SentenceWallComposition) => void
}

// 即時造句牆, teacher side. Offered on any 問答題 rather than only on one the
// wall dispatched: putting written answers on the projector and writing them up
// afterwards are useful for whatever a class was asked to write.
export function SentenceWallPanel({
  sentenceCount, wallEnabled, isCurrentQuestion, composition, onToggleWall, onCompose, onDispatch,
}: Props) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function run(label: string, work: () => Promise<void>) {
    setError('')
    setBusy(label)
    try {
      await work()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '操作失敗。')
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="panel sentence-wall-panel">
      <div className="panel-heading">
        <h2><Sparkle size={18} />造句牆</h2>
        {isCurrentQuestion && (
          <button
            aria-pressed={wallEnabled}
            className={wallEnabled ? 'wall-toggle is-on' : 'wall-toggle'}
            disabled={Boolean(busy)}
            type="button"
            onClick={() => void run('wall', () => onToggleWall(!wallEnabled))}
          >
            {wallEnabled ? <Eye size={16} /> : <EyeSlash size={16} />}
            {wallEnabled ? '大螢幕顯示中' : '投到大螢幕'}
          </button>
        )}
      </div>

      <div className="sentence-wall-actions">
        <button
          disabled={sentenceCount < 2 || Boolean(busy)}
          type="button"
          onClick={() => void run('compose', onCompose)}
        >
          <Sparkle size={16} />
          {busy === 'compose' ? '集成中…' : composition ? '重新集成' : `AI 集成這 ${sentenceCount} 句`}
        </button>
        {composition && (
          <button className="ghost-button" type="button" onClick={() => onDispatch(composition)}>
            <PaperPlaneTilt size={16} />用文字派送給學生
          </button>
        )}
      </div>
      {sentenceCount < 2 && <p className="muted">至少收到兩個句子後就可以集成。</p>}
      {error && <p className="error">{error}</p>}

      {composition && (
        <div className="sentence-wall-composition">
          <h3>{composition.title}</h3>
          <p className="sentence-wall-passage">{composition.passage}</p>
          {composition.highlights.length > 0 && (
            <div className="sentence-wall-highlights">
              <h4>值得學的句子</h4>
              {composition.highlights.map((highlight) => (
                <div key={highlight.sentence}>
                  <strong>「{highlight.sentence}」</strong>
                  <span>{highlight.why}</span>
                </div>
              ))}
            </div>
          )}
          {composition.watchOut.length > 0 && (
            <div className="sentence-wall-watch">
              <h4>要注意的地方</h4>
              {composition.watchOut.map((item) => (
                <div key={item.point}>
                  <strong>{item.point}</strong>
                  <span>{item.fix}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
