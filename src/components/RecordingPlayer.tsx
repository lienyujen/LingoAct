import { useEffect, useRef, useState } from 'react'
import type { AudioResponse } from '../types'
import { classroomMessage } from '../lib/classroomMessages'
import { recordingBlob, refreshRecordingUrl } from '../lib/recordingPlayback'

export function RecordingPlayer({ recording, locale = 'zh-TW', student = false }: { recording: AudioResponse; locale?: string; student?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null)
  const latest = useRef(recording)
  latest.current = recording
  const controller = useRef<AbortController | null>(null)
  const objectUrl = useRef('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setUrl(''); setFailed(false); setBusy(false)
    return () => {
      controller.current?.abort()
      controller.current = null
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = ''
    }
  }, [recording.id])

  async function load() {
    if (controller.current) return
    const request = new AbortController()
    controller.current = request
    setBusy(true); setFailed(false)
    try {
      const blob = await recordingBlob(latest.current.signed_url || null, () => refreshRecordingUrl(latest.current, student), request.signal)
      if (request.signal.aborted) return
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = URL.createObjectURL(blob)
      setUrl(objectUrl.current)
    } catch {
      if (!request.signal.aborted) setFailed(true)
    } finally {
      if (!request.signal.aborted) { controller.current = null; setBusy(false) }
    }
  }
  const seconds = Math.max(0, Math.round(recording.duration_ms / 1000))
  return <div className="recording-player">
    <span className="muted">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</span>
    {!url || failed ? <button type="button" disabled={busy} onClick={() => void load()}>{classroomMessage(locale, busy ? 'loadingRecording' : failed ? 'retryPlayback' : 'playRecording')}</button> : <>
      <audio ref={audio} controls preload="metadata" src={url} onLoadedMetadata={() => { void audio.current?.play().catch(() => {}) }} onError={() => setFailed(true)} />
      <a href={url} download={`recording-${recording.id}.wav`}>{classroomMessage(locale, 'downloadRecording')}</a>
    </>}
    {failed && <p role="alert">{classroomMessage(locale, 'recordingUnavailable')}</p>}
  </div>
}
