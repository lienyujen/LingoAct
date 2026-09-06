import { Check, Globe } from '@phosphor-icons/react'
import { useState } from 'react'
import { GUIDANCE_LOCALES, guidanceLocaleShort, participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'

type Props = {
  locale: ParticipantLocale
  onChange: (locale: ParticipantLocale) => void
}

export function ParticipantLanguageSwitcher({ locale, onChange }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="participant-language-switcher">
      {open && (
        <div className="participant-language-menu" role="menu">
          {GUIDANCE_LOCALES.map((option) => (
            <button key={option.code} role="menuitemradio" aria-checked={locale === option.code} type="button" onClick={() => { onChange(option.code); setOpen(false) }}>
              {/* Named in its own language: someone hunting for their own is not
                  reading the page they are trying to get away from. */}
              <span lang={option.code}>{option.label}</span>
              {locale === option.code && <Check size={16} />}
            </button>
          ))}
        </div>
      )}
      <button
        aria-expanded={open}
        aria-label={participantText(locale, 'language')}
        className="participant-language-button"
        title={participantText(locale, 'language')}
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <Globe size={22} /><span>{guidanceLocaleShort(locale)}</span>
      </button>
    </div>
  )
}
