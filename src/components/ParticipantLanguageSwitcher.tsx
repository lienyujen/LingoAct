import { Check, Globe } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { brandFromSearch, guidanceLocalesForBrand } from '../lib/brand'
import { GUIDANCE_LOCALES, guidanceLocaleShort, participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'

type Props = {
  locale: ParticipantLocale
  onChange: (locale: ParticipantLocale) => void
}

export function ParticipantLanguageSwitcher({ locale, onChange }: Props) {
  const [open, setOpen] = useState(false)
  // Read from the link, not from the build: this page is one deployment shared
  // by every edition. See lib/brand.ts.
  const [searchParams] = useSearchParams()
  const options = guidanceLocalesForBrand(GUIDANCE_LOCALES, brandFromSearch(searchParams))

  // A device that has been in a Chinese class before arrives holding zh-TW,
  // and the class default can be a language this edition does not offer
  // either. Without this the page renders in a language whose entry is not in
  // the menu, so there is nothing to press to get out of it.
  useEffect(() => {
    if (!options.some((option) => option.code === locale)) onChange(options[0].code as ParticipantLocale)
  }, [locale, onChange, options])
  return (
    <div className="participant-language-switcher">
      {open && (
        <div className="participant-language-menu" role="menu">
          {options.map((option) => (
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
