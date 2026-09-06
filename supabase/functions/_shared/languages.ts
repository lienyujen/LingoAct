// The guidance languages the student page can render, as the server will
// accept them.
//
// Mirrors GUIDANCE_LOCALES in src/lib/participantI18n.ts — Edge Functions and
// the browser bundle share no module graph. The teaching side of the pair lives
// in _shared/teaching.ts, which carries more than a list of codes.
export const guidanceLanguages = new Set(['zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'vi'])
