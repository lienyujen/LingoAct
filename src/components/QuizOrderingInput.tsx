import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'

type Props = {
  values: string[]
  labels: string[]
  // 圖片排序: one picture per row, aligned to values. Empty means the rows are
  // text, which is what ordering sentences and paragraphs has always been.
  images?: string[]
  locale: ParticipantLocale
  onChange: (values: string[]) => void
}

// Reordering by hand, on whatever the student is holding.
//
// Pointer events rather than HTML5 drag-and-drop: dragstart/drop never fire on a
// touch screen, so a tablet class — which is most of them — would find the
// fragments simply immovable. The arrows are not a fallback for old browsers but
// the path for anyone using a keyboard, and they are quicker than dragging when
// only one piece is out of place.
export function QuizOrderingInput({ values, labels, images, locale, onChange }: Props) {
  const pictures = images?.length === values.length
  const [dragging, setDragging] = useState<number | null>(null)
  const rowsRef = useRef<(HTMLLIElement | null)[]>([])

  function move(from: number, to: number) {
    if (to < 0 || to >= values.length || from === to) return
    const next = [...values]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(index)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (dragging === null) return
    // Whichever row the finger is currently over becomes the new home.
    const over = rowsRef.current.findIndex((row) => {
      if (!row) return false
      const box = row.getBoundingClientRect()
      return event.clientY >= box.top && event.clientY <= box.bottom
    })
    if (over >= 0 && over !== dragging) {
      move(dragging, over)
      setDragging(over)
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(null)
  }

  return (
    <div className="quiz-ordering">
      <p className="quiz-ordering-hint">{participantText(locale, pictures ? 'orderingPictureHint' : 'orderingHint')}</p>
      <ol className={pictures ? 'quiz-ordering-list has-pictures' : 'quiz-ordering-list'}>
        {values.map((value, index) => (
          <li
            className={dragging === index ? 'is-dragging' : ''}
            key={value}
            ref={(node) => { rowsRef.current[index] = node }}
          >
            <button
              aria-label={participantText(locale, 'orderingDrag')}
              className="quiz-ordering-handle"
              type="button"
              onPointerDown={(event) => onPointerDown(event, index)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 9h16M4 15h16" />
              </svg>
            </button>
            <span className="quiz-ordering-index">{index + 1}</span>
            {pictures
              ? <img alt="" className="quiz-ordering-picture" draggable={false} src={images[index]} />
              : <span className="quiz-ordering-text">{labels[index] ?? value}</span>}
            <span className="quiz-ordering-moves">
              <button
                aria-label={participantText(locale, 'orderingUp')}
                disabled={index === 0}
                type="button"
                onClick={() => move(index, index - 1)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 15l6-6 6 6" /></svg>
              </button>
              <button
                aria-label={participantText(locale, 'orderingDown')}
                disabled={index === values.length - 1}
                type="button"
                onClick={() => move(index, index + 1)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
