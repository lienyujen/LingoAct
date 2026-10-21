import { useEffect, useRef, useState } from 'react'
import { Gauge, Headphones, Pause, Play } from '@phosphor-icons/react'
import { englishTextRuns } from '../lib/englishText'
import { participantText } from '../lib/participantI18n'
import { useReadingFont } from '../lib/readingFont'
import type { ParticipantLocale } from '../lib/participantI18n'
import { playsUsed, recordPlay } from '../lib/listening'
import type { KaraokeCue, ListeningClip, ReadingWord } from '../types'

type Props = {
  clip: ListeningClip
  questionId: string
  replayLimit: number | null
  prompt?: string | null
  readingFontUrl?: string | null
  readingRuby?: string[] | null
  // The same reading spelled as words, per 正詞法. Preferred over readingRuby
  // wherever it exists, so 星期六 reads xīngqīliù rather than xīng qí liù and
  // a name keeps its capital.
  readingWords?: ReadingWord[] | null
  karaokeCues?: KaraokeCue[] | null
  // 'inline' is the passage reader's row, where the player is two buttons
  // beside the annotation switches rather than a panel of its own.
  variant?: 'listening' | 'model' | 'inline'
  // Where the voice has got to, for a caller drawing the text itself. The
  // passage reader does: the words are its own, so the highlight has to be too.
  onActiveCue?: (index: number) => void
  locale: ParticipantLocale
}

const SLOW_RATE = 0.75

