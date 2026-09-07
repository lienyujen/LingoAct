import { useRef, useState } from 'react'
import { CheckCircle, CircleNotch, Microphone, PaperPlaneTilt, PencilSimpleLine, StopCircle } from '@phosphor-icons/react'
import { recordingToWav } from '../lib/audio'
import { requireSupabase } from '../lib/supabase'
import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'

type Props = {
  sessionId: string
  participantId: string
  participantToken: string
  responseId: string
  fileName: string
  previewUrl: string | null
  locale: ParticipantLocale
}

// 拍照描述: the description that goes with one photo, in the language being
// learned. Writing and speaking are the same task in two modes rather than two
// activities, so the card offers both and takes whichever the student uses.
const MAX_MS = 120_000

export function PhotoCaptionCard({
  sessionId, participantId, participantToken, responseId, fileName, previewUrl, locale,
}: Props) {
  const [mode, setMode] = useState<'written' | 'spoken'>('written')
  const [caption, setCaption] = useState('')
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)
  const timerRef = useRef(0)

  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    window.clearInterval(timerRef.current)
  }

  async function sendWritten() {
    const text = caption.trim()
    if (!text) return
    setBusy(true)
    setError('')
    try {
      const { data, error: sendError } = await requireSupabase().functions.invoke('participant-action', {
        body: { action: 'submit_caption', sessionId, participantId, participantToken, responseId, caption: text },
      })
      if (sendError) throw sendError
      if (!data?.response) throw new Error(data?.message || participantText(locale, 'captionFailed'))
      setSent(participantText(locale, 'captionSent'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : participantText(locale, 'captionFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function sendRecording(clip: Blob, durationMs: number) {
    setBusy(true)
    setError('')
    const supabase = requireSupabase()
    try {
      const wav = await recordingToWav(clip)
      const { data: prepared, error: prepareError } = await supabase.functions.invoke('participant-action', {
        body: {
          action: 'prepare_caption_recording',
          sessionId, participantId, participantToken, responseId, fileSize: wav.size,
        },
      })
      if (prepareError) throw prepareError
      if (!prepared?.uploadToken) throw new Error(prepared?.message || participantText(locale, 'captionFailed'))

      const { error: uploadError } = await supabase.storage
        .from('lingoact-recordings')
        .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, wav, { contentType: 'audio/wav', upsert: false })
      if (uploadError) throw uploadError

      const { data, error: submitError } = await supabase.functions.invoke('participant-action', {
        body: {
          action: 'submit_caption',
          sessionId, participantId, participantToken, responseId,
          storagePath: prepared.storagePath, durationMs,
        },
      })
      if (submitError) throw submitError
      if (!data?.response) throw new Error(data?.message || participantText(locale, 'captionFailed'))
      setSent(participantText(locale, 'captionSentSpoken'))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : participantText(locale, 'captionFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function startRecording() {
    setError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      chunksRef.current = []
      startedAtRef.current = Date.now()
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current
        releaseMicrophone()
        setRecording(false)
        setElapsed(0)
        if (durationMs < 250) {
          setError(participantText(locale, 'captionTooShort'))
          return
        }
        void sendRecording(new Blob(chunksRef.current, { type: recorder.mimeType }), Math.min(durationMs, MAX_MS))
      }
      recorder.start()
      setRecording(true)
      timerRef.current = window.setInterval(() => {
        const spent = Date.now() - startedAtRef.current
        setElapsed(spent)
        if (spent >= MAX_MS) recorderRef.current?.stop()
      }, 250)
    } catch {
      releaseMicrophone()
      setError(participantText(locale, 'micDenied'))
    }
  }

  return (
    <article className="photo-caption-card">
      <div className="photo-caption-shot">
        {previewUrl
          ? <img alt={fileName} src={previewUrl} />
          : <span className="photo-caption-name">{fileName}</span>}
      </div>

      {sent ? (
        <p className="success photo-caption-sent"><CheckCircle size={17} weight="fill" />{sent}</p>
      ) : (
        <div className="photo-caption-body">
          <div className="photo-caption-modes" role="tablist">
            <button
              aria-selected={mode === 'written'}
              className={mode === 'written' ? 'is-on' : ''}
              disabled={recording}
              role="tab"
              type="button"
              onClick={() => setMode('written')}
            >
              <PencilSimpleLine size={15} />{participantText(locale, 'captionWrite')}
            </button>
            <button
              aria-selected={mode === 'spoken'}
              className={mode === 'spoken' ? 'is-on' : ''}
              role="tab"
              type="button"
              onClick={() => setMode('spoken')}
            >
              <Microphone size={15} />{participantText(locale, 'captionSpeak')}
            </button>
          </div>

          {mode === 'written' ? (
            <>
              <textarea
                maxLength={2000}
                placeholder={participantText(locale, 'captionPlaceholder')}
                rows={3}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
              <button disabled={busy || !caption.trim()} type="button" onClick={() => void sendWritten()}>
                {busy ? <CircleNotch className="spin" size={16} /> : <PaperPlaneTilt size={16} />}
                {participantText(locale, 'captionSend')}
              </button>
            </>
          ) : (
            <button
              className={recording ? 'photo-caption-record is-recording' : 'photo-caption-record'}
              disabled={busy}
              type="button"
              onClick={() => (recording ? recorderRef.current?.stop() : void startRecording())}
            >
              {busy
                ? <><CircleNotch className="spin" size={17} />{participantText(locale, 'captionSending')}</>
                : recording
                  ? <><StopCircle size={17} weight="fill" />{participantText(locale, 'captionStop')} {Math.ceil(elapsed / 1000)}s</>
                  : <><Microphone size={17} />{participantText(locale, 'captionRecord')}</>}
            </button>
          )}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </article>
  )
}
