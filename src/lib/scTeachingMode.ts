import type { Framework } from './proficiency'

export type ScSystemLanguage = 'zh-CN' | 'zh-TW' | 'en'
export type ScFramework = Extract<Framework, 'hsk' | 'tocfl' | 'tbcl'>

// Interface language and the Chinese standard being taught are separate choices.
export function scFrameworkChoices(language: ScSystemLanguage): ScFramework[] {
  if (language === 'zh-CN') return ['hsk']
  if (language === 'zh-TW') return ['tbcl', 'tocfl']
  return ['hsk', 'tocfl', 'tbcl']
}

export function scTeachingMode(language: ScSystemLanguage, requestedFramework?: string | null) {
  const choices = scFrameworkChoices(language)
  const framework = choices.find((entry) => entry === requestedFramework) || choices[0]
  const simplified = framework === 'hsk'
  return {
    systemLanguage: language,
    framework,
    teachingTrack: simplified ? 'putonghua' : 'huayu',
    teachingLanguage: simplified ? 'zh-cn' : 'zh-tw',
    annotation: simplified ? 'pinyin' : 'zhuyin',
    accents: simplified ? ['putonghua'] : ['standard_guoyu', 'putonghua', 'taiwanese'],
    simplified,
  } as const
}
