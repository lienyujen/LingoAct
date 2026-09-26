import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpen, Translate, X } from '@phosphor-icons/react'
import { useReadingFont } from '../lib/readingFont'
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
  // The passage read aloud. Its controls sit in the same row as the annotation
  // switches, because they are all things you do to this one piece of text.
  player?: ReactNode
  // A quiz over this passage that the student has not finished. The words and
  // the grammar are the answers: a comprehension question about 雖然…但是 is
  // not a comprehension question once the pattern is glossed on the page. The
  // readings and the audio stay — they help a student read, not answer — and a
  // passage sent without a quiz locks nothing at all.
  locked?: boolean
}

// Where the readings come from, one entry per character of the body.
//
// 注音 arrives as the body with variation selectors woven into it: the same
// characters, so it is read back into a per-character list and rendered in
// place of them. 拼音 arrives as that list already and goes above the line.
// Either way a list that does not line up is not used — a syllable over the
// wrong character is worse than no syllable at all.
const VS_FIRST = 0xE0100
const VS_LAST = 0xE01EF

function perCharacter(passage: ReadingPassage): { glyphs: string[] | null; ruby: string[] | null } {
  const none = { glyphs: null, ruby: null }
  const text = passage.annotation_text || ''
  if (!text) return none
  const count = [...passage.body].length

  if (passage.annotation === 'pinyin') {
    try {
      const syllables = JSON.parse(text)
      if (!Array.isArray(syllables) || syllables.length !== count) return none
      return { glyphs: null, ruby: syllables.map((syllable) => (typeof syllable === 'string' ? syllable : '')) }
    } catch {
      // Written by an older build in a shape this cannot read.
      return none
    }
  }

  if (passage.annotation !== 'zhuyin') return none
  const glyphs: string[] = []
  let current = ''
  for (const point of text) {
    const code = point.codePointAt(0) as number
    if (current && code >= VS_FIRST && code <= VS_LAST) { current += point; continue }
    if (current) glyphs.push(current)
    current = point
  }
  if (current) glyphs.push(current)
  return glyphs.length === count ? { glyphs, ruby: null } : none
}

// The passage is sliced by code unit all the way through — indexOf and slice
// work in those — while a reading belongs to a character. This turns one into
// the other once, so every slice can look its readings up by offset.
function byOffset(body: string, entries: string[] | null) {
  if (!entries) return null
  const map = new Map<number, string>()
  let offset = 0
  let index = 0
  for (const character of body) {
    map.set(offset, entries[index] || '')
    offset += character.length
    index += 1
  }
  return map
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
type WordRun = { text: string; entry: ReadingVocabulary | null; at: number }
type Run = { grammar: ReadingGrammar | null; words: WordRun[]; key: string }

function spansOf(body: string, entries: Array<{ span: string }>) {
  const found: Array<[number, number, number]> = []
  entries.forEach((entry, index) => {
    for (const [from, to] of occurrences(body, entry.span)) found.push([from, to, index])
  })
  return found.sort((a, b) => a[0] - b[0] || b[1] - a[1])
}

// Word marks inside one stretch of the passage.
function wordRuns(text: string, vocabulary: ReadingVocabulary[], base: number): WordRun[] {
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
    if (from > cursor) runs.push({ text: text.slice(cursor, from), entry: null, at: base + cursor })
    runs.push({ text: text.slice(from, to), entry, at: base + from })
    cursor = to
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), entry: null, at: base + cursor })
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
      runs.push({ grammar: null, words: wordRuns(passage.body.slice(cursor, from), vocabulary, cursor), key: `p${index += 1}` })
    }
    runs.push({
      grammar: grammar[entryIndex],
      words: wordRuns(passage.body.slice(from, to), vocabulary, from),
      key: `g${index += 1}`,
    })
    cursor = to
  }
  if (cursor < passage.body.length) {
    runs.push({ grammar: null, words: wordRuns(passage.body.slice(cursor), vocabulary, cursor), key: `p${index += 1}` })
  }
  return runs
}

function glossFor(gloss: Record<string, string> | undefined, locale: ParticipantLocale) {
  if (!gloss) return ''
  return gloss[contentLocaleKey(locale)] || gloss.en || gloss.zh_tw || ''
}

