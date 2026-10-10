export type MandarinAccent = 'standard_guoyu' | 'putonghua' | 'taiwanese'
export type EnglishAccent = 'american' | 'british'
export type SpeechAccent = MandarinAccent | EnglishAccent

export function speechAccent(language: string, requested: unknown): SpeechAccent {
  if (language === 'en' || language.startsWith('en-')) return requested === 'british' ? 'british' : 'american'
  if (language === 'zh-cn') return 'putonghua'
  return requested === 'putonghua' || requested === 'taiwanese' ? requested : 'standard_guoyu'
}

export function englishPronunciationInstruction(accent: EnglishAccent) {
  return accent === 'british'
    ? 'Use contemporary standard British English pronunciation consistently, with British vowel quality, non-rhotic r where appropriate, natural word stress and connected speech. Keep every supplied word unchanged.'
    : 'Use General American English pronunciation consistently, including rhotic r, American vowel quality, natural word stress and connected speech. Keep every supplied word unchanged.'
}
