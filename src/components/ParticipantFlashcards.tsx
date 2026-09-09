import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CheckCircle, SpeakerHigh, SpinnerGap, XCircle } from '@phosphor-icons/react'
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
  active: boolean
  onTry: (itemId: string, answerValue: string) => Promise<{ correct: boolean; correctAnswer: string | null }>
}

type Verdict = { correct: boolean; correctAnswer: string | null; chosen: string }

const REQUEUE_GAP = 2

function learnedFrom(data: ParticipantQuizData) {
  return Object.fromEntries(data.answers
    .filter((answer) => Number(answer.score) > 0 && answer.answer_values?.[0])
    .map((answer) => [answer.item_id, answer.answer_values![0]]))
}

function reviewSides(item: QuizItem, answer: string, locale: ParticipantLocale) {
  const translation = localizedFields(item.translations, locale)
  if (item.prompt_is_word === true) {
    const answerIndex = item.options.indexOf(answer)
    const translatedAnswer = translation?.options?.length === item.options.length
      ? translation.options[answerIndex]
      : ''
    return {
      word: item.prompt_text,
      reading: item.prompt_reading || '',
      explanation: translatedAnswer || answer,
    }
  }
  const answerIndex = item.options.indexOf(answer)
  return {
    word: answer,
    reading: item.option_readings?.[answerIndex] || '',
    explanation: translation?.prompt_text || item.prompt_text,
  }
}

