import { usePresenterLocale } from '../lib/presenterI18n'

export function OriginalPromptOption({ checked, error, onChange }: { checked: boolean; error?: string; onChange: (value: boolean) => void }) {
  const locale = usePresenterLocale()
  if (!checked && !error?.includes('Could not adapt the question to the class level.')) return null
  const label = locale === 'zh-TW' ? '依原文派送題目'
    : locale === 'zh-CN' ? '按原文发送题目'
      : locale === 'ja' ? '問題文をそのまま配信' : 'Send the question as written'
  return <label className="interaction-check">
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    {label}
  </label>
}
