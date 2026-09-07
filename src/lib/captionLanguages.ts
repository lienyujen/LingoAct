export const CAPTION_LANGUAGES = [
  { code: 'zh-tw', label: '繁體中文' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'de', label: 'Deutsch' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'th', label: 'ไทย' },
  { code: 'fr', label: 'Français' },
] as const

// The language the class is teaching, and so the one the teacher speaks and the
// one pronunciation is judged against. It was pinned to Chinese and English
// while this was a general classroom tool; a tool for language teachers has to
// let a Japanese or French class be the subject rather than the translation.
export const TEACHING_LANGUAGES = CAPTION_LANGUAGES.filter((language) => (
  ['zh-tw', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'vi'].includes(language.code)
))

/** @deprecated Use TEACHING_LANGUAGES — the speaker is not the point, the subject is. */
export const SPEAKER_LANGUAGES = TEACHING_LANGUAGES
// Not a language but a choice: show the transcript as spoken, without the
// Taiwanese vocabulary substitutions that turn 視頻 into 影片 — useful when the
// wording itself is the point of the lesson.
export const SOURCE_CAPTION_LANGUAGE = 'source'

export const CAPTION_DISPLAY_LANGUAGES = [
  ...CAPTION_LANGUAGES.filter((language) => ['zh-tw', 'en', 'es', 'ja', 'ko', 'vi', 'de', 'id', 'th', 'fr'].includes(language.code)),
  // The only entry here that is a description rather than a language name, so
  // it is the only one the teacher's own locale has anything to say about.
  { code: SOURCE_CAPTION_LANGUAGE, label: '原始語言（不改寫用詞）', labelKey: 'captionSourceLanguage' },
] as const

// Everything downstream works in real languages, so this resolves the choice
// back to one before the captions are looked up or translated.
export function resolvedCaptionLanguage(displayLanguage: string, sourceLanguage: string) {
  return displayLanguage === SOURCE_CAPTION_LANGUAGE ? sourceLanguage : displayLanguage
}
export const INTERPRETATION_LANGUAGES = CAPTION_LANGUAGES.filter((language) => ['zh-tw', 'en', 'ja', 'ko', 'vi', 'id', 'th', 'es', 'de', 'fr'].includes(language.code))
export const DEFAULT_CAPTION_LANGUAGE = 'zh-tw'

// The student page uses BCP-47 casing ('zh-TW') and the caption pipeline stores
// lowercase. Converting at the boundary is cheaper than renaming either one,
// which would mean migrating every session row already written.
export function captionCodeForLocale(locale: string) {
  return locale.toLowerCase()
}

export function localeForCaptionCode(code: string) {
  return code === 'zh-tw' ? 'zh-TW' : code
}

// Whatever the class is being explained in is the interpretation nobody should
// have to ask for. Falling back to English only matters when the guidance
// language is itself the language being taught.
export function defaultInterpretationLanguages(sourceLanguage: string, guidanceLanguage?: string | null) {
  const guidance = guidanceLanguage ? captionCodeForLocale(guidanceLanguage) : ''
  if (guidance && guidance !== sourceLanguage) return [guidance]
  return sourceLanguage === 'en' ? ['zh-tw'] : ['en']
}

export function captionLanguageLabel(code: string) {
  return CAPTION_LANGUAGES.find((language) => language.code === code)?.label || code
}
