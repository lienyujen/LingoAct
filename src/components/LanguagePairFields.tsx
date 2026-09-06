import { GUIDANCE_LOCALES } from '../lib/participantI18n'
import { TEACHING_TRACKS, resolveFramework, resolveTrack } from '../lib/teachingTracks'
import { frameworkById } from '../lib/proficiency'

type Props = {
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
  const track = resolveTrack(teachingTrack)
  const activeId = resolveFramework(teachingTrack, levelFramework)
  const framework = frameworkById(activeId)
  const choices = track.frameworks.map((id) => frameworkById(id)).filter(Boolean)

  return (
    <div className="language-pair">
      <div className="language-pair-field">
        <span className="language-pair-label">主要教學語言</span>
        <p className="language-pair-hint">
          決定整堂課的方向：出題語言與難度、聽力語音的腔調，以及朗讀標音。
        </p>
        <div className="language-pair-options">
          {TEACHING_TRACKS.map((option) => (
            <button
              aria-pressed={teachingTrack === option.id}
              className={teachingTrack === option.id ? 'language-chip selected' : 'language-chip'}
              key={option.id}
              type="button"
              onClick={() => onTrackChange(option.id)}
            >
              <strong>{option.label}</strong>
              <small>{option.note}</small>
            </button>
          ))}
        </div>
      </div>

      {choices.length > 1 && (
        <div className="language-pair-field">
          <span className="language-pair-label">能力基準</span>
          <p className="language-pair-hint">這個班在準備的目標。同樣是英語，照課綱教和準備全民英檢、多益，出題的方向並不一樣。</p>
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
                <small>{option!.name}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {framework && (
        <div className="language-pair-field">
          <span className="language-pair-label">
            程度
            {choices.length > 1 ? <em>{framework.name}</em> : <em>依教學語言採用{framework.name}</em>}
          </span>
          <p className="language-pair-hint">出題會照這個程度控制用詞與句長，也決定題目可以照抄多少原文。</p>
          <div className="language-pair-options">
            <button
              aria-pressed={!levelCode}
              className={!levelCode ? 'language-chip selected' : 'language-chip'}
              type="button"
              onClick={() => onLevelChange('')}
            >
              <strong>未指定</strong>
            </button>
            {framework.levels.map((level) => (
              <button
                aria-pressed={levelCode === level.code}
                className={levelCode === level.code ? 'language-chip selected' : 'language-chip'}
                key={level.code}
                type="button"
                onClick={() => onLevelChange(level.code)}
              >
                <strong>{level.label}</strong>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Only where it is a real question. 國語文 is always 注音, and a German
          class has nothing to annotate. */}
      {track.annotationChoice && (
        <div className="language-pair-field">
          <span className="language-pair-label">朗讀標音</span>
          <p className="language-pair-hint">派朗讀練習時標在字上。初學繁體多半用注音，從簡體或羅馬拼音教材來的班級用拼音。</p>
          <div className="language-pair-options">
            {[
              { code: 'zhuyin', label: '注音' },
              { code: 'pinyin', label: '拼音' },
              { code: 'none', label: '不標音' },
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

      <div className="language-pair-field">
        <span className="language-pair-label">主要導引語</span>
        <p className="language-pair-hint">用來說明的語言。學生加入時的介面預設就是這個，學生仍可自己切換。</p>
        <div className="language-pair-options">
          {GUIDANCE_LOCALES.map((locale) => (
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
      </div>
    </div>
  )
}
