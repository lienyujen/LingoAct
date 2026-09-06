import { ArrowCounterClockwise, Microphone, StopCircle } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { recordingToWav } from '../lib/audio'
import type { AudioResponse, Question } from '../types'
import { participantText } from '../lib/participantI18n'
import { localizedFields } from '../lib/localizedContent'
import type { ParticipantLocale } from '../lib/participantI18n'

type Props = {
  busy: boolean
  question: Question
  response: AudioResponse | null
  onSubmit: (file: File, durationMs: number) => Promise<void>
  locale?: ParticipantLocale
}

// The ceiling when a question sets no limit of its own. A timed challenge
// replaces it with its own, shorter one.
const DEFAULT_MAX_MS = 180_000

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function AudioRecorder({ busy, question, response, onSubmit, locale = 'zh-TW' }: Props) {
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  // Counts down while the student plans; recording then begins on its own, which
  // is what makes it a challenge rather than a form.
  const [prepareLeft, setPrepareLeft] = useState<number | null>(null)

  const answerSeconds = question.answer_seconds ?? null
  const prepareSeconds = question.prepare_seconds ?? null
  const maxDurationMs = answerSeconds ? answerSeconds * 1000 : DEFAULT_MAX_MS
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)
  const startRecordingRef = useRef<() => Promise<void>>(async () => {})

  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  useEffect(() => () => {
    cancelledRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    releaseMicrophone()
  }, [question.id])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      const next = Date.now() - startedAtRef.current
      setElapsed(next)
      if (next >= maxDurationMs && recorderRef.current?.state === 'recording') recorderRef.current.stop()
    }, 200)
    return () => window.clearInterval(timer)
  }, [maxDurationMs, recording])

  // The preparation clock. Reaching zero starts the recording rather than merely
  // unlocking the button: a challenge that waits for another tap is not timed.
  useEffect(() => {
    if (prepareLeft === null) return
    if (prepareLeft <= 0) {
      setPrepareLeft(null)
      void startRecordingRef.current()
      return
    }
    const timer = window.setTimeout(() => setPrepareLeft((current) => (current === null ? null : current - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [prepareLeft])

  async function startRecording() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('此瀏覽器不支援錄音，請改用最新版 Chrome、Edge 或 Safari。')
      return
    }
    try {
      cancelledRef.current = false
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      streamRef.current = stream
      const preferred = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        setError('錄音失敗，請確認麥克風權限後重試。')
        setRecording(false)
        releaseMicrophone()
      }
      recorder.onstop = async () => {
        const durationMs = Math.min(maxDurationMs, Date.now() - startedAtRef.current)
        setRecording(false)
        releaseMicrophone()
        if (cancelledRef.current) return
        if (durationMs < 500) {
          setError('錄音時間太短，請至少說半秒後再停止。')
          return
        }
        try {
          const source = new Blob(chunksRef.current, { type: recorder.mimeType })
          const wav = await recordingToWav(source)
          await onSubmit(new File([wav], `lingoact-${question.id}.wav`, { type: 'audio/wav' }), durationMs)
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : '錄音處理失敗，請重新錄製。')
        }
      }
      startedAtRef.current = Date.now()
      setElapsed(0)
      setRecording(true)
      recorder.start(250)
    } catch {
      setError('無法使用麥克風，請在瀏覽器網址列允許麥克風權限。')
      releaseMicrophone()
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  if (response) {
    const originalAnalysis = response.analysis_json
    const analysis = localizedFields(originalAnalysis?.translations, locale) || originalAnalysis
    return (
      <div className="audio-response-card" aria-live="polite">
        {question.status === 'active' ? (
          <p className="success">{participantText(locale, 'recordingSent')}</p>
        ) : response.analysis_status === 'success' && analysis ? (
          <>
            <div className="audio-feedback-heading">
              <div>
                <h3>{participantText(locale, 'personalAssessment')}</h3>
                <p className="muted">{participantText(locale, 'detectedLanguage')}{analysis.detected_language}</p>
              </div>
              <div className="audio-score"><strong>{analysis.score}</strong><span>{participantText(locale, 'points')}</span></div>
            </div>
            <p className="audio-feedback-summary">{analysis.summary}</p>
            {response.signed_url && <audio controls preload="metadata" src={response.signed_url} />}
            <div className="audio-analysis-grid">
              <div><strong>{participantText(locale, 'relevance')}</strong><p>{analysis.relevance}</p></div>
              <div><strong>{participantText(locale, 'clarity')}</strong><p>{analysis.clarity}</p></div>
              <div><strong>{participantText(locale, 'completeness')}</strong><p>{analysis.completeness}</p></div>
            </div>
            <div className="audio-feedback-section"><strong>{participantText(locale, 'doneWell')}</strong><ul>{analysis.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <div className="audio-feedback-section"><strong>{participantText(locale, 'nextStep')}</strong><ul>{analysis.improvements.map((item) => <li key={item}>{item}</li>)}</ul></div>
            <details><summary>{participantText(locale, 'transcript')}</summary><p>{analysis.transcript || participantText(locale, 'noTranscript')}</p></details>
          </>
        ) : response.analysis_status === 'failed' ? (
          <p className="error">{participantText(locale, 'assessmentFailed')}</p>
        ) : (
          <p className="muted">{participantText(locale, 'assessmentPending')}</p>
        )}
      </div>
    )
  }

  startRecordingRef.current = startRecording

  const preparing = prepareLeft !== null
  // A timed challenge counts down; an untimed recording counts up, because there
  // is nothing to count towards.
  const remainingMs = answerSeconds ? Math.max(0, maxDurationMs - elapsed) : null

  return (
    <div className="audio-recorder">
      <p className="muted">{answerSeconds === null
        ? participantText(locale, 'recordingHint')
        : prepareSeconds === null
          ? participantText(locale, 'recordingHintTimed', { seconds: answerSeconds })
          : participantText(locale, 'recordingHintPrepare', { prepare: prepareSeconds, seconds: answerSeconds })}</p>
      {preparing && (
        <p className="audio-countdown" aria-live="polite">
          <span>{participantText(locale, 'preparing')}</span>
          <strong>{prepareLeft}</strong>
        </p>
      )}
      <button
        className={recording ? 'recording-button active' : 'recording-button'}
        disabled={busy || preparing}
        type="button"
        onClick={recording ? stopRecording : prepareSeconds ? () => setPrepareLeft(prepareSeconds) : startRecording}
      >
        {recording ? <StopCircle size={28} /> : busy ? <ArrowCounterClockwise className="spin" size={28} /> : <Microphone size={28} />}
        <span>{recording
          ? `${participantText(locale, 'stopRecording')} ${formatDuration(remainingMs ?? elapsed)}${remainingMs === null ? '' : ' ' + participantText(locale, 'recordingLeft')}`
          : busy
            ? participantText(locale, 'uploading')
            : preparing
              ? participantText(locale, 'preparing')
              : participantText(locale, prepareSeconds ? 'prepareStart' : 'startRecording')}</span>
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
