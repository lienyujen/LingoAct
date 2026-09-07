import { useEffect, useRef, useState } from 'react'
import type { Answer, Question } from '../types'
import { usePresenterText } from '../lib/presenterI18n'

type Props = {
  question: Question | null
  answers: Answer[]
  anonymousEnabled: boolean
}

// 即時造句牆 on the projector: everyone's sentence, as it arrives.
//
// The whole value of the activity is thirty real samples visible at once, so
// nothing here scrolls, paginates or flies past. The type shrinks as the class
// fills the wall instead — a sentence the back row cannot read is not a sample.
function sizeClass(count: number) {
  if (count <= 6) return 'is-roomy'
  if (count <= 14) return 'is-full'
  if (count <= 26) return 'is-tight'
  return 'is-packed'
}

export function SentenceWallOverlay({ question, answers, anonymousEnabled }: Props) {
  const t = usePresenterText()
  // Which cards are new since the last render, so they can arrive rather than
  // appear. Held in a ref because it must not itself cause a render.
  const seenRef = useRef<Set<string>>(new Set())
  const [arriving, setArriving] = useState<string[]>([])

  useEffect(() => {
    const fresh = answers.filter((answer) => !seenRef.current.has(answer.id)).map((answer) => answer.id)
    for (const id of fresh) seenRef.current.add(id)
    if (!fresh.length) return
    setArriving((current) => [...current, ...fresh])
    const timer = window.setTimeout(() => {
      setArriving((current) => current.filter((id) => !fresh.includes(id)))
    }, 700)
    return () => window.clearTimeout(timer)
  }, [answers])

  // The wall is the current WRITTEN question on the projector, so it goes away
  // by itself when the class moves to a quiz or a picture. Without this, a
  // switch the teacher forgot to turn off would black out the screen over an
  // activity that has nothing to do with it.
  if (question?.type !== 'short_answer') return null
  const sentences = answers.filter((answer) => (answer.answer_text || '').trim())

  return (
    <div className="sentence-wall">
      <header className="sentence-wall-head">
        <h1>{question.prompt_text || question.title}</h1>
        <span className="sentence-wall-count">{sentences.length}</span>
      </header>
      {sentences.length === 0 ? (
        <p className="sentence-wall-waiting">{t('waitingForSentences')}</p>
      ) : (
        <div className={`sentence-wall-grid ${sizeClass(sentences.length)}`}>
          {sentences.map((answer, index) => (
            <article
              className={arriving.includes(answer.id) ? 'sentence-card is-arriving' : 'sentence-card'}
              key={answer.id}
            >
              <p>{answer.answer_text}</p>
              <span>{anonymousEnabled ? `${index + 1}` : answer.participant_name}</span>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
