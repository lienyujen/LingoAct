import { useEffect, useRef, useState } from 'react'
import { Gauge, Headphones, Play } from '@phosphor-icons/react'
import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'
import { playsUsed, recordPlay } from '../lib/listening'
import type { ListeningClip } from '../types'

type Props = {
  clip: ListeningClip
  questionId: string
  replayLimit: number | null
  prompt?: string | null
  variant?: 'listening' | 'model'
  locale: ParticipantLocale
}

const SLOW_RATE = 0.75

export function ListeningPlayer({ clip, questionId, replayLimit, prompt, variant = 'listening', locale }: Props) {
  const isModel = variant === 'model'
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [used, setUsed] = useState(() => playsUsed(questionId))
  const [playing, setPlaying] = useState(false)
  const [slow, setSlow] = useState(false)
  const [failed, setFailed] = useState(false)

  // A different question means a different allowance, and the component is
  // reused in place when the teacher moves on.
  useEffect(() => {
    setUsed(playsUsed(questionId))
    setPlaying(false)
    setFailed(false)
  }, [questionId])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = slow ? SLOW_RATE : 1
  }, [slow])

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
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
      />

      {prompt && <p className="listening-prompt">{prompt}</p>}
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
