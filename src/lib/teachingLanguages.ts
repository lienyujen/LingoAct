import { GUIDANCE_LOCALES } from './participantI18n'

// The languages LingoAct is used to teach, in the order a Taiwanese staffroom
// would list them: Chinese first because that is what this was built for,
// English next because that is the largest group of teachers, then the rest.
//
// Kept apart from GUIDANCE_LOCALES on purpose. The two axes are independent: a
// beginners' Japanese class in Taiwan teaches ja and is explained in zh-TW, and
// neither implies the other. The codes match what proficiency.ts keys its
// frameworks on and what the listening voices are chosen by.
export const TEACHING_LANGUAGES = [
  { code: 'zh-tw', label: '華語', note: '繁體・台灣腔' },
  { code: 'en', label: '英語', note: 'English' },
  { code: 'ja', label: '日語', note: '日本語' },
  { code: 'ko', label: '韓語', note: '한국어' },
  { code: 'fr', label: '法語', note: 'Français' },
  { code: 'es', label: '西班牙語', note: 'Español' },
  { code: 'de', label: '德語', note: 'Deutsch' },
  { code: 'vi', label: '越南語', note: 'Tiếng Việt' },
] as const

export type TeachingLanguage = (typeof TEACHING_LANGUAGES)[number]['code']

export function isTeachingLanguage(value: unknown): value is TeachingLanguage {
  return typeof value === 'string' && TEACHING_LANGUAGES.some((language) => language.code === value)
}

export function teachingLanguageLabel(code: string) {
  return TEACHING_LANGUAGES.find((language) => language.code === code)?.label || code
}

export const guidanceLanguages = GUIDANCE_LOCALES
