import { ArrowsClockwise, Gear, Microphone, Translate, X } from '@phosphor-icons/react'
import { LanguagePairFields } from './LanguagePairFields'
import { resolveFramework, resolveTrack } from '../lib/teachingTracks'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { CAPTION_DISPLAY_LANGUAGES, INTERPRETATION_LANGUAGES, SPEAKER_LANGUAGES, defaultInterpretationLanguages } from '../lib/captionLanguages'
import type { Session } from '../types'
import { usePresenterText } from '../lib/presenterI18n'

export type PresenterCaptionSettings = {
  sourceLanguage: string
  displayLanguage: string
  fontSize: number
  fontBold: boolean
  position: 'top' | 'center' | 'bottom'
  interpretationAudioEnabled: boolean
  interpretationLanguages: string[]
}

type Props = {
  busy: boolean
  error: string
  microphones: MediaDeviceInfo[]
  open: boolean
  selectedMicrophoneId: string
  session: Session
  onClose: () => void
  onRefreshMicrophones: () => void
  onSave: (
    settings: PresenterCaptionSettings,
    microphoneId: string,
    teaching: {
      teachingLanguage: string
      guidanceLanguage: string
      levelFramework: string
      levelCode: string
      readingAnnotation: string
    },
  ) => void
}

const captionFontSizes = [28, 30, 32, 36, 42]

