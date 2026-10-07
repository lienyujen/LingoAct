import { buildBrand, guidanceLocalesForBrand } from '../lib/brand'
import { GUIDANCE_LOCALES } from '../lib/participantI18n'
import { APP_PROFILE } from '../lib/appProfiles'
import { TEACHING_TRACKS, resolveFramework, resolveTrack } from '../lib/teachingTracks'
import { frameworkById } from '../lib/proficiency'
import { usePresenterText } from '../lib/presenterI18n'
import { supportsChineseSystemLanguage, useScSystemLanguage } from '../lib/scSystemLanguage'
import { scFrameworkChoices } from '../lib/scTeachingMode'
import type { ScSystemLanguage } from '../lib/scTeachingMode'
import { uiText } from '../lib/uiText'

type Props = {
  systemLanguage?: ScSystemLanguage | null
  teachingTrack: string
  guidanceLanguage: string
  levelFramework: string
  levelCode: string
  readingAnnotation: string
  onTrackChange: (id: string) => void
  onGuidanceChange: (code: string) => void
  onFrameworkChange: (id: string) => void
  onLevelChange: (code: string) => void
  onAnnotationChange: (annotation: string) => void
}

// What the class is, settled before it starts.
//
// The track is the decision everything else follows from: it fixes which
// ladders are even on offer, the annotation, and the language the AI writes in.
// Where a track has one ladder it is shown as a consequence rather than asked
// as a second question; where it genuinely has several — English, where a class
// may be working to the 課綱, or towards 全民英檢, or towards 多益 — those three
// are offered and nothing else. Being shown every framework in the world beside
// every audio clip was the mistake this replaces.
export function LanguagePairFields({
  systemLanguage: suppliedLanguage,
  teachingTrack,
  guidanceLanguage,
  levelFramework,
  levelCode,
  readingAnnotation,
  onTrackChange,
  onGuidanceChange,
  onFrameworkChange,
  onLevelChange,
  onAnnotationChange,
}: Props) {
  const t = usePresenterText()
  const savedLanguage = useScSystemLanguage()
  const systemLanguage = suppliedLanguage || savedLanguage
  const track = resolveTrack(teachingTrack)
  const activeId = resolveFramework(teachingTrack, levelFramework)
  const framework = frameworkById(activeId)
  const choices = (supportsChineseSystemLanguage ? scFrameworkChoices(systemLanguage) : track.frameworks).map((id) => frameworkById(id)).filter(Boolean)
  const availableTracks = TEACHING_TRACKS.filter((option) => APP_PROFILE.allowedTracks.includes(option.id))

  return (
    <div className="language-pair">
      {!supportsChineseSystemLanguage && availableTracks.length > 1 && <div className="language-pair-field">
        <span className="language-pair-label">{t('mainTeachingLanguage')}</span>
        <p className="language-pair-hint">{t('mainTeachingHint')}</p>
        <div className="language-pair-options">
          {availableTracks.map((option) => (
            <button
              aria-pressed={teachingTrack === option.id}
              className={teachingTrack === option.id ? 'language-chip selected' : 'language-chip'}
              key={option.id}
              type="button"
              onClick={() => onTrackChange(option.id)}
            >
              <strong>{uiText(option.label)}</strong>
              <small>{uiText(option.note)}</small>
            </button>
          ))}
        </div>
      </div>}

      {choices.length > 1 && (
        <div className="language-pair-field">
          <span className="language-pair-label">{t('proficiencyFramework')}</span>
          <div className="language-pair-options">
            {choices.map((option) => (
              <button
                aria-pressed={activeId === option!.id}
                className={activeId === option!.id ? 'language-chip selected' : 'language-chip'}
                key={option!.id}
                type="button"
                onClick={() => onFrameworkChange(option!.id)}
              >
                <strong>{option!.short}</strong>
                <small>{uiText(option!.name)}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {framework && (
        <div className="language-pair-field">
          <span className="language-pair-label">
            {t('levelLabel')}
            {choices.length > 1 ? <em>{uiText(framework.name)}</em> : <em>{t('levelFromTrack', { name: uiText(framework.name) })}</em>}
          </span>
          <div className="language-pair-options">
            {activeId !== 'hsk' && <button
              aria-pressed={!levelCode}
              className={!levelCode ? 'language-chip selected' : 'language-chip'}
              type="button"
              onClick={() => onLevelChange('')}
            >
              <strong>{t('levelUnset')}</strong>
            </button>}
            {framework.levels.map((level) => (
              <button
                aria-pressed={levelCode === level.code}
                className={levelCode === level.code ? 'language-chip selected' : 'language-chip'}
                key={level.code}
                type="button"
                onClick={() => onLevelChange(level.code)}
              >
                <strong>{uiText(level.label)}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Only where it is a real question. 國語文 is always 注音, and a German
          class has nothing to annotate. */}
      {track.annotationChoice && (
        <div className="language-pair-field">
          <span className="language-pair-label">{t('readingAnnotationLabel')}</span>
          <p className="language-pair-hint">{t('readingAnnotationHint')}</p>
          <div className="language-pair-options">
            {[
              { code: 'zhuyin', label: t('annotationZhuyin') },
              { code: 'pinyin', label: t('annotationPinyin') },
              { code: 'none', label: t('annotationNone') },
            ].map((option) => (
              <button
                aria-pressed={readingAnnotation === option.code}
                className={readingAnnotation === option.code ? 'language-chip selected' : 'language-chip'}
                key={option.code}
                type="button"
                onClick={() => onAnnotationChange(option.code)}
              >
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {!supportsChineseSystemLanguage && <div className="language-pair-field">
        <span className="language-pair-label">{t('mainGuidanceLanguage')}</span>
        <p className="language-pair-hint">{t('mainGuidanceHint')}</p>
        <div className="language-pair-options">
          {guidanceLocalesForBrand(GUIDANCE_LOCALES, buildBrand).map((locale) => (
            <button
              aria-pressed={guidanceLanguage === locale.code}
              className={guidanceLanguage === locale.code ? 'language-chip selected' : 'language-chip'}
              key={locale.code}
              type="button"
              onClick={() => onGuidanceChange(locale.code)}
            >
              <strong>{locale.label}</strong>
            </button>
          ))}
        </div>
      </div>}
    </div>
  )
}