export function ListeningPlayer({ clip, questionId, replayLimit, prompt, readingFontUrl, readingRuby, readingWords, karaokeCues, variant = 'listening', locale, onActiveCue }: Props) {
  const isModel = variant === 'model'
  const isInline = variant === 'inline'
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const readingFamily = useReadingFont(readingFontUrl)
  const [used, setUsed] = useState(() => playsUsed(questionId))
  const [playing, setPlaying] = useState(false)
  const [slow, setSlow] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [plainText, setPlainText] = useState(false)
  const [activeCue, setActiveCue] = useState(-1)
  // Stopped part-way rather than finished. Kept apart from 'not playing' so the
  // highlight stays where the voice left off instead of snapping back.
  const [held, setHeld] = useState(false)

  // A different question means a different allowance, and the component is
  // reused in place when the teacher moves on.
  useEffect(() => {
    setUsed(playsUsed(questionId))
    setPlaying(false)
    setFailed(false)
    setShowTranscript(false)
    setPlainText(false)
    setActiveCue(-1)
    setHeld(false)
  }, [questionId])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = slow ? SLOW_RATE : 1
  }, [slow])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const follow = () => {
      const time = (audioRef.current?.currentTime || 0) * 1000
      const next = (karaokeCues || []).findIndex((cue) => time >= cue.start_ms && time < cue.end_ms)
      setActiveCue((current) => current === next ? current : next)
      frame = requestAnimationFrame(follow)
    }
    frame = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(frame)
  }, [karaokeCues, playing])

  useEffect(() => { onActiveCue?.(playing || held ? activeCue : -1) }, [activeCue, held, onActiveCue, playing])

  const exhausted = replayLimit !== null && used >= replayLimit
  const remaining = replayLimit === null ? null : Math.max(replayLimit - used, 0)

  function start() {
    const audio = audioRef.current
    if (!audio || exhausted || playing) return
    // Always from the beginning: a play a student can pause and resume at will
    // is really an unlimited one, and scrubbing would make the count meaningless.
    audio.currentTime = 0
    audio.playbackRate = slow ? SLOW_RATE : 1
    void audio.play().then(() => {
      setPlaying(true)
      setHeld(false)
      setUsed(recordPlay(questionId))
    }).catch(() => setFailed(true))
  }

  // Stopping and carrying on is only safe where there is nothing to spend. With
  // an allowance, a play that can be held is an unlimited one — stop before
  // each sentence and the count never moves — which is why start() always goes
  // back to the beginning. A passage has no allowance, so it can behave like a
  // piece of audio rather than like a test.
  const canHold = replayLimit === null

  function toggle() {
    const audio = audioRef.current
    if (!audio || failed || exhausted) return
    if (!canHold) { start(); return }
    if (playing) {
      audio.pause()
      setPlaying(false)
      setHeld(true)
      return
    }
    if (held) {
      audio.playbackRate = slow ? SLOW_RATE : 1
      // Not counted: carrying on is the same play, and recording it again would
      // make a student who paused look like one who listened twice.
      void audio.play().then(() => { setPlaying(true); setHeld(false) }).catch(() => setFailed(true))
      return
    }
    start()
  }

  // Every hook has run by here, so the early return is safe. What it drops is
  // all the framing: the heading, the hint and the replay count belong to a
  // page about listening, and this is a page about a passage.
  if (isInline) return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        src={clip.public_url}
        onEnded={() => { setPlaying(false); setHeld(false); setActiveCue(-1) }}
        onError={() => setFailed(true)}
      />
      <button
        className={`reading-toggle${failed || exhausted ? '' : ' is-on'}`}
        disabled={exhausted || failed || (playing && !canHold)}
        title={failed ? participantText(locale, 'listeningFailed') : undefined}
        type="button"
        onClick={toggle}
      >
        {playing && canHold ? <Pause size={15} /> : <Play size={15} />}
        {participantText(locale, failed
          ? 'listeningAudioBroken'
          : exhausted
            ? 'listeningNoPlaysLeft'
            : playing
              ? canHold ? 'listeningPause' : 'listeningPlaying'
              : held
                ? 'listeningResume'
                : used > 0 ? 'listeningReplay' : 'listeningPlay')}
      </button>
      <button
        aria-pressed={slow}
        className={`reading-toggle${slow ? ' is-on' : ''}`}
        type="button"
        onClick={() => setSlow((current) => !current)}
      >
        <Gauge size={15} />
        {participantText(locale, slow ? 'listeningNormal' : 'listeningSlow')}
      </button>
    </>
  )

  return (
    <section className="panel listening-panel">
      <div className="listening-heading">
        <Headphones size={20} />
        <h2>{participantText(locale, isModel ? 'modelAudio' : 'listening')}</h2>
      </div>

      {/* Deliberately no `controls`: the native player offers a seek bar, and a
          student who can drag it backwards has unlimited replays whatever the
          limit says. */}
      <audio
        ref={audioRef}
        preload="auto"
        src={clip.public_url}
        onEnded={() => { setPlaying(false); setHeld(false); setActiveCue(-1) }}
        onError={() => setFailed(true)}
      />

      {isModel && prompt && <p className="listening-prompt">{prompt}</p>}
      <p className="muted">{participantText(locale, failed ? 'listeningFailed' : isModel ? 'modelAudioHint' : 'listeningHint')}</p>

      <div className="listening-controls">
        {/* Stop and carry on, the same as the passage reader's row. A learner
            shadowing a model recording pauses constantly, and until now this
            button could only be started: their one option was to let it run to
            the end. Where there IS a replay allowance the button stays a plain
            play, because holding it would be a way to stop the clock. */}
        <button
          className="listening-play"
          disabled={exhausted || failed || (playing && !canHold)}
          type="button"
          onClick={toggle}
        >
          {playing && canHold ? <Pause size={20} /> : <Play size={20} />}
          <span>{participantText(locale, playing
            ? canHold ? 'listeningPause' : 'listeningPlaying'
            : held
              ? 'listeningResume'
              : used > 0 ? 'listeningReplay' : 'listeningPlay')}</span>
        </button>

        <button
          aria-pressed={slow}
          className={slow ? 'listening-speed active' : 'listening-speed'}
          type="button"
          onClick={() => setSlow((current) => !current)}
        >
          <Gauge size={18} />
          <span>{participantText(locale, slow ? 'listeningNormal' : 'listeningSlow')}</span>
        </button>
      </div>

      {!isModel && prompt && (
        <div className="listening-transcript-wrap">
          <div className="listening-transcript-options">
            <label className="listening-transcript-toggle">
              <input checked={showTranscript} type="checkbox" onChange={(event) => setShowTranscript(event.target.checked)} />
              <span>{participantText(locale, 'listeningShowText')}</span>
            </label>
            {showTranscript && clip.language !== 'en' && Boolean(readingFontUrl || readingRuby?.length || readingWords?.length) && (
              <label className="listening-transcript-toggle">
                <input checked={plainText} type="checkbox" onChange={(event) => setPlainText(event.target.checked)} />
                <span>{participantText(locale, clip.language === 'ja' ? 'listeningHideFurigana' : readingRuby?.length || readingWords?.length ? 'listeningHidePinyin' : 'listeningHideZhuyin')}</span>
              </label>
            )}
          </div>
          {showTranscript && (
            <KaraokeText
              language={clip.language}
              activeCue={activeCue}
              cues={karaokeCues || []}
              fontFamily={plainText ? null : readingFamily}
              ruby={plainText ? [] : readingRuby || []}
              text={plainText ? stripReadingSelectors(prompt) : prompt}
              words={plainText ? null : readingWords || null}
            />
          )}
        </div>
      )}

      <p className={exhausted ? 'error' : 'muted'}>
        {remaining === null
          ? participantText(locale, isModel ? 'modelReplay' : 'listeningUnlimited')
          : remaining === 0
            ? participantText(locale, 'listeningNoPlaysLeft')
            : remaining === 1
              ? participantText(locale, 'listeningLastPlay')
              : participantText(locale, 'listeningPlaysLeft', { n: remaining })}
      </p>
    </section>
  )
}

