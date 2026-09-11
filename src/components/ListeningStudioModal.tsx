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
import type { ListeningAccent, SpeakerGender } from '../lib/listening'
import type { ListeningKind, PresenterListeningClip } from '../types'
import { usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'

type Props = {
  initialTranscript?: string
  initialKind?: StudioKind
  initialAccent?: ListeningAccent
  initialReplayLimit?: number | null
  initialPrepareSeconds?: number | null
  initialAnswerSeconds?: number | null
  // 注音 or 拼音, decided with the rest of the class rather than per clip.
  readingAnnotation: string
  open: boolean
  // Kept mounted but out of sight while the drag-select capture is running.
  suspended?: boolean
  sessionId: string
  presenterToken: string
  teachingLanguage: string
  teachingTrack: string
  levelFramework: string | null
  levelCode: string | null
  // The desktop app's own screen capture, the same drag-select 截圖派題 uses.
  // Absent in the browser, where there is no screen to grab.
  onCaptureScreen?: () => void
  // What that capture produced, handed over as a file. The studio reads it once
  // and says so, because the same crop arriving twice would pay for the AI
  // recognition twice.
  capturedScreen?: File | null
  onCapturedScreenRead?: () => void
  onClose: () => void
  onDispatched: () => void
}

type StudioKind = Extract<ListeningKind, 'passage' | 'dialogue'>

const KIND_LABELS: Record<StudioKind, PresenterMessageKey> = {
  passage: 'kindPassage',
  dialogue: 'kindDialogue',
}

// Two voices is the synthesis API's ceiling, so the assignment UI never offers
// more than the audio can actually distinguish.
const VOICE_LIMIT = 2

const ACCENTS: Array<{ value: ListeningAccent; label: PresenterMessageKey }> = [
  { value: 'standard_guoyu', label: 'accentStandardGuoyu' },
  { value: 'putonghua', label: 'accentPutonghua' },
  { value: 'taiwanese', label: 'accentTaiwanese' },
]

function nextAccent(current: ListeningAccent) {
  const at = ACCENTS.findIndex((choice) => choice.value === current)
  return ACCENTS[(at + 1) % ACCENTS.length].value
}

const VOICE_CHOICES: Array<{ value: Exclude<SpeakerGender, 'unknown'>; label: PresenterMessageKey }> = [
  { value: 'male', label: 'voiceMale' },
  { value: 'female', label: 'voiceFemale' },
  { value: 'boy', label: 'voiceBoy' },
  { value: 'girl', label: 'voiceGirl' },
]

function nextSpeakerVoice(current: SpeakerGender, index: number) {
  const assigned = assignedSpeakerGender(current, index)
  const at = VOICE_CHOICES.findIndex((choice) => choice.value === assigned)
  return VOICE_CHOICES[(at + 1) % VOICE_CHOICES.length].value
}

// Only decide when the name or role says it plainly. Ambiguous personal names
// stay unknown and get contrasting voices without inventing a gender.
function inferSpeakerGender(name: string): SpeakerGender {
  const normalised = name.trim().toLowerCase()
  if (/(男童|男孩|小男生|兒子|弟弟|boy|son|schoolboy)/i.test(normalised)) return 'boy'
  if (/(女童|女孩|小女生|女兒|妹妹|girl|daughter|schoolgirl)/i.test(normalised)) return 'girl'
  if (/(先生|爸爸|父親|哥哥|叔叔|伯伯|舅舅|爺爺|外公|男生|mr\.?|sir|father|dad|brother|grandpa|お父さん|お兄さん|형|오빠|아버지)/i.test(normalised)) return 'male'
  if (/(女士|小姐|媽媽|母親|姐姐|阿姨|姑姑|奶奶|外婆|女生|mrs\.?|ms\.?|miss|madam|mother|mom|sister|grandma|お母さん|お姉さん|언니|누나|어머니)/i.test(normalised)) return 'female'
  if (/^(小明|阿明|大雄|小華|小強)$/.test(normalised)) return 'boy'
  if (/^(小美|小芳|莉莉|小麗|靜香)$/.test(normalised)) return 'girl'
  if (/^(志明|建宏|俊傑|家豪|宇軒)$/.test(normalised)) return 'male'
  if (/^(美玲|雅婷|怡君|淑芬)$/.test(normalised)) return 'female'
  return 'unknown'
}

function assignedSpeakerGender(gender: SpeakerGender | undefined, index: number): Exclude<SpeakerGender, 'unknown'> {
  return gender && gender !== 'unknown' ? gender : index % 2 === 0 ? 'female' : 'male'
}

function analysedSpeakerGender(gender: SpeakerGender | undefined, name: string, index: number) {
  const inferred = gender && gender !== 'unknown' ? gender : inferSpeakerGender(name)
  return assignedSpeakerGender(inferred, index)
}

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
    if (names.length >= VOICE_LIMIT) break
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

export function ListeningStudioModal({
  initialTranscript = '',
  initialKind = 'passage',
  initialAccent = 'standard_guoyu',
  initialReplayLimit = null,
  initialPrepareSeconds = null,
  initialAnswerSeconds = null,
  open,
  suspended = false,
  sessionId,
  presenterToken,
  teachingLanguage,
  teachingTrack,
  levelFramework,
  levelCode,
  readingAnnotation,
  onCaptureScreen,
  capturedScreen,
  onCapturedScreenRead,
  onClose,
  onDispatched,
}: Props) {
  const t = usePresenterText()
  const [source, setSource] = useState<'screenshot' | 'text'>('screenshot')
  const [transcript, setTranscript] = useState('')
  const [kind, setKind] = useState<StudioKind>('passage')
  const [accent, setAccent] = useState<ListeningAccent>('standard_guoyu')
  const [speakers, setSpeakers] = useState<string[]>([])
  const [speakerGenders, setSpeakerGenders] = useState<SpeakerGender[]>([])
  const [speakersTouched, setSpeakersTouched] = useState(false)
  const [screenshotId, setScreenshotId] = useState<string | null>(null)
  const [includeScreenshot, setIncludeScreenshot] = useState(false)
  const [clip, setClip] = useState<PresenterListeningClip | null>(null)
  const [replayLimit, setReplayLimit] = useState<number | null>(null)
  // Only the read-aloud dispatch uses these: a listening item is paced by its
  // own audio, and a quiz runs through the attempt flow.
  const [prepareSeconds, setPrepareSeconds] = useState<number | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!open) return
    if (initialTranscript) setSource('text')
    setTranscript(initialTranscript)
    setKind(initialKind)
    setAccent(initialAccent)
    setReplayLimit(initialReplayLimit)
    setPrepareSeconds(initialPrepareSeconds)
    setAnswerSeconds(initialAnswerSeconds)
  }, [initialAccent, initialAnswerSeconds, initialKind, initialPrepareSeconds, initialReplayLimit, initialTranscript, open])

  useEffect(() => {
    if (open) return
    setSource('screenshot')
    setTranscript('')
    setKind('passage')
    setAccent('standard_guoyu')
    setSpeakers([])
    setSpeakerGenders([])
    setSpeakersTouched(false)
    setScreenshotId(null)
    setIncludeScreenshot(false)
    setClip(null)
    setBusy('')
    setError('')
  }, [open])

  useEffect(() => {
    if (kind !== 'dialogue' || speakersTouched) return
    const names = speakersFromTranscript(transcript)
    setSpeakers(names)
    setSpeakerGenders(names.map((name, index) => assignedSpeakerGender(inferSpeakerGender(name), index)))
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
      setTranscript('')
      setClip(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('recogniseFailed'))
    } finally {
      setBusy('')
    }
  }

  async function analyzeScreenshot() {
    if (!screenshotId) return
    setError('')
    setBusy(t('recognising'))
    try {
      const analysis = await analyzeListeningSource({
        sessionId,
        presenterToken,
        screenshotId,
        teachingTrack,
        requestedKind: kind,
        levelFramework,
        levelCode,
      })
      setTranscript(analysis.transcript)
      const names = analysis.speakers.slice(0, VOICE_LIMIT)
      setSpeakers(names)
      setSpeakerGenders(names.map((name, index) => analysedSpeakerGender(analysis.speakerGenders[index], name, index)))
      setSpeakersTouched(true)
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
        accent: teachingLanguage.startsWith('zh') ? accent : null,
        speakers: kind === 'dialogue' ? speakers : [],
        speakerGenders: kind === 'dialogue' ? speakerGenders : [],
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
          screenshotId: source === 'screenshot' && includeScreenshot ? screenshotId : null,
        })
      } else if (target === 'read_aloud' || target === 'audio') {
        // Marked up on the way out, not when the clip was made: only the two
        // teaching modes that deliberately show the transcript may carry its
        // reading. A comprehension quiz still receives neither text nor font.
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
        // Both modes carry the transcript. Audio keeps it folded until the
        // learner asks; read-aloud shows it in the ordinary prompt immediately.
        await dispatchListeningQuestion({
          sessionId,
          presenterToken,
          listeningClipId: clip.id,
          replayLimit: target === 'read_aloud' ? null : replayLimit,
          promptText: '',
          mode: target,
          prepareSeconds: target === 'read_aloud' ? prepareSeconds : null,
          answerSeconds: target === 'read_aloud' ? answerSeconds : null,
          screenshotId: source === 'screenshot' && includeScreenshot ? screenshotId : null,
        })
      }
      onDispatched()
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

          <div className="ls-chips">
            {(Object.keys(KIND_LABELS) as StudioKind[]).map((value) => (
              <button key={value} className={kind === value ? 'ls-chip is-on' : 'ls-chip'} type="button" onClick={() => { setKind(value); setClip(null) }}>
                {t(KIND_LABELS[value])}
              </button>
            ))}
            {teachingLanguage.startsWith('zh') && (
              <div className="ls-accent-set" aria-label={t('accentLabel')}>
                <button
                  className="ls-chip is-on ls-accent-cycle"
                  type="button"
                  aria-label={`${t('accentLabel')}：${t(ACCENTS.find((choice) => choice.value === accent)?.label ?? 'accentStandardGuoyu')}`}
                  onClick={() => { setAccent(nextAccent(accent)); setClip(null) }}
                >
                  {t(ACCENTS.find((choice) => choice.value === accent)?.label ?? 'accentStandardGuoyu')}
                </button>
              </div>
            )}
          </div>

          {source === 'screenshot' && !screenshotId && (
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

          {source === 'screenshot' && screenshotId && !transcript && (
            <button className="ls-synth" disabled={Boolean(busy)} type="button" onClick={() => void analyzeScreenshot()}>
              {busy || t('generateListeningText')}
            </button>
          )}

          {(transcript || source === 'text') && (
            <>
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

              {source === 'screenshot' && screenshotId && (
                <label className="ls-include-shot">
                  <input type="checkbox" checked={includeScreenshot} onChange={(event) => setIncludeScreenshot(event.target.checked)} />
                  <span>{t('includeListeningScreenshot')}</span>
                </label>
              )}

              {kind === 'dialogue' && speakers.length < 2 && (
                <p className="ls-note">{t('dialogueNeedsSpeakers')}</p>
              )}

              {kind === 'dialogue' && speakers.length > 0 && (
                <div className="ls-voices">
                  {speakers.map((speaker, index) => {
                    const selectedVoice = assignedSpeakerGender(speakerGenders[index], index)
                    return (
                      <div key={index} className="ls-voice">
                        <span className={index === 0 ? 'ls-voice-dot' : 'ls-voice-dot alt'} />
                        <input
                          aria-label={t('speakerName')}
                          value={speaker}
                          onChange={(event) => {
                            const name = event.target.value
                            setSpeakersTouched(true)
                            setSpeakers(speakers.map((current, i) => (i === index ? name : current)))
                            setSpeakerGenders(speakerGenders.map((gender, i) => (i === index ? assignedSpeakerGender(inferSpeakerGender(name), index) : gender)))
                            setClip(null)
                          }}
                        />
                        <button
                          aria-label={t('speakerVoice')}
                          className="ls-voice-cycle"
                          title={t('speakerVoiceCycle')}
                          type="button"
                          onClick={() => {
                            setSpeakerGenders(speakerGenders.map((voice, i) => (i === index ? nextSpeakerVoice(voice, index) : voice)))
                            setClip(null)
                          }}
                        >
                          {t(VOICE_CHOICES.find((choice) => choice.value === selectedVoice)?.label || 'voiceMale')}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {clip ? (
                <div className="ls-player">
                  <div className="ls-player-meta">
                    <strong>{t('audioReady')}</strong>
                    <span>{t('clipLength', { n: ((clip.duration_ms || 0) / 1000).toFixed(1) })}</span>
                  </div>
                  <audio ref={audioRef} controls preload="metadata" src={clip.public_url} />
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
                  <div className="ls-replay-set">
                    <button className={replayLimit === null ? 'is-on' : ''} type="button" onClick={() => setReplayLimit(null)}>∞</button>
                    {[1, 2, 3].map((value) => (
                      <button key={value} className={replayLimit === value ? 'is-on' : ''} type="button" onClick={() => setReplayLimit(value)}>{value}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="ls-error">{error}</p>}
        </div>

        <footer className="ls-foot">
          {!clip && <p className="ls-dispatch-hint">{t('synthesizeBeforeDispatch')}</p>}
          <button className="ls-dispatch" disabled={!clip || Boolean(busy)} type="button" onClick={() => void dispatch('audio')}>{t('sendAudioOnly')}</button>
          <button className="ls-dispatch" disabled={!clip || Boolean(busy)} type="button" onClick={() => void dispatch('read_aloud')}>{t('sendReadAloud')}</button>
          <button className="ls-dispatch" disabled={!clip || Boolean(busy)} type="button" onClick={() => void dispatch('quiz')}>{t('sendListeningQuiz')}</button>
        </footer>
      </div>
    </div>
  )
}
