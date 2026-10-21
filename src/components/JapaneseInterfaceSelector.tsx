import { APP_PROFILE } from '../lib/appProfiles'
import { setJapaneseInterfaceLanguage, useJapaneseInterfaceLanguage } from '../lib/japaneseInterface'

export function JapaneseInterfaceSelector() {
  const language = useJapaneseInterfaceLanguage()
  if (APP_PROFILE.id !== 'japanese') return null
  return <label className="japanese-interface-selector">
    <span>{language === 'ja' ? '表示言語' : '介面語言'}</span>
    <select aria-label={language === 'ja' ? '表示言語' : '介面語言'} value={language}
      onChange={event => setJapaneseInterfaceLanguage(event.target.value === 'zh-TW' ? 'zh-TW' : 'ja')}>
      <option value="ja">日本語</option><option value="zh-TW">中文</option>
    </select>
  </label>
}
