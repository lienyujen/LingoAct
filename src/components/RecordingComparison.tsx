import type { AudioResponse } from '../types'
import { classroomMessage } from '../lib/classroomMessages'
import { RecordingPlayer } from './RecordingPlayer'

export function RecordingComparison({ response, locale, student = false }: { response: AudioResponse; locale: string; student?: boolean }) {
  const previous = response.previous_attempt
  if (!previous) return null
  return <section className="recording-comparison">
    <h4>{classroomMessage(locale, 'attemptComparison')}</h4>
    <p>{classroomMessage(locale, 'attemptScore', { n: 1, score: previous.score ?? '—' })} · {classroomMessage(locale, 'attemptScore', { n: 2, score: response.score ?? '—' })}</p>
    <details><summary>{classroomMessage(locale, 'firstAttempt')}</summary>
      <RecordingPlayer recording={previous} locale={locale} student={student} />
      {previous.analysis_json && <p>{previous.analysis_json.summary}</p>}
    </details>
  </section>
}
