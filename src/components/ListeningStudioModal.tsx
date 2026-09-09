import { useEffect, useRef, useState } from 'react'
import { TimingRow } from './TimingRow'
import type { ClipboardEvent } from 'react'
import {
  analyzeListeningSource,
  dispatchListeningQuestion,
  dispatchListeningQuiz,
  synthesizeListening,
  uploadListeningScreenshot,
  annotateReading,
  applyAnnotation,
} from '../lib/listening'
import type { ListeningKind, PresenterListeningClip } from '../types'
import { usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'

type Props = {
  initialTranscript?: string
  // 注音 or 拼音, decided with the rest of the class rather than per clip.
  readingAnnotation: string
  open: boolean
  // Kept mounted but out of sight while the drag-select capture is running.
  suspended?: boolean
  sessionId: string
  presenterToken: string
  teachingLanguage: string
  // The desktop app's own screen capture, the same drag-select 截圖派題 uses.
  // Absent in the browser, where there is no screen to grab.
  onCaptureScreen?: () => void
  // What that capture produced, handed over as a file. The studio reads it once
  // and says so, because the same crop arriving twice would pay for the AI
  // recognition twice.
  capturedScreen?: File | null
  onCapturedScreenRead?: () => void
  onClose: () => void
}

const KIND_LABELS: Record<ListeningKind, PresenterMessageKey> = {
  passage: 'kindPassage',
  dialogue: 'kindDialogue',
  scene: 'kindScene',
}

// Two voices is the synthesis API's ceiling, so the assignment UI never offers
// more than the audio can actually distinguish.
const VOICES = ['Kore', 'Puck']

// A pasted dialogue already names its speakers on every line, so read them from
// there rather than making the teacher type them twice. Without this a dialogue
// typed by hand silently synthesises in one voice: the speakers list stays empty,
// and the two-voice path is never taken.
function speakersFromTranscript(text: string) {
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^：:]{1,12})[：:]/)
    const name = match?.[1]?.trim()
    if (name && !names.includes(name)) names.push(name)
    if (names.length >= VOICES.length) break
  }
  return names
}

function MicIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <rect x="9" y="2" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v4" />
    </svg>
  )
}

// A crop frame, matching the drag-out-a-rectangle gesture the button starts.
function CropIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14" />
    </svg>
  )
}

function HiddenIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 9 7a11 11 0 0 1-2.2 3.4M6.6 6.7C4.2 8.2 3 10.3 3 12c0 2.5 4 7 9 7a9.5 9.5 0 0 0 4-.9" />
    </svg>
  )
}

