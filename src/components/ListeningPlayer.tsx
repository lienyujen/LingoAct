import { useEffect, useRef, useState } from 'react'
import { Gauge, Headphones, Play } from '@phosphor-icons/react'
import { participantText } from '../lib/participantI18n'
import { useReadingFont } from '../lib/readingFont'
import type { ParticipantLocale } from '../lib/participantI18n'
import { playsUsed, recordPlay } from '../lib/listening'
import type { KaraokeCue, ListeningClip } from '../types'

type Props = {
  clip: ListeningClip
  questionId: string
  replayLimit: number | null
  prompt?: string | null
  readingFontUrl?: string | null
  readingRuby?: string[] | null
  karaokeCues?: KaraokeCue[] | null
  variant?: 'listening' | 'model'
  locale: ParticipantLocale
}

const SLOW_RATE = 0.75

export function ListeningPlayer({ clip, questionId, replayLimit, prompt, readingFontUrl, readingRuby, karaokeCues, variant = 'listening', locale }: Props) {
  const isModel = variant === 'model'
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const readingFamily = useReadingFont(readingFontUrl)
  const [used, setUsed] = useState(() => playsUsed(questionId))
  const [playing, setPlaying] = useState(false)
  const [slow, setSlow] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [activeCue, setActiveCue] = useState(-1)

  // A different question means a different allowance, and the component is
  // reused in place when the teacher moves on.
  useEffect(() => {
    setUsed(playsUsed(questionId))
    setPlaying(false)
    setFailed(false)
    setShowTranscript(false)
    setActiveCue(-1)
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
      setUsed(recordPlay(questionId))
    }).catch(() => setFailed(true))
  }

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
        onEnded={() => { setPlaying(false); setActiveCue(-1) }}
        onError={() => setFailed(true)}
      />

      {isModel && prompt && <p className="listening-prompt">{prompt}</p>}
      <p className="muted">{participantText(locale, failed ? 'listeningFailed' : isModel ? 'modelAudioHint' : 'listeningHint')}</p>

      <div className="listening-controls">
        <button className="listening-play" disabled={exhausted || playing || failed} type="button" onClick={start}>
          <Play size={20} />
          <span>{playing
            ? participantText(locale, 'listeningPlaying')
            : participantText(locale, used > 0 ? 'listeningReplay' : 'listeningPlay')}</span>
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
          <label className="listening-transcript-toggle">
            <input checked={showTranscript} type="checkbox" onChange={(event) => setShowTranscript(event.target.checked)} />
            <span>{participantText(locale, 'listeningShowText')}</span>
          </label>
          {showTranscript && (
            <KaraokeText
              activeCue={activeCue}
              cues={karaokeCues || []}
              fontFamily={readingFamily}
              ruby={readingRuby || []}
              text={prompt}
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

function KaraokeText({ activeCue, cues, fontFamily, ruby, text }: {
  activeCue: number
  cues: KaraokeCue[]
  fontFamily: string | null
  ruby: string[]
  text: string
}) {
  // A zhuyin variation selector belongs to the character before it. Grouping
  // them keeps the saved cue indexes aligned with the unannotated transcript.
  const units: string[] = []
  for (const character of [...text]) {
    if (/^[\u{E0100}-\u{E01EF}]$/u.test(character) && units.length) units[units.length - 1] += character
    else units.push(character)
  }
  const alignedRuby = ruby.length === units.length ? ruby : []

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
