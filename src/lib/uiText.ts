import { useSyncExternalStore } from 'react'
import { uiLocales } from './uiLocales.generated'
import { englishTeachingLabels } from './englishUi'
import { APP_PROFILE } from './appProfiles'
import { japaneseLiterals } from './japaneseLocales'
import { scSystemLanguage, supportsChineseSystemLanguage } from './scSystemLanguage'

let language: string = APP_PROFILE.id === 'japanese' ? 'ja' : supportsChineseSystemLanguage ? scSystemLanguage() : APP_PROFILE.defaultTrack === 'en' ? 'en' : 'zh-TW'
const listeners = new Set<() => void>()
export function setUiLanguage(value: string) {
  if (APP_PROFILE.id === 'ncacls' && !window.location.hash.includes('/participant/')) value = 'zh-TW'
  if (language === value) return
  language = value
  for (const listener of listeners) listener()
}
export function useUiLanguage() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener) }, () => language)
}
// Only literal UI labels and status/error messages are translated. Teaching
// content retains the standard selected for the class.
export function uiText(text: string) {
  return language === 'ja' ? japaneseLiterals[text] || text
    : language === 'en' ? englishTeachingLabels[text] || uiLocales[text]?.en || text
    : language === 'zh-CN' ? uiLocales[text]?.['zh-CN'] || text : text
}
export function uiFormat(template: string, values: unknown[]) {
  return uiText(template).replace(/\{(\d+)\}/g, (whole, index: string) => Number(index) < values.length ? String(values[Number(index)] ?? '') : whole)
}
