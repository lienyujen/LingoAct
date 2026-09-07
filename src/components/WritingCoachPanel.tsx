import { useState } from 'react'
import { CheckCircle, ChatCircleDots, CircleNotch, Question, WarningCircle } from '@phosphor-icons/react'
import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'
import type { WritingCoachTurn } from '../types'

type Props = {
  turns: WritingCoachTurn[]
  draft: string
  locale: ParticipantLocale
  maxRounds: number
  onAsk: () => Promise<void>
}

// 寫作教練, student side: what the coach asked, under the field it asked about.
//
// The newest round is open and the earlier ones are collapsed, because a
// student mid-revision is answering the last question, not re-reading the
// first. The drafts stay reachable, though — seeing what they wrote two rounds
// ago is half of what makes the process visible to them.
export function WritingCoachPanel({ turns, draft, locale, maxRounds, onAsk }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [openRound, setOpenRound] = useState(0)

  const latest = turns.at(-1)
  const used = turns.length
  const spent = used >= maxRounds
  // Nothing to ask about until they have written something, and nothing new to
  // ask about until they have changed it.
  const unchanged = Boolean(latest && latest.draft.trim() === draft.trim())

  async function ask() {
    setBusy(true)
    setError('')
    try {
      await onAsk()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : participantText(locale, 'coachFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="writing-coach">
      {latest && (
        <div className={latest.reply.ready ? 'coach-reply is-ready' : 'coach-reply'}>
          <p className="coach-noticed"><CheckCircle size={16} weight="fill" />{latest.reply.noticed}</p>
          <ul className="coach-questions">
            {latest.reply.questions.map((question) => (
              <li key={question}><Question size={15} />{question}</li>
            ))}
          </ul>
          {latest.reply.fix && (
            <p className="coach-fix">
              <WarningCircle size={16} />
              <span><strong>{latest.reply.fix.point}</strong>{latest.reply.fix.why}</span>
            </p>
          )}
          {latest.reply.ready && <p className="coach-ready">{participantText(locale, 'coachReady')}</p>}
        </div>
      )}

      {turns.length > 1 && (
        <div className="coach-history">
          {turns.slice(0, -1).map((turn) => (
            <div key={turn.id}>
              <button type="button" onClick={() => setOpenRound(openRound === turn.round ? 0 : turn.round)}>
                {participantText(locale, 'coachRound', { n: turn.round })}
              </button>
              {openRound === turn.round && (
                <div className="coach-history-body">
                  <p className="coach-old-draft">{turn.draft}</p>
                  <ul>{turn.reply.questions.map((question) => <li key={question}>{question}</li>)}</ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <button
        className="coach-ask"
        disabled={busy || spent || !draft.trim() || unchanged}
        type="button"
        onClick={() => void ask()}
      >
        {busy ? <CircleNotch className="spin" size={16} /> : <ChatCircleDots size={16} />}
        {busy
          ? participantText(locale, 'coachThinking')
          : spent
            ? participantText(locale, 'coachSpent')
            : unchanged
              ? participantText(locale, 'coachRevise')
              : participantText(locale, used ? 'coachAskAgain' : 'coachAsk', { left: maxRounds - used })}
      </button>
    </div>
  )
}
