import { useMemo } from 'react'
import { diffWriting, hasChanges } from '../lib/writingDiff'

type Props = {
  original: string
  revised: string
  notes?: Array<{ before: string; after: string; why: string }>
  // What the two colours mean, and what to say when nothing was changed. Given
  // as text rather than looked up here, because the student reads this in the
  // 導引語 and the teacher in the 教學語.
  labels: {
    added: string
    removed: string
    unchanged: string
    notesHeading: string
  }
}

// The AI's corrections laid over the student's own writing.
//
// Insertions in one colour, what they replace struck through in another, and
// everything untouched left as plain text — so what a student sees first is how
// much of it was already right. The runs come from a local diff, which is what
// lets the untouched parts be shown as theirs without qualification.
export function RevisedWriting({ original, revised, notes, labels }: Props) {
  const runs = useMemo(() => diffWriting(original, revised), [original, revised])
  const changed = hasChanges(runs)

  return (
    <div className="revised-writing">
      {changed ? (
        <p className="revised-key">
          <span className="revised-key-added">{labels.added}</span>
          <span className="revised-key-removed">{labels.removed}</span>
        </p>
      ) : (
        <p className="revised-key is-clean">{labels.unchanged}</p>
      )}
      <p className="revised-body">
        {runs.map((run, index) => (
          run.kind === 'kept'
            ? <span key={index}>{run.text}</span>
            : run.kind === 'added'
              ? <ins key={index}>{run.text}</ins>
              : <del key={index}>{run.text}</del>
        ))}
      </p>
      {notes && notes.length > 0 && (
        <div className="revised-notes">
          <h4>{labels.notesHeading}</h4>
          <ul>
            {notes.map((note, index) => (
              <li key={index}>
                {note.before && <del>{note.before}</del>}
                {note.after && <ins>{note.after}</ins>}
                <span>{note.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
