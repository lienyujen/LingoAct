import { useSyncExternalStore } from 'react'
import { setUiLanguage } from './uiText'

const KEY = 'lingoact:japanese:interface-language'
const EVENT = 'lingoact:japanese:interface-changed'
export function japaneseInterfaceLanguage(): 'ja' | 'zh-TW' {
  try { return localStorage.getItem(KEY) === 'zh-TW' ? 'zh-TW' : 'ja' } catch { return 'ja' }
}
export function setJapaneseInterfaceLanguage(value: 'ja' | 'zh-TW') {
  try { localStorage.setItem(KEY, value) } catch { /* This window can still switch when storage is unavailable. */ }
  setUiLanguage(value)
  window.dispatchEvent(new Event(EVENT))
}
export function useJapaneseInterfaceLanguage() {
  return useSyncExternalStore(listener => {
    window.addEventListener(EVENT, listener)
    window.addEventListener('storage', listener)
    return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener) }
  }, japaneseInterfaceLanguage, japaneseInterfaceLanguage)
}
