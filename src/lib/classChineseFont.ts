import { useEffect } from 'react'

export function classChineseFont(session: { system_language?: string | null; teaching_language?: string | null; level_framework?: string | null } | null) {
  if (session?.system_language === 'zh-TW') return 'tc'
  return session?.system_language === 'zh-CN' || session?.teaching_language === 'putonghua' || session?.level_framework === 'hsk' ? 'sc' : 'tc'
}

export function useClassChineseFont(session: Parameters<typeof classChineseFont>[0]) {
  const font = classChineseFont(session)
  useEffect(() => {
    document.documentElement.dataset.chineseFont = font
    return () => { delete document.documentElement.dataset.chineseFont }
  }, [font])
}
