import { useSyncExternalStore } from 'react'
import { APP_PROFILE } from './appProfiles'
import type { ScSystemLanguage } from './scTeachingMode'

const KEY = 'lingoact:sc:system-language'
export function scSystemLanguage(): ScSystemLanguage {
  const saved = localStorage.getItem(KEY)
  return saved === 'en' || saved === 'zh-TW' ? saved : 'zh-CN'
}
export function setScSystemLanguage(value: ScSystemLanguage) {
  localStorage.setItem(KEY, value)
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
export const isScProfile = APP_PROFILE.id === 'sc'