function PlayIcon({ size = 17 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
}

export function ListeningStudioModal({
  initialTranscript = '',
  open,
  suspended = false,
  sessionId,
  presenterToken,
  teachingLanguage,
  readingAnnotation,
  onCaptureScreen,
  capturedScreen,
  onCapturedScreenRead,
  onClose,
}: Props) {
  const t = usePresenterText()
  const [source, setSource] = useState<'screenshot' | 'text'>('screenshot')
  const [transcript, setTranscript] = useState('')
  const [kind, setKind] = useState<ListeningKind>('passage')
  const [script, setScript] = useState<'traditional' | 'simplified'>('traditional')
  const [speakers, setSpeakers] = useState<string[]>([])
  const [speakersTouched, setSpeakersTouched] = useState(false)
  const [screenshotId, setScreenshotId] = useState<string | null>(null)
  const [clip, setClip] = useState<PresenterListeningClip | null>(null)
  const [replayLimit, setReplayLimit] = useState<number | null>(2)
  // Only the read-aloud dispatch uses these: a listening item is paced by its
  // own audio, and a quiz runs through the attempt flow.
  const [prepareSeconds, setPrepareSeconds] = useState<number | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [onAir, setOnAir] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (open && initialTranscript) {
      setSource('text')
      setTranscript(initialTranscript)
    }
  }, [open, initialTranscript])

  useEffect(() => {
    if (open) return
    setSource('screenshot')
    setTranscript('')
    setKind('passage')
    setSpeakers([])
    setSpeakersTouched(false)
    setScreenshotId(null)
    setClip(null)
    setBusy('')
    setError('')
    setOnAir(false)
  }, [open])

  useEffect(() => {
    if (kind !== 'dialogue' || speakersTouched) return
    setSpeakers(speakersFromTranscript(transcript))
  }, [kind, transcript, speakersTouched])

  // A crop has come back from the desktop capture. readImage is a hoisted
  // function declaration, so it is in scope here even though it is written
  // below the early return.
  useEffect(() => {
    if (!capturedScreen) return
    onCapturedScreenRead?.()
    void readImage(capturedScreen)
    // readImage is redefined every render and would re-run this on each one;
    // the captured file is what actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedScreen])

  if (!open) return null

  async function readImage(file: File) {
    setError('')
    setBusy(t('readingShot'))
    try {
      const id = await uploadListeningScreenshot(sessionId, presenterToken, file, t)
      setScreenshotId(id)
      setBusy(t('recognising'))
      const analysis = await analyzeListeningSource({ sessionId, presenterToken, screenshotId: id, teachingLanguage })
      setTranscript(analysis.transcript)
      setKind(analysis.kind)
      setSpeakers(analysis.speakers.slice(0, VOICES.length))
      setSpeakersTouched(true)
      if (analysis.script) setScript(analysis.script)
      // Synthesis is deliberately NOT chained on: a character the model misread
      // would otherwise be read out to the whole class as the thing they are
      // meant to be hearing.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('recogniseFailed'))
    } finally {
      setBusy('')
    }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const file = Array.from(event.clipboardData.files).find((candidate) => candidate.type.startsWith('image/'))
    if (file) { event.preventDefault(); void readImage(file) }
  }

  async function synthesize() {
    setError('')
    setBusy(t('synthesising'))
    try {
      const result = await synthesizeListening({
        sessionId,
        presenterToken,
        transcript: transcript.trim(),
        kind,
        language: teachingLanguage,
        script: teachingLanguage.startsWith('zh') ? script : null,
        speakers: kind === 'dialogue' ? speakers : [],
        screenshotId,
      })
      setClip(result.clip)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('synthFailed'))
    } finally {
      setBusy('')
    }
  }

  async function dispatch(target: 'audio' | 'quiz' | 'read_aloud') {
    if (!clip) return
    setError('')
    setBusy(target === 'quiz' ? t('generatingQuiz') : t('dispatching'))
    try {
      if (target === 'quiz') {
        await dispatchListeningQuiz({
          sessionId,
          presenterToken,
          listeningClipId: clip.id,
          replayLimit,
          direction: '根據學生聽到的內容出理解題',
          requestedCount: null,
        })
      } else if (target === 'read_aloud') {
        // Marked up on the way out, not when the clip was made: a clip can be
        // dispatched as audio, as a quiz, or read aloud, and only the last of
        // those needs — or may safely carry — the text and its font.
        if (readingAnnotation !== 'none' && teachingLanguage.startsWith('zh')) {
          setBusy(t('annotating'))
          try {
            const marked = await annotateReading({
              sessionId, presenterToken, text: clip.transcript,
              mode: readingAnnotation as 'zhuyin' | 'pinyin',
            })
            await applyAnnotation({
              sessionId, presenterToken, clipId: clip.id,
              mode: readingAnnotation as 'zhuyin' | 'pinyin',
              annotationText: marked.annotationText,
            }, t)
          } catch (caught) {
            // Losing the annotation is a shame; losing the activity is worse.
            // The words still read, just without 注音 above them.
            console.error('annotation failed', caught)
            setError(caught instanceof Error ? t('annotateFailedWith', { message: caught.message }) : t('annotateFailed'))
          }
          setBusy(t('dispatching'))
        }
        // The learner sees the words and hears the model, then records their
        // own take against it — so the clip stops being a test and becomes a
        // reference, and the transcript travels on the question.
        await dispatchListeningQuestion({
          sessionId,
          presenterToken,
          listeningClipId: clip.id,
          replayLimit: null,
          promptText: '',
          mode: 'read_aloud',
          prepareSeconds,
          answerSeconds,
        })
      } else {
        await dispatchListeningQuestion({
          sessionId, presenterToken, listeningClipId: clip.id, replayLimit, promptText: '',
        })
      }
      setOnAir(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('sendFailed'))
    } finally {
      setBusy('')
    }
  }

  const canSynthesize = transcript.trim().length > 0 && !busy

  return (
    <div
      className="modal-backdrop listening-studio-backdrop"
      role="presentation"
      style={suspended ? { display: 'none' } : undefined}
    >
      <div className="listening-studio">

        <header className="ls-head">
          <span className="ls-mark"><MicIcon /></span>
          <h2>{t('listeningStudio')}</h2>
          <span className="ls-spacer" />
          {onAir && <span className="ls-onair"><span className="ls-dot" />ON AIR</span>}
          <button className="ls-close" type="button" aria-label={t('close')} onClick={onClose}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>

        <div className="ls-body">
          <div className="ls-tabs" role="tablist">
            <button role="tab" aria-selected={source === 'screenshot'} className={source === 'screenshot' ? 'is-on' : ''} type="button" onClick={() => setSource('screenshot')}>{t('fromScreenshot')}</button>
            <button role="tab" aria-selected={source === 'text'} className={source === 'text' ? 'is-on' : ''} type="button" onClick={() => setSource('text')}>{t('pasteText')}</button>
            <span className="ls-spacer" />
            {source === 'text' && <span className="ls-hint">{t('textCheaperHint')}</span>}
          </div>

          {source === 'screenshot' && !transcript && (
            <div className="ls-drop" onPaste={onPaste} tabIndex={0}>
              {/* The teacher already has the page on screen — a textbook, a
                  slide, a PDF. Making them save it as a file first was the
                  long way round to the same image. */}
              {onCaptureScreen && (
                <button className="ls-capture" type="button" onClick={onCaptureScreen}>
                  <CropIcon />{t('captureFromScreen')}
                </button>
              )}
              <p>{onCaptureScreen ? t('listeningDropOrHint') : t('listeningDropHint')}</p>
              <input
                accept="image/png,image/jpeg,image/webp"
                type="file"
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void readImage(file) }}
              />
            </div>
          )}

          {(transcript || source === 'text') && (
            <>
              <div className="ls-chips">
                {(Object.keys(KIND_LABELS) as ListeningKind[]).map((value) => (
                  <button key={value} className={kind === value ? 'ls-chip is-on' : 'ls-chip'} type="button" onClick={() => setKind(value)}>
                    {t(KIND_LABELS[value])}
                  </button>
                ))}
                {teachingLanguage.startsWith('zh') && (
                  <button className="ls-chip ls-chip-script" type="button" onClick={() => setScript(script === 'traditional' ? 'simplified' : 'traditional')}>
                    {script === 'traditional' ? t('scriptTraditional') : t('scriptSimplified')}
                  </button>
                )}
              </div>

              <div className="ls-transcript">
                <div className="ls-transcript-head">
                  <HiddenIcon />
                  <span>{t('transcriptHidden')}</span>
                  <span className="ls-spacer" />
                  <span className="ls-count">{t('charCount', { n: transcript.length })}</span>
                </div>
                <textarea
                  maxLength={4000}
                  placeholder={t('transcriptPlaceholder')}
                  value={transcript}
                  onChange={(event) => { setTranscript(event.target.value); setClip(null) }}
                />
              </div>

              {kind === 'dialogue' && speakers.length < 2 && (
                <p className="ls-note">{t('dialogueNeedsSpeakers')}</p>
              )}

              {kind === 'dialogue' && speakers.length > 0 && (
                <div className="ls-voices">
                  {speakers.map((speaker, index) => (
                    <div key={speaker} className="ls-voice">
                      <span className={index === 0 ? 'ls-voice-dot' : 'ls-voice-dot alt'} />
                      <input
                        value={speaker}
                        onChange={(event) => { setSpeakersTouched(true); setSpeakers(speakers.map((name, i) => (i === index ? event.target.value : name))) }}
                      />
                      <span className="ls-voice-name">{VOICES[index]}</span>
                    </div>
                  ))}
                </div>
              )}

              {clip ? (
                <div className="ls-player">
                  <button className="ls-play" type="button" onClick={() => audioRef.current?.play()}><PlayIcon /></button>
                  <audio ref={audioRef} preload="auto" src={clip.public_url} />
                  <div className="ls-player-meta">
                    <strong>{t('audioReady')}</strong>
                    <span>{t('clipLength', { n: ((clip.duration_ms || 0) / 1000).toFixed(1) })}</span>
                  </div>
                </div>
              ) : (
                <button className="ls-synth" disabled={!canSynthesize} type="button" onClick={() => void synthesize()}>
                  {busy || t('toSpeech')}
                </button>
              )}

              {clip && (
                <div className="ls-timing">
                  <TimingRow label={t('prepareTime')} offLabel={t('noPrepare')} presets={[null, 10, 20, 30]} value={prepareSeconds} onChange={setPrepareSeconds} />
                  <TimingRow label={t('readAloudTime')} offLabel={t('noTimeLimit')} presets={[null, 30, 60, 90]} value={answerSeconds} onChange={setAnswerSeconds} />
                  <p className="ls-note">{t('listeningTimingNote')}</p>
                </div>
              )}

              {clip && (
                <div className="ls-replay">
                  <span>{t('replayCount')}</span>
                  <span className="ls-spacer" />
                  <div className="ls-replay-set">
                    {[1, 2, 3].map((value) => (
                      <button key={value} className={replayLimit === value ? 'is-on' : ''} type="button" onClick={() => setReplayLimit(value)}>{value}</button>
                    ))}
                    <button className={replayLimit === null ? 'is-on' : ''} type="button" onClick={() => setReplayLimit(null)}>∞</button>
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="ls-error">{error}</p>}
        </div>

        <footer className="ls-foot">
          {!clip && <p className="ls-dispatch-hint">{t('synthesizeBeforeDispatch')}</p>}
          <button className="ls-secondary" disabled={!clip || Boolean(busy)} type="button" onClick={() => void dispatch('audio')}>{t('sendAudioOnly')}</button>
          <button className="ls-secondary" disabled={!clip || Boolean(busy)} type="button" onClick={() => void dispatch('read_aloud')}>{t('sendReadAloud')}</button>
          <button className="ls-primary" disabled={!clip || Boolean(busy)} type="button" onClick={() => void dispatch('quiz')}>{t('sendListeningQuiz')}</button>
        </footer>
      </div>
    </div>
  )
}
