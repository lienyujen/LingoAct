import { GUIDANCE_LOCALES } from '../lib/participantI18n'
import { TEACHING_TRACKS, resolveTrack } from '../lib/teachingTracks'
import { frameworkById } from '../lib/proficiency'

type Props = {
  teachingTrack: string
  guidanceLanguage: string
  levelCode: string
  readingAnnotation: string
  onTrackChange: (id: string) => void
  onGuidanceChange: (code: string) => void
  onLevelChange: (code: string) => void
  onAnnotationChange: (annotation: string) => void
}

// What the class is, settled before it starts.
//
// The track is the decision everything else follows from: it fixes the ladder,
// the annotation and the language the AI writes in, so the ladder is shown here
// as a consequence rather than offered as a second question. Asking "which
// framework?" beside every audio clip was the mistake this replaces — a 華語文
// teacher is never going to pick JLPT, and a level chosen per clip is not the
// class's level.
export function LanguagePairFields({
  teachingTrack,
  guidanceLanguage,
  levelCode,
  readingAnnotation,
  onTrackChange,
  onGuidanceChange,
  onLevelChange,
  onAnnotationChange,
}: Props) {
  const track = resolveTrack(teachingTrack)
  const framework = frameworkById(track.framework)

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

      {framework && (
        <div className="language-pair-field">
          <span className="language-pair-label">程度<em>依教學語言採用{framework.name}</em></span>
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

      {/* Only where it is a real question. 國語 is always 注音, and a German
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
