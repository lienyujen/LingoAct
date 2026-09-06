import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'

type Props = {
  // The left-hand column: the things being matched, in the order shown.
  pairPrompts: string[]
  // The right-hand column, already shuffled by the server.
  options: string[]
  // Translated labels where the student reads another language; same lengths.
  promptLabels: string[]
  optionLabels: string[]
  values: string[]
  locale: ParticipantLocale
  onChange: (next: string[]) => void
}

// 配對, as a row of dropdowns rather than lines drawn between two columns.
//
// Drawing lines is what a paper worksheet does and what a tablet does worst:
// it needs precise dragging between two moving columns, and on a phone the two
// columns end up stacked so far apart that the gesture spans a scroll. A select
// per row is one tap, works with a keyboard and a screen reader, and reads the
// same on a 5-inch phone as on a classroom tablet.
//
// A choice may be used twice. The class is answering against a clock and an
// answer with a repeat is wrong, not invalid — refusing it would cost a student
// the item they were about to fix.
export function QuizMatchingInput({ pairPrompts, options, promptLabels, optionLabels, values, locale, onChange }: Props) {
  const used = new Map<string, number>()
  for (const value of values) if (value) used.set(value, (used.get(value) || 0) + 1)

  return (
    <div className="quiz-matching">
      {pairPrompts.map((prompt, index) => {
        const value = values[index] || ''
        return (
          <div className="quiz-matching-row" key={`${prompt}-${index}`}>
            <span className="quiz-matching-prompt">{promptLabels[index] || prompt}</span>
            <select
              aria-label={promptLabels[index] || prompt}
              className={value && (used.get(value) || 0) > 1 ? 'quiz-matching-select is-repeated' : 'quiz-matching-select'}
              value={value}
              onChange={(event) => {
                const next = [...values]
                while (next.length < pairPrompts.length) next.push('')
                next[index] = event.target.value
                onChange(next)
              }}
            >
              <option value="">{participantText(locale, 'matchingChoose')}</option>
              {options.map((option, optionIndex) => (
                <option key={option} value={option}>{optionLabels[optionIndex] || option}</option>
              ))}
            </select>
          </div>
        )
      })}
      <p className="quiz-matching-hint">{participantText(locale, 'matchingHint')}</p>
    </div>
  )
}