// During answering this is retrieval practice. Once the teacher stops it, the
// same deck becomes a reference students can keep turning over instead of a
// completion screen that makes the vocabulary disappear.
export function ParticipantFlashcards({ active, cardFontUrl, data, locale, onTry }: Props) {
  const readingFamily = useReadingFont(cardFontUrl)
  const initialLearned = useMemo(() => learnedFrom(data), [data])
  const [queue, setQueue] = useState<string[]>(() => data.items.map((item) => item.id).filter((id) => !initialLearned[id]))
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cleared, setCleared] = useState<string[]>(() => Object.keys(initialLearned))
  const [learnedAnswers, setLearnedAnswers] = useState<Record<string, string>>(() => ({ ...initialLearned, ...data.reviewAnswers }))
  const [firstTryRight, setFirstTryRight] = useState(0)
  const [seen, setSeen] = useState<string[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [speakingId, setSpeakingId] = useState('')

  const itemById = useMemo(() => new Map(data.items.map((item) => [item.id, item])), [data.items])
  const itemSignature = data.items.map((item) => item.id).join('|')

  useEffect(() => {
    const learned = learnedFrom(data)
    setQueue(data.items.map((item) => item.id).filter((id) => !learned[id]))
    setVerdict(null)
    setCleared(Object.keys(learned))
    setLearnedAnswers({ ...learned, ...data.reviewAnswers })
    setFirstTryRight(0)
    setSeen([])
    setReviewIndex(0)
    setFlipped(false)
    // A new server object for the same deck must not erase the card under a
    // student's finger. Only moving to another deck is a full reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.quiz.id])

  useEffect(() => {
    const valid = new Set(data.items.map((item) => item.id))
    setQueue((current) => {
      const kept = current.filter((id) => valid.has(id))
      const known = new Set([...kept, ...cleared])
      return [...kept, ...data.items.map((item) => item.id).filter((id) => !known.has(id))]
    })
    setLearnedAnswers((current) => ({ ...current, ...learnedFrom(data), ...data.reviewAnswers }))
    setReviewIndex((current) => Math.min(current, Math.max(0, data.items.length - 1)))
    // IDs, rather than the fresh array returned by each realtime fetch, make
    // newly generated cards appear without restarting the cards already done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemSignature, data.reviewAnswers])

  useEffect(() => {
    setFlipped(false)
    setVerdict(null)
  }, [active])

  const current = queue.length ? itemById.get(queue[0]) : undefined
  const done = queue.length === 0
  const reviewMode = !active || done

  async function answer(option: string) {
    if (!current || busy || verdict || !active) return
    setBusy(true)
    setError('')
    try {
      const result = await onTry(current.id, option)
      setVerdict({ ...result, chosen: option })
      const correctAnswer = result.correct ? option : result.correctAnswer
      if (correctAnswer) setLearnedAnswers((answers) => ({ ...answers, [current.id]: correctAnswer }))
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
      const at = Math.min(REQUEUE_GAP, rest.length)
      return [...rest.slice(0, at), current.id, ...rest.slice(at)]
    })
    setVerdict(null)
  }

  async function speak(item: QuizItem) {
    if (speakingId) return
    if (!item.audio_url) {
      setError('發音檔仍在準備，請稍後重新整理。')
      return
    }
    setSpeakingId(item.id)
    setError('')
    try {
      const audio = new Audio(item.audio_url)
      audio.addEventListener('ended', () => setSpeakingId(''), { once: true })
      audio.addEventListener('error', () => setSpeakingId(''), { once: true })
      await audio.play()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '無法播放發音。')
      setSpeakingId('')
    }
  }

  if (!data.items.length) return null

  if (reviewMode) {
    const reviewItem = data.items[reviewIndex]
    const sides = reviewSides(reviewItem, learnedAnswers[reviewItem.id] || '', locale)
    return (
      <section className="panel participant-question participant-flashcards flashcard-review">
        <div className="flashcard-review-heading">
          <div>
            <h2>{participantText(locale, 'flashcardReview')}</h2>
            {done && active && <small>{participantText(locale, 'flashcardFirstTry', { right: firstTryRight, total: data.items.length })}</small>}
          </div>
          <span>{participantText(locale, 'flashcardCardCount', { current: reviewIndex + 1, total: data.items.length })}</span>
        </div>
        <div className="flashcard-review-stage">
          <button className="flashcard-speaker" type="button" aria-label={`Play pronunciation: ${sides.word}`} onClick={() => void speak(reviewItem)}>
            {speakingId === reviewItem.id ? <SpinnerGap className="spin" size={25} /> : <SpeakerHigh size={25} weight="fill" />}
          </button>
          <button
            aria-label={participantText(locale, 'flashcardFlipHint')}
            className={`flashcard-review-card${flipped ? ' is-flipped' : ''}`}
            type="button"
            onClick={() => setFlipped((value) => !value)}
          >
            <span className="flashcard-review-inner">
            <span className="flashcard-review-face flashcard-review-front">
              <small>{participantText(locale, 'flashcardFront')}</small>
              {readingFamily && sides.reading
                ? <strong style={{ fontFamily: readingFamily }}>{sides.reading}</strong>
                : <strong className="flashcard-word">{sides.word}{sides.reading && <small>{sides.reading}</small>}</strong>}
              <em>{participantText(locale, 'flashcardFlipHint')}</em>
            </span>
            <span className="flashcard-review-face flashcard-review-back">
              <small>{participantText(locale, 'flashcardBack')}</small>
              <strong>{sides.explanation || '—'}</strong>
              <em>{sides.word}</em>
            </span>
            </span>
          </button>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="flashcard-review-controls">
          <button className="ghost-button" disabled={reviewIndex === 0} type="button" onClick={() => { setReviewIndex((value) => value - 1); setFlipped(false) }}>
            <ArrowLeft size={17} />{participantText(locale, 'flashcardPrevious')}
          </button>
          <button disabled={reviewIndex === data.items.length - 1} type="button" onClick={() => { setReviewIndex((value) => value + 1); setFlipped(false) }}>
            {participantText(locale, 'flashcardNext')}<ArrowRight size={17} />
          </button>
        </div>
      </section>
    )
  }

  if (!current) return null
  const translation = localizedFields(current.translations, locale)
  const promptIsWord = current.prompt_is_word === true
  const promptReading = current.prompt_reading || ''
  const promptText = promptIsWord ? current.prompt_text : (translation?.prompt_text || current.prompt_text)
  const options = promptIsWord && translation?.options?.length === current.options.length ? translation.options : current.options

  return (
    <section className="panel participant-question participant-flashcards">
      <div className="flashcard-progress">
        <span>{participantText(locale, 'flashcardProgress', { done: cleared.length, total: data.items.length })}</span>
        <div className="flashcard-bar"><span style={{ width: `${(cleared.length / data.items.length) * 100}%` }} /></div>
      </div>
      <p className={promptIsWord ? `flashcard-prompt is-word${promptReading ? ' has-reading' : ''}` : 'flashcard-prompt'}>
        {readingFamily && promptReading
          ? <span style={{ fontFamily: readingFamily }}>{promptReading}</span>
          : <span className="flashcard-word">{promptText}{promptReading && <small>{promptReading}</small>}</span>}
      </p>
      <div className="flashcard-options">
        {current.options.map((option, index) => {
          const chosen = verdict?.chosen === option
          const isAnswer = verdict && !verdict.correct && verdict.correctAnswer === option
          const reading = current.option_readings?.[index] || ''
          return (
            <button
              className={`flashcard-option${reading ? ' has-reading' : ''}${chosen ? (verdict.correct ? ' is-right' : ' is-wrong') : ''}${isAnswer ? ' is-answer' : ''}`}
              disabled={busy || Boolean(verdict)} key={option} type="button" onClick={() => void answer(option)}
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
          <p className={verdict.correct ? 'success' : 'muted'}>{participantText(locale, verdict.correct ? 'flashcardRight' : 'flashcardWrong')}</p>
          <button type="button" onClick={next}>{participantText(locale, verdict.correct ? 'flashcardNext' : 'flashcardTryLater')}<ArrowRight size={17} /></button>
        </div>
      )}
    </section>
  )
}
