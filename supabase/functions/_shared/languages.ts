// The guidance languages the student page can render, as the server will
// accept them.
//
// Mirrors GUIDANCE_LOCALES in src/lib/participantI18n.ts — Edge Functions and
// the browser bundle share no module graph. The teaching side of the pair lives
// in _shared/teaching.ts, which carries more than a list of codes.
export const guidanceLanguages = new Set(['zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'vi'])

// Named for a model rather than for a locale switch: 寫作教練 explains a draft
// to the learner, and explaining happens in the language they understand best.
const guidanceNames: Record<string, string> = {
  'zh-TW': 'Traditional Chinese as written in Taiwan (臺灣繁體中文)',
  en: 'English',
  ja: 'Japanese (日本語)',
  ko: 'Korean (한국어)',
  es: 'Spanish (español)',
  fr: 'French (français)',
  de: 'German (Deutsch)',
  vi: 'Vietnamese (Tiếng Việt)',
}

export function guidanceLanguageName(code: string | null | undefined) {
  return guidanceNames[code || ''] || guidanceNames['zh-TW']
}
