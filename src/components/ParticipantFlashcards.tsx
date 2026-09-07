import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CheckCircle, Confetti, XCircle } from '@phosphor-icons/react'
import { participantText } from '../lib/participantI18n'
import { useReadingFont } from '../lib/readingFont'
import type { ParticipantLocale } from '../lib/participantI18n'
import { localizedFields } from '../lib/localizedContent'
import type { ParticipantQuizData, QuizItem } from '../types'

type Props = {
  // 注音 arrives as a font the word is rendered in; 拼音 as a line under it.
  cardFontUrl?: string | null
  data: ParticipantQuizData
  locale: ParticipantLocale
  onTry: (itemId: string, answerValue: string) => Promise<{ correct: boolean; correctAnswer: string | null }>
}

type Verdict = { correct: boolean; correctAnswer: string | null; chosen: string }

// 數位 Flashcard: one card at a time, at the student's own pace, with the cards
// they miss coming back.
//
// The queue lives here rather than on the server because it is a pacing
// decision, not a marking one: the server says whether a card was right, and
// this decides when to show it again. A missed card goes to the back rather
// than reappearing immediately — answering it again while the right answer is
// still on screen would be copying, not recall.
const REQUEUE_GAP = 2

export function ParticipantFlashcards({ cardFontUrl, data, locale, onTry }: Props) {
  const readingFamily = useReadingFont(cardFontUrl)
  const [queue, setQueue] = useState<string[]>(() => data.items.map((item) => item.id))
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Which cards have been answered right at least once, so the counter shows
  // progress through the deck rather than through the queue.
  const [cleared, setCleared] = useState<string[]>([])
  const [firstTryRight, setFirstTryRight] = useState(0)
  const [seen, setSeen] = useState<string[]>([])

  const itemById = useMemo(
    () => new Map(data.items.map((item) => [item.id, item])),
    [data.items],
  )

  // Keyed on the deck, not on data.items: the page refetches the quiz on every
  // realtime event, handing back a fresh array each time. Depending on that
  // array reset the queue and threw away the verdict mid-answer — the card the
  // student had just tapped went back to unanswered under their finger.
  useEffect(() => {
    setQueue(data.items.map((item) => item.id))
    setVerdict(null)
    setCleared([])
    setFirstTryRight(0)
    setSeen([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.quiz.id])

  const current: QuizItem | undefined = queue.length ? itemById.get(queue[0]) : undefined
  const done = queue.length === 0

  async function answer(option: string) {
    if (!current || busy || verdict) return
    setBusy(true)
    setError('')
    try {
      const result = await onTry(current.id, option)
      setVerdict({ ...result, chosen: option })
      if (result.correct) {
        setCleared((list) => (list.includes(current.id) ? list : [...list, current.id]))
        if (!seen.includes(current.id)) setFirstTryRight((count) => count + 1)
      }
      if (!seen.includes(current.id)) setSeen((list) => [...list, current.id])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '無法送出。')
    } finally {
      setBusy(false)
    }
  }

  function next() {
    if (!current || !verdict) return
    setQueue((list) => {
      const rest = list.slice(1)
      if (verdict.correct) return rest
      // Back into the deck, a couple of cards later.
      const at = Math.min(REQUEUE_GAP, rest.length)
      return [...rest.slice(0, at), current.id, ...rest.slice(at)]
    })
    setVerdict(null)
  }

  if (done) {
    return (
      <section className="panel participant-question participant-flashcards">
        <div className="flashcard-done">
          <Confetti size={34} />
          <h2>{participantText(locale, 'flashcardDone')}</h2>
          <p className="muted">
            {participantText(locale, 'flashcardFirstTry', { right: firstTryRight, total: data.items.length })}
          </p>
        </div>
      </section>
    )
  }

  if (!current) return null

  const translation = localizedFields(current.translations, locale)
  const options = translation?.options?.length === current.options.length ? translation.options : current.options

  return (
    <section className="panel participant-question participant-flashcards">
      <div className="flashcard-progress">
        <span>{participantText(locale, 'flashcardProgress', { done: cleared.length, total: data.items.length })}</span>
        <div className="flashcard-bar"><span style={{ width: `${(cleared.length / data.items.length) * 100}%` }} /></div>
      </div>

      <p className="flashcard-prompt">{translation?.prompt_text || current.prompt_text}</p>

      <div className="flashcard-options">
        {current.options.map((option, index) => {
          const chosen = verdict?.chosen === option
          const isAnswer = verdict && !verdict.correct && verdict.correctAnswer === option
          // 注音 replaces the word, because the reading is inside its glyphs;
          // 拼音 sits under it, which is where a vocabulary card puts it.
          const reading = current.option_readings?.[index] || ''
          return (
            <button
              className={`flashcard-option${chosen ? (verdict.correct ? ' is-right' : ' is-wrong') : ''}${isAnswer ? ' is-answer' : ''}`}
              disabled={busy || Boolean(verdict)}
              key={option}
              type="button"
              onClick={() => void answer(option)}
            >
              {readingFamily && reading
                ? <span style={{ fontFamily: readingFamily }}>{reading}</span>
                : <span className="flashcard-word">{options[index]}{reading && <small>{reading}</small>}</span>}
              {chosen && (verdict.correct ? <CheckCircle size={20} weight="fill" /> : <XCircle size={20} weight="fill" />)}
              {isAnswer && <CheckCircle size={20} weight="fill" />}
            </button>
          )
        })}
      </div>

      {error && <p className="error">{error}</p>}

      {verdict && (
        <div className="flashcard-verdict">
          <p className={verdict.correct ? 'success' : 'muted'}>
            {participantText(locale, verdict.correct ? 'flashcardRight' : 'flashcardWrong')}
          </p>
          <button type="button" onClick={next}>
            {participantText(locale, verdict.correct ? 'flashcardNext' : 'flashcardTryLater')}
            <ArrowRight size={17} />
          </button>
        </div>
      )}
    </section>
  )
}
