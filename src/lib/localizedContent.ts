import { contentLocaleKey } from './participantI18n'
import type { ParticipantLocale } from './participantI18n'

// AI payloads carry their translations in a map keyed by content locale, with the
// original text alongside. Going through these helpers means a language the model
// was never asked to produce falls back to the original rather than rendering
// blank — which is what reading .en directly did for every language but English.
export function localizedFields<T>(translations: Record<string, T> | null | undefined, locale: ParticipantLocale) {
  return translations?.[contentLocaleKey(locale)]
}

export function localizedFeedback(feedback: Record<string, string> | null | undefined, locale: ParticipantLocale) {
  if (!feedback) return ''
  return feedback[contentLocaleKey(locale)] || feedback.zh_tw || feedback.en || ''
}

// Typography rather than translation: Chinese and Japanese separate list items
// with the ideographic comma, where a Latin comma reads as a foreign mark.
const listSeparators: Record<string, string> = { 'zh-TW': '、', ja: '、' }

export function listSeparator(locale: ParticipantLocale) {
  return listSeparators[locale] ?? ', '
}
