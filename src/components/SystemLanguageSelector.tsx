import { uiText } from '../lib/uiText'
import { supportsChineseSystemLanguage, setScSystemLanguage, useScSystemLanguage } from '../lib/scSystemLanguage'

export function SystemLanguageSelector() {
  const language = useScSystemLanguage()
  if (!supportsChineseSystemLanguage) return null
  return <div className="language-pair-field">
    <span className="language-pair-label">{language === 'zh-TW' || language === 'en' ? uiText("系統語言") : uiText("系统语言")}</span>
    <div className="language-pair-options">
      {(['zh-CN', 'zh-TW', 'en'] as const).map((code) => <button type="button" key={code}
        aria-pressed={language === code} className={language === code ? 'language-chip selected' : 'language-chip'}
        onClick={() => setScSystemLanguage(code)}>{code === 'zh-CN' ? uiText("简体中文") : code === 'zh-TW' ? uiText("繁體中文") : 'English'}</button>)}
    </div>
  </div>
}
