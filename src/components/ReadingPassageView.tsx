import { useMemo, useState } from 'react'
import { BookOpen, Translate, X } from '@phosphor-icons/react'
import { contentLocaleKey, participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'
import type { ReadingPassage, ReadingGrammar, ReadingVocabulary } from '../types'

type Props = {
  passage: ReadingPassage
  locale: ParticipantLocale
  // The capture the passage was written from, when the teacher chose to show
  // it. A photograph belongs with the text; a page of source material does not,
  // and that is the teacher’s call rather than ours.
  imageUrl?: string | null
}

type Mark =
  | { kind: 'word'; entry: ReadingVocabulary }
  | { kind: 'grammar'; entry: ReadingGrammar }

// Every place a marked stretch appears, because a word the class has not met is
// new every time they meet it — not only the first time.
function occurrences(body: string, needle: string) {
  const found: Array<[number, number]> = []
  if (!needle) return found
  let at = body.indexOf(needle)
  while (at !== -1) {
    found.push([at, at + needle.length])
    at = body.indexOf(needle, at + needle.length)
  }
  return found
}

// Grammar spans are whole clauses and the words they contain are the ones the
// class cannot read, so the two nest rather than compete. The first attempt let
// them compete and the grammar span won: 禮貌 and 新鮮 sat inside 雖然…但是 and
// 因為…所以 and lost their colour, which are precisely the words a stuck reader
// is looking for.
type WordRun = { text: string; entry: ReadingVocabulary | null }
type Run = { grammar: ReadingGrammar | null; words: WordRun[]; key: string }

function spansOf(body: string, entries: Array<{ span: string }>) {
  const found: Array<[number, number, number]> = []
  entries.forEach((entry, index) => {
    for (const [from, to] of occurrences(body, entry.span)) found.push([from, to, index])
  })
  return found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
}

// Word marks inside one stretch of the passage.
function wordRuns(text: string, vocabulary: ReadingVocabulary[]): WordRun[] {
  const marks: Array<[number, number, ReadingVocabulary]> = []
  for (const entry of vocabulary) {
    for (const [from, to] of occurrences(text, entry.word)) marks.push([from, to, entry])
  }
  // Longest first at the same place, so 有禮貌 is not cut in half by 禮貌.
  marks.sort((a, b) => a[0] - b[0] || b[1] - a[1])

  const runs: WordRun[] = []
  let cursor = 0
  for (const [from, to, entry] of marks) {
    if (from < cursor) continue
    if (from > cursor) runs.push({ text: text.slice(cursor, from), entry: null })
    runs.push({ text: text.slice(from, to), entry })
    cursor = to
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), entry: null })
  return runs
}

function layout(passage: ReadingPassage, showGrammar: boolean): Run[] {
  const vocabulary = passage.vocabulary || []
  const grammar = showGrammar ? (passage.grammar || []) : []
  const spans = spansOf(passage.body, grammar)

  const runs: Run[] = []
  let cursor = 0
  let index = 0
  for (const [from, to, entryIndex] of spans) {
    if (from < cursor) continue
    if (from > cursor) {
      runs.push({ grammar: null, words: wordRuns(passage.body.slice(cursor, from), vocabulary), key: `p${index += 1}` })
    }
    runs.push({
      grammar: grammar[entryIndex],
      words: wordRuns(passage.body.slice(from, to), vocabulary),
      key: `g${index += 1}`,
    })
    cursor = to
  }
  if (cursor < passage.body.length) {
    runs.push({ grammar: null, words: wordRuns(passage.body.slice(cursor), vocabulary), key: `p${index += 1}` })
  }
  return runs
}

function glossFor(gloss: Record<string, string> | undefined, locale: ParticipantLocale) {
  if (!gloss) return ''
  return gloss[contentLocaleKey(locale)] || gloss.en || gloss.zh_tw || ''
}

export function ReadingPassageView({ passage, locale, imageUrl }: Props) {
  // The student's own switch, separate from the teacher's. A teacher who turned
  // the grammar on wants it available; a reader who finds it busy can put it
  // away without losing the vocabulary colouring, which is the part that stops
  // them being stuck.
  const [showGrammar, setShowGrammar] = useState(true)
  const [open, setOpen] = useState<Mark | null>(null)
  const hasGrammar = (passage.grammar || []).length > 0

  const runs = useMemo(() => layout(passage, showGrammar && hasGrammar), [passage, showGrammar, hasGrammar])

  return (
    <section className="reading-passage">
      <header className="reading-passage-head">
        <h3><BookOpen size={18} />{passage.title || participantText(locale, 'readingTitle')}</h3>
        {hasGrammar && (
          <button
            aria-pressed={showGrammar}
            className={`reading-grammar-toggle${showGrammar ? ' is-on' : ''}`}
            type="button"
            onClick={() => setShowGrammar((current) => !current)}
          >
            {participantText(locale, showGrammar ? 'readingGrammarOn' : 'readingGrammarOff')}
          </button>
        )}
      </header>

      {imageUrl && <img alt="" className="reading-image" src={imageUrl} />}

      {/* Whitespace is preserved because the model writes paragraphs and a
          reading exercise that arrives as one block is harder than the language
          in it. */}
      <p className="reading-passage-body">
        {runs.map((run) => {
          const words = run.words.map((word, at) => (word.entry ? (
            <button
              className={`reading-mark is-word${open?.kind === 'word' && open.entry === word.entry ? ' is-open' : ''}`}
              key={`${run.key}-w${at}`}
              type="button"
              onClick={(event) => {
                // The word is inside the pattern, so without this a tap on it
                // opens the note about the pattern instead.
                event.stopPropagation()
                setOpen((current) => (current?.kind === 'word' && current.entry === word.entry ? null : { kind: 'word', entry: word.entry as ReadingVocabulary }))
              }}
            >
              {word.text}
            </button>
          ) : (
            <span key={`${run.key}-t${at}`}>{word.text}</span>
          )))
          if (!run.grammar) return <span key={run.key}>{words}</span>
          const entry = run.grammar
          return (
            <span
              className={`reading-mark is-grammar${open?.kind === 'grammar' && open.entry === entry ? ' is-open' : ''}`}
              key={run.key}
              role="button"
              tabIndex={0}
              onClick={() => setOpen((current) => (current?.kind === 'grammar' && current.entry === entry ? null : { kind: 'grammar', entry }))}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                setOpen((current) => (current?.kind === 'grammar' && current.entry === entry ? null : { kind: 'grammar', entry }))
              }}
            >
              {words}
            </span>
          )
        })}
      </p>

      {open && (
        <aside className="reading-note" role="status">
          <button
            aria-label={participantText(locale, 'close')}
            className="reading-note-close"
            type="button"
            onClick={() => setOpen(null)}
          >
            <X size={16} />
          </button>
          {open.kind === 'word' ? (
            <>
              <p className="reading-note-head">
                <strong>{open.entry.word}</strong>
                {open.entry.pos && <span className="reading-note-pos">{open.entry.pos}</span>}
                {open.entry.level > 0 && <span className="reading-note-level">TBCL {open.entry.level}</span>}
              </p>
              <p><Translate size={15} />{glossFor(open.entry.gloss, locale)}</p>
            </>
          ) : (
            <>
              <p className="reading-note-head">
                <strong>{open.entry.point}</strong>
                <span className="reading-note-level">TBCL {open.entry.level}</span>
              </p>
              <p><Translate size={15} />{glossFor(open.entry.note, locale)}</p>
              {open.entry.example && <p className="reading-note-example">{open.entry.example}</p>}
            </>
          )}
        </aside>
      )}
    </section>
  )
}