export function PresenterSettingsModal({
  busy,
  error,
  microphones,
  open,
  selectedMicrophoneId,
  session,
  onClose,
  onRefreshMicrophones,
  onSave,
}: Props) {
  const t = usePresenterText()
  const [sourceLanguage, setSourceLanguage] = useState(session.caption_source_language)
  const [displayLanguage, setDisplayLanguage] = useState(session.caption_display_language)
  const [fontSize, setFontSize] = useState(session.caption_font_size ?? 32)
  const [fontBold, setFontBold] = useState(session.caption_font_bold ?? false)
  const [position, setPosition] = useState(session.caption_position ?? 'bottom')
  const [interpretationAudioEnabled, setInterpretationAudioEnabled] = useState(session.interpretation_audio_enabled)
  const [interpretationLanguages, setInterpretationLanguages] = useState(session.interpretation_languages)
  const [teachingTrack, setTeachingTrack] = useState(resolveTrack(session.teaching_language).id)
  const [guidanceLanguage, setGuidanceLanguage] = useState(session.guidance_language || 'zh-TW')
  const [levelFramework, setLevelFramework] = useState(
    () => resolveFramework(session.teaching_language, session.level_framework) as string,
  )
  const [levelCode, setLevelCode] = useState(session.level_code || '')
  const [readingAnnotation, setReadingAnnotation] = useState(
    session.reading_annotation || resolveTrack(session.teaching_language).annotation,
  )
  const [microphoneId, setMicrophoneId] = useState(selectedMicrophoneId)
  const [microphoneLevel, setMicrophoneLevel] = useState(0)
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    if (!open) return
    setSourceLanguage(session.caption_source_language)
    setDisplayLanguage(session.caption_display_language)
    setFontSize(session.caption_font_size ?? 32)
    setFontBold(session.caption_font_bold ?? false)
    setPosition(session.caption_position ?? 'bottom')
    setInterpretationAudioEnabled(session.interpretation_audio_enabled)
    setInterpretationLanguages(session.interpretation_languages)
    setMicrophoneId(selectedMicrophoneId)
  }, [open, selectedMicrophoneId, session])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let animationFrame = 0
    let audioContext: AudioContext | null = null
    let stream: MediaStream | null = null

    void navigator.mediaDevices.getUserMedia({
      audio: {
        ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    }).then((nextStream) => {
      if (cancelled) {
        nextStream.getTracks().forEach((track) => track.stop())
        return
      }
      stream = nextStream
      setPreviewError('')
      audioContext = new AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 512
      audioContext.createMediaStreamSource(nextStream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      const updateLevel = () => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const sample of samples) {
          const centered = (sample - 128) / 128
          sum += centered * centered
        }
        const rms = Math.sqrt(sum / samples.length)
        setMicrophoneLevel(Math.min(100, Math.round(rms * 420)))
        animationFrame = requestAnimationFrame(updateLevel)
      }
      updateLevel()
    }).catch((reason: unknown) => {
      setMicrophoneLevel(0)
      setPreviewError(reason instanceof Error ? reason.message : t('micReadFailed'))
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrame)
      stream?.getTracks().forEach((track) => track.stop())
      void audioContext?.close()
    }
  }, [microphoneId, open, t])

  const availableInterpretationLanguages = useMemo(
    () => INTERPRETATION_LANGUAGES.filter((language) => language.code !== sourceLanguage),
    [sourceLanguage],
  )

  if (!open) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    onSave(
      { sourceLanguage, displayLanguage, fontSize, fontBold, position, interpretationAudioEnabled, interpretationLanguages },
      microphoneId,
      { teachingLanguage: teachingTrack, guidanceLanguage, levelFramework, levelCode, readingAnnotation },
    )
  }

  return (
    <div className="modal-backdrop presenter-settings-backdrop" role="presentation">
      <form className="modal presenter-settings-modal" onSubmit={submit}>
        <div className="modal-heading">
          <div>
            <h2><Gear size={20} />{t('teacherSettings')}</h2>
            <p className="muted">{t('settingsSub')}</p>
          </div>
          <button className="ghost-button icon-button" aria-label={t('closeSettings')} title={t('close')} type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <section className="presenter-settings-section">
          <div className="presenter-settings-section-heading"><span><Translate size={17} />{t('courseLanguages')}</span></div>
          <LanguagePairFields
            guidanceLanguage={guidanceLanguage}
            levelCode={levelCode}
            levelFramework={levelFramework}
            readingAnnotation={readingAnnotation}
            teachingTrack={teachingTrack}
            onAnnotationChange={setReadingAnnotation}
            onFrameworkChange={(id) => {
              setLevelFramework(id)
              setLevelCode('')
            }}
            onGuidanceChange={setGuidanceLanguage}
            onLevelChange={setLevelCode}
            onTrackChange={(id) => {
              setTeachingTrack(id)
              setLevelFramework(resolveTrack(id).frameworks[0])
              setLevelCode('')
              setReadingAnnotation(resolveTrack(id).annotation)
            }}
          />
        </section>

        <section className="presenter-settings-section">
          <div className="presenter-settings-section-heading">
            <span><Microphone size={17} />{t('microphone')}</span>
            <button className="ghost-button settings-refresh-button" type="button" onClick={onRefreshMicrophones} disabled={busy}>
              <ArrowsClockwise size={15} />{t('rescan')}
            </button>
          </div>
          <label>
            {t('recordingSource')}
            <select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}>
              <option value="">{t('systemDefaultMic')}</option>
              {microphones
                .filter((device) => device.deviceId !== 'default')
                .map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>{device.label || t('micN', { n: index + 1 })}</option>
                ))}
            </select>
          </label>
          <div className="microphone-meter-row">
            <span>{t('inputLevel')}</span>
            <div className="microphone-meter" role="meter" aria-label={t('micInputLevel')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={microphoneLevel}>
              <span style={{ width: `${microphoneLevel}%` }} />
            </div>
          </div>
          {previewError && <p className="error compact-error">{t('micTestFailed', { message: previewError })}</p>}
        </section>

        <section className="presenter-settings-section">
          <div className="presenter-settings-section-heading"><span><Translate size={17} />{t('captionSection')}</span></div>
          <p className="muted">{t('captionSectionHint')}</p>
          <div className="caption-language-row">
            <label>
              {t('speakerLanguage')}
              <select value={sourceLanguage} onChange={(event) => {
                const next = event.target.value
                if (displayLanguage === sourceLanguage) setDisplayLanguage(next)
                setSourceLanguage(next)
                setInterpretationLanguages(defaultInterpretationLanguages(next))
              }}>
                {SPEAKER_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.code === 'zh-tw' ? t('clearMandarin') : language.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('captionLanguage')}
              <select value={displayLanguage} onChange={(event) => setDisplayLanguage(event.target.value)}>
                {CAPTION_DISPLAY_LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {'labelKey' in language ? t(language.labelKey) : language.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('captionSize')}
              <select value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))}>
                {[...new Set([...captionFontSizes, fontSize])].sort((a, b) => a - b)
                  .map((size) => <option key={size} value={size}>{size} px</option>)}
              </select>
            </label>
            <label>
              {t('captionPosition')}
              <select value={position} onChange={(event) => setPosition(event.target.value as PresenterCaptionSettings['position'])}>
                <option value="top">{t('posTop')}</option>
                <option value="bottom">{t('posBottom')}</option>
                <option value="center">{t('posCenter')}</option>
              </select>
            </label>
          </div>
          <label className="caption-interpretation-toggle">
            <input checked={fontBold} type="checkbox" onChange={(event) => setFontBold(event.target.checked)} />
            <span>{t('captionBold')}</span>
          </label>
          <label className="caption-interpretation-toggle interpretation-audio-toggle">
            <input checked={interpretationAudioEnabled} type="checkbox" onChange={(event) => {
              const enabled = event.target.checked
              if (enabled && !interpretationLanguages.length) setInterpretationLanguages(defaultInterpretationLanguages(sourceLanguage))
              setInterpretationAudioEnabled(enabled)
            }} />
            <span>{t('sendInterpretation')}</span>
          </label>
          {interpretationAudioEnabled && (
            <div className="caption-language-options" aria-label={t('interpretationLanguagesLabel')}>
              {availableInterpretationLanguages.map((language) => {
                const checked = interpretationLanguages.includes(language.code)
                return (
                  <label key={language.code}>
                    <input
                      checked={checked}
                      type="checkbox"
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...new Set([...interpretationLanguages, language.code])]
                          : interpretationLanguages.filter((code) => code !== language.code)
                        setInterpretationLanguages(next)
                      }}
                    />
                    <span>{language.label}{language.code === 'en' && sourceLanguage !== 'en' ? t('defaultSuffix') : ''}</span>
                  </label>
                )
              })}
            </div>
          )}
          <p className="muted caption-cost-note">{t('captionCostNote')}</p>
        </section>

        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onClose}>{t('cancel')}</button>
          <button disabled={busy || (interpretationAudioEnabled && !interpretationLanguages.length)} type="submit">
            <Gear size={17} />{busy ? t('saving') : t('saveSettings')}
          </button>
        </div>
      </form>
    </div>
  )
}
