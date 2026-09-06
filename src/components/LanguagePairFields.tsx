import { GUIDANCE_LOCALES } from '../lib/participantI18n'
import { TEACHING_LANGUAGES } from '../lib/teachingLanguages'

type Props = {
  teachingLanguage: string
  guidanceLanguage: string
  onTeachingChange: (code: string) => void
  onGuidanceChange: (code: string) => void
}

// The two axes a language class runs on. Shared by the new-session screen and
// the in-class settings so a teacher who picked wrong at the start changes it
// in the same words they chose it with.
//
// Chips rather than selects: this is set while a class is waiting, and on the
// presenter panel a native dropdown is a fiddly target.
export function LanguagePairFields({ teachingLanguage, guidanceLanguage, onTeachingChange, onGuidanceChange }: Props) {
  return (
    <div className="language-pair">
      <div className="language-pair-field">
        <span className="language-pair-label">主要教學語言</span>
        <p className="language-pair-hint">要教的語言。決定聽力語音的腔調、朗讀標音，以及出題採用的能力基準。</p>
        <div className="language-pair-options">
          {TEACHING_LANGUAGES.map((language) => (
            <button
              aria-pressed={teachingLanguage === language.code}
              className={teachingLanguage === language.code ? 'language-chip selected' : 'language-chip'}
              key={language.code}
              type="button"
              onClick={() => onTeachingChange(language.code)}
            >
              <strong>{language.label}</strong>
              <small>{language.note}</small>
            </button>
          ))}
        </div>
      </div>

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
