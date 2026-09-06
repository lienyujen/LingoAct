// The two axes a language class runs on, as the server will accept them.
//
// Duplicated from src/lib/teachingLanguages.ts and participantI18n.ts rather
// than imported: Edge Functions and the browser bundle share no module graph.
// Both lists are short and change rarely; what matters is that a value the UI
// can produce is a value the server stores, so a new language is added in both
// places or in neither.
export const teachingLanguages = new Set(['zh-tw', 'en', 'ja', 'ko', 'fr', 'es', 'de', 'vi'])
export const guidanceLanguages = new Set(['zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'vi'])
