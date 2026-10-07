import { useSyncExternalStore } from 'react'
import { APP_PROFILE } from './appProfiles'
import type { ScSystemLanguage } from './scTeachingMode'

const KEY = `lingoact:${APP_PROFILE.id}:system-language`
export function scSystemLanguage(): ScSystemLanguage {
  if (APP_PROFILE.id === 'sc') return 'zh-CN'
  const saved = localStorage.getItem(KEY)
  return saved === 'en' || saved === 'zh-TW' || saved === 'zh-CN' ? saved : 'zh-TW'
}
export function setScSystemLanguage(value: ScSystemLanguage) {
  localStorage.setItem(KEY, APP_PROFILE.id === 'sc' ? 'zh-CN' : value)
  window.dispatchEvent(new Event('lingoact-system-language'))
}
function subscribe(changed: () => void) {
  window.addEventListener('lingoact-system-language', changed)
  window.addEventListener('storage', changed)
  return () => {
    window.removeEventListener('lingoact-system-language', changed)
    window.removeEventListener('storage', changed)
  }
}
export function useScSystemLanguage() { return useSyncExternalStore(subscribe, scSystemLanguage) }
export const supportsChineseSystemLanguage = APP_PROFILE.id === 'sc' || APP_PROFILE.id === 'huayu'
