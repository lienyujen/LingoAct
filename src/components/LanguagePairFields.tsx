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
import { SCHOOL_STAGES, SCHOOL_GRADES, schoolStage as stageOf, schoolDifficulty as difficultyOf, schoolLevelCode } from '../lib/schoolLevels'

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
  const schoolStage = activeId === 'en108' ? stageOf(levelCode) : levelCode
  const schoolDifficulty = difficultyOf(levelCode)
  const schoolGrade = levelCode.split('-')[0]
  const levels = activeId === 'en108' ? SCHOOL_STAGES : framework?.levels || []

  const levelButtons = (values: readonly { code: string; label: string }[]) => (
    values.map((level) => (
              <span key={level.code}>
              <button
                aria-pressed={schoolStage === level.code}
                className={schoolStage === level.code ? 'language-chip selected' : 'language-chip'}
                key={level.code}
                type="button"
                onClick={() => onLevelChange(activeId === 'en108' ? schoolStage === level.code ? levelCode : SCHOOL_GRADES[level.code]?.[0].code || level.code : level.code)}
              >
                <strong>{activeId === 'toeic' ? uiText(level.label).split(/\s*[／/]\s*/).map((line, index) => <span key={index}>{line}</span>) : uiText(level.label)}</strong>
              </button>
              </span>
            ))
  )

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
                <strong>{uiText(option!.short)}</strong>
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
          <div className={activeId === 'toeic' ? 'toeic-level-groups' : 'language-pair-options'}>
            {activeId !== 'hsk' && track.id !== 'en' && track.id !== 'ja' && <button
              aria-pressed={!levelCode}
              className={!levelCode ? 'language-chip selected' : 'language-chip'}
              type="button"
              onClick={() => onLevelChange('')}
            >
              <strong>{t('levelUnset')}</strong>
            </button>}
            {activeId === 'toeic' ? ['lr', 'sw'].map((section) => (
              <section className="toeic-level-group" key={section}>
                <h4>{t(section === 'sw' ? 'toeicSpeakingWriting' : 'toeicListeningReading')}</h4>
                <div className="toeic-level-grid">{levelButtons(levels.filter(level => level.code.startsWith('sw-') === (section === 'sw')))}</div>
              </section>
            )) : levelButtons(levels)}
          </div>
          {activeId === 'en108' && SCHOOL_GRADES[schoolStage] && <div className="school-grade-field">
            <span className="language-pair-label">{uiText('年級')}</span>
            <div className="language-pair-options">
              {SCHOOL_GRADES[schoolStage].map(grade => <button type="button" key={grade.code}
                aria-pressed={schoolGrade === grade.code} className={schoolGrade === grade.code ? 'language-chip selected' : 'language-chip'}
                onClick={() => onLevelChange(schoolLevelCode(grade.code, schoolDifficulty))}>
                <strong>{uiText(grade.label)}</strong>
              </button>)}
            </div>
          </div>}
          {activeId === 'en108' && schoolStage && <div className="school-grade-field">
            <span className="language-pair-label">{uiText('難度')}</span>
            <div className="language-pair-options">
            {(['foundation','standard','advanced'] as const).map((difficulty) => <button type="button" key={difficulty}
              aria-pressed={schoolDifficulty === difficulty} className={schoolDifficulty === difficulty ? 'language-chip selected' : 'language-chip'}
              onClick={() => onLevelChange(schoolLevelCode(schoolGrade, difficulty))}>
              {uiText({foundation:'基礎',standard:'一般',advanced:'進階'}[difficulty])}
            </button>)}
            </div>
          </div>}
        </div>
      )}

      {/* Only where it is a real question. 國語文 is always 注音, and a German
          class has nothing to annotate. */}
      {track.annotationChoice && (
        <div className="language-pair-field">
          <span className="language-pair-label">{t('readingAnnotationLabel')}</span>
          <p className="language-pair-hint">{t('readingAnnotationHint')}</p>
          <div className="language-pair-options">
            {(track.id === 'ja' ? [
              { code: 'furigana', label: t('annotationFurigana') },
              { code: 'none', label: t('annotationNone') },
            ] : [
              { code: 'zhuyin', label: t('annotationZhuyin') },
              { code: 'pinyin', label: t('annotationPinyin') },
              { code: 'none', label: t('annotationNone') },
            ]).map((option) => (
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

      {!supportsChineseSystemLanguage && APP_PROFILE.id !== 'ncacls' && <div className="language-pair-field">
        <span className="language-pair-label">{t('mainGuidanceLanguage')}</span>
        <p className="language-pair-hint">{t('mainGuidanceHint')}</p>
        <div className="language-pair-options">
          {guidanceLocalesForBrand(GUIDANCE_LOCALES, buildBrand).filter((locale) => track.id !== 'en' || ['zh-TW','en'].includes(locale.code)).map((locale) => (
            <button
              aria-pressed={guidanceLanguage === locale.code}
              className={guidanceLanguage === locale.code ? 'language-chip selected' : 'language-chip'}
              key={locale.code}
              type="button"
              onClick={() => onGuidanceChange(locale.code)}
            >
              <strong>{APP_PROFILE.id === 'japanese' && locale.code === 'zh-TW' ? '中文' : uiText(locale.label)}</strong>
            </button>
          ))}
        </div>
      </div>}
    </div>
  )
}
