export { speechAccent } from '../../supabase/functions/_shared/speech-accent.ts'
export type { SpeechAccent } from '../../supabase/functions/_shared/speech-accent.ts'

export function accentChoices(language: string) {
  if (language === 'en' || language.startsWith('en-')) return [
    { value: 'american' as const, label: 'accentAmerican' as const },
    { value: 'british' as const, label: 'accentBritish' as const },
  ]
  return [
    { value: 'standard_guoyu' as const, label: 'accentStandardGuoyu' as const },
    { value: 'putonghua' as const, label: 'accentPutonghua' as const },
    { value: 'taiwanese' as const, label: 'accentTaiwanese' as const },
  ].filter((choice) => language !== 'zh-cn' || choice.value === 'putonghua')
}