export function ReadingPassageView({ passage, locale, imageUrl, player, locked = false }: Props) {
  // The student's own switches, separate from the teacher's. A teacher who
  // turned the grammar on wants it available; a reader who finds it busy can
  // put it away without losing the vocabulary colouring, and the other way
  // round. They start on for a passage sent to be read — and off under a quiz,
  // where they would be the answer key.
  const [showGrammar, setShowGrammar] = useState(!locked)
  const [showWords, setShowWords] = useState(!locked)
  // The readings are the one mark a locked passage keeps: they say how a word
  // sounds, not what it means, so they help a student read the questions rather
  // than answer them.
  const [showRuby, setShowRuby] = useState(true)
  const [open, setOpen] = useState<Mark | null>(null)
  const hasGrammar = (passage.grammar || []).length > 0
  const hasWords = (passage.vocabulary || []).length > 0

  // A switch the student threw earlier still has to wait for the quiz: locking
  // happens after mount too, when the teacher sends the questions.
  const wordsOn = showWords && !locked
  const grammarOn = showGrammar && !locked

  const runs = useMemo(
    () => layout(wordsOn ? passage : { ...passage, vocabulary: [] }, grammarOn && hasGrammar),
    [passage, grammarOn, hasGrammar, wordsOn],
  )

  const readings = useMemo(() => perCharacter(passage), [passage])
  const glyphs = useMemo(() => byOffset(passage.body, readings.glyphs), [passage.body, readings.glyphs])
  const ruby = useMemo(() => byOffset(passage.body, readings.ruby), [passage.body, readings.ruby])
  const hasReadings = Boolean(glyphs || ruby)
  // 注音 is set into the glyphs, so the subset the teacher cut has to load
  // before the passage can show it; 拼音 needs no font.
  const family = useReadingFont(readings.glyphs && showRuby ? passage.font_url : null)
  const showGlyphs = Boolean(glyphs && showRuby && family)
  const showRubyText = Boolean(ruby && showRuby)

  // One character at a time, so a reading sits over the character it belongs to
  // and not over the word it happens to start.
  function annotated(text: string, at: number) {
    if (!showGlyphs && !showRubyText) return text
    const out: ReactNode[] = []
    let offset = 0
    for (const character of text) {
      const key = at + offset
      if (showGlyphs) {
        out.push(<span key={key}>{glyphs?.get(key) || character}</span>)
      } else {
        const reading = ruby?.get(key)
        out.push(reading
          ? <ruby key={key}>{character}<rt>{reading}</rt></ruby>
          // Not wrapped: a character with no reading should sit on the same
          // baseline as the annotated ones, and an empty <rt> pushes it down.
          : <span key={key}>{character}</span>)
      }
      offset += character.length
    }
    return out
  }

  return (
    <section className="reading-passage">
      {/* The picture comes before the title, because it is what the passage is
          about and a reader looks at it before reading anything. */}
      {imageUrl && <img alt="" className="reading-image" src={imageUrl} />}

      <header className="reading-passage-head">
        <h3><BookOpen size={18} />{passage.title || participantText(locale, 'readingTitle')}</h3>
        {/* One line for everything you can do to this text: which marks are
            showing, and playing it. */}
        <div className="reading-tools">
          {hasWords && (
            <button
              aria-pressed={wordsOn}
              className={`reading-toggle${wordsOn ? ' is-on' : ''}`}
              disabled={locked}
              title={locked ? participantText(locale, 'readingLocked') : undefined}
              type="button"
              onClick={() => setShowWords((current) => !current)}
            >
              {participantText(locale, 'readingWords')}
            </button>
          )}
          {hasGrammar && (
            <button
              aria-pressed={grammarOn}
              className={`reading-toggle${grammarOn ? ' is-on' : ''}`}
              disabled={locked}
              title={locked ? participantText(locale, 'readingLocked') : undefined}
              type="button"
              onClick={() => setShowGrammar((current) => !current)}
            >
              {participantText(locale, 'readingGrammar')}
            </button>
          )}
          {hasReadings && (
            <button
              aria-pressed={showRuby}
              className={`reading-toggle${showRuby ? ' is-on' : ''}`}
              type="button"
              onClick={() => setShowRuby((current) => !current)}
            >
              {participantText(locale, 'readingRuby')}
            </button>
          )}
          {player}
        </div>
      </header>

      {/* Whitespace is preserved because the model writes paragraphs and a
          reading exercise that arrives as one block is harder than the language
          in it. */}
      {locked && (hasWords || hasGrammar) && (
        <p className="reading-locked-note">{participantText(locale, 'readingLocked')}</p>
      )}

      <p
        className={`reading-passage-body${showGlyphs ? ' is-annotated' : ''}${showRubyText ? ' reading-ruby is-ruby' : ''}`}
        style={showGlyphs && family ? { fontFamily: `${family}, inherit` } : undefined}
      >
        {runs.map((run) => {
          const words = run.words.map((word, at) => (word.entry ? (
            <button
              // Coloured by the level the word is learned at, so a reader can see at
              // a glance which of the new words are the ones for this term and
              // which are reaching further. Level 0 is a word on no TBCL list at
              // all — a name, a loanword — and gets its own quiet green ground
              // rather than a level colour it does not have.
              className={`reading-mark is-word level-${word.entry.level || 0}${open?.kind === 'word' && open.entry === word.entry ? ' is-open' : ''}`}
              key={`${run.key}-w${at}`}
              type="button"
              onClick={(event) => {
                // The word is inside the pattern, so without this a tap on it
                // opens the note about the pattern instead.
                event.stopPropagation()
                setOpen((current) => (current?.kind === 'word' && current.entry === word.entry ? null : { kind: 'word', entry: word.entry as ReadingVocabulary }))
              }}
            >
              {annotated(word.text, word.at)}
            </button>
          ) : (
            <span key={`${run.key}-t${at}`}>{annotated(word.text, word.at)}</span>
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