function stripReadingSelectors(text: string) {
  return text.replace(/[\u{E0100}-\u{E01EF}]/gu, '')
}

export function KaraokeText({ activeCue, cues, fontFamily, ruby, text, words, language }: {
  language?: string
  activeCue: number
  cues: KaraokeCue[]
  fontFamily: string | null
  ruby: string[]
  text: string
  words: ReadingWord[] | null
}) {
  if (language === 'en') {
    const cue = activeCue >= 0 ? cues[activeCue] : null
    return <p className="listening-karaoke english-karaoke" aria-live="off">{englishTextRuns(text).map(run =>
      run.word ? <span key={run.offset} className={cue && run.start < cue.end_index && run.end > cue.start_index ? 'karaoke-word active' : 'karaoke-word'}>{run.text}</span> : run.text
    )}</p>
  }
  // A zhuyin variation selector belongs to the character before it. Grouping
  // them keeps the saved cue indexes aligned with the unannotated transcript.
  const units: string[] = []
  for (const character of [...text]) {
    if (/^[\u{E0100}-\u{E01EF}]$/u.test(character) && units.length) units[units.length - 1] += character
    else units.push(character)
  }
  const alignedRuby = ruby.length === units.length ? ruby : []

  // 正詞法 spells a word, so the ruby has to span one. The cues still count
  // characters, so the highlight is applied to each character inside the word
  // rather than to the word as a whole — a word half-spoken looks half-lit,
  // which is what karaoke is.
  const wordRuns = words?.length && words.map((word) => word.text).join('') === units.join('') ? words : null
  if (wordRuns) {
    const lit = (index: number) => activeCue >= 0
      && index >= cues[activeCue]?.start_index
      && index < cues[activeCue]?.end_index
    let at = 0
    return (
      <p className="listening-karaoke reading-ruby" style={fontFamily ? { fontFamily } : undefined} aria-live="off">
        {wordRuns.map((word, index) => {
          const from = at
          const body = [...word.text].map((character, offset) => (
            <span className={lit(from + offset) ? 'karaoke-character active' : 'karaoke-character'} key={offset}>{character}</span>
          ))
          at += [...word.text].length
          return word.pinyin
            ? <ruby key={index}>{body}<rt>{word.pinyin}</rt></ruby>
            : <span key={index}>{body}</span>
        })}
      </p>
    )
  }

  return (
    <p className={alignedRuby.length ? 'listening-karaoke reading-ruby' : 'listening-karaoke'} style={fontFamily ? { fontFamily } : undefined} aria-live="off">
      {units.map((unit, index) => {
        const highlighted = activeCue >= 0 && index >= cues[activeCue]?.start_index && index < cues[activeCue]?.end_index
        const character = <span className={highlighted ? 'karaoke-character active' : 'karaoke-character'}>{unit}</span>
        return alignedRuby[index]
          ? <ruby key={index}>{character}<rt>{alignedRuby[index]}</rt></ruby>
          : <span key={index}>{character}</span>
      })}
    </p>
  )
}
