import type { Framework } from './proficiency.ts'

// The teaching track, as the server needs it.
//
// Mirrors src/lib/teachingTracks.ts — Edge Functions and the browser bundle
// share no module graph. The client half carries the labels a teacher reads;
// this half carries what the model is told, which is the part that has to be
// precise about who is in the room.
//
// 國語文 and 華語文 are the pair worth being careful with. Both are Mandarin in
// Taiwan and share an accent, but one is taught to children who already speak
// it and the other to people who do not. A prompt that treats a 國小三年級 class
// as second-language learners produces questions that explain words they have
// used since they were three.
export type TeachingTrack = {
  id: string
  // In teaching order, most common first; the first is the default. Several
  // ladders can be right for one language — a Taiwanese English teacher may be
  // working to the 108 curriculum, or preparing a class for 全民英檢, or 多益.
  frameworks: Framework[]
  // What the speech and annotation services key on.
  language: string
  // Named for the model, including who the learners are.
  promptLanguage: string
  // Extra framing the model needs about the learners themselves, if any.
  audience: string
}

export const TEACHING_TRACKS: Record<string, TeachingTrack> = {
  huayu: {
    id: 'huayu',
    frameworks: ['tbcl'],
    language: 'zh-tw',
    promptLanguage: 'Traditional Chinese as written in Taiwan (臺灣繁體中文)',
    audience: 'The learners are studying Chinese as a second or foreign language. Everyday vocabulary a native child would know may still be new to them, and is fair to ask about.',
  },
  guoyu: {
    id: 'guoyu',
    frameworks: ['guoyu108'],
    language: 'zh-tw',
    promptLanguage: 'Traditional Chinese as written in Taiwan (臺灣繁體中文)',
    audience: 'The learners are native Mandarin-speaking schoolchildren in Taiwan following the 108 國語文 curriculum — 國語 in primary school, 國文 from junior high. Do not write as though for a foreign learner: never gloss ordinary words, and pitch the difficulty at what they can READ and WRITE at this stage rather than at what they can say.',
  },
  en: { id: 'en', frameworks: ['en108', 'gept', 'toeic'], language: 'en', promptLanguage: 'English', audience: 'The learners are studying English as a foreign language in Taiwan and share Mandarin as a first language.' },
  ja: { id: 'ja', frameworks: ['jlpt'], language: 'ja', promptLanguage: 'Japanese (日本語)', audience: 'The learners are studying Japanese as a foreign language in Taiwan.' },
  ko: { id: 'ko', frameworks: ['topik'], language: 'ko', promptLanguage: 'Korean (한국어)', audience: 'The learners are studying Korean as a foreign language in Taiwan.' },
  fr: { id: 'fr', frameworks: ['cefr'], language: 'fr', promptLanguage: 'French (français)', audience: 'The learners are studying French as a foreign language in Taiwan.' },
  es: { id: 'es', frameworks: ['cefr'], language: 'es', promptLanguage: 'Spanish (español)', audience: 'The learners are studying Spanish as a foreign language in Taiwan.' },
  de: { id: 'de', frameworks: ['cefr'], language: 'de', promptLanguage: 'German (Deutsch)', audience: 'The learners are studying German as a foreign language in Taiwan.' },
  vi: { id: 'vi', frameworks: ['ivpt'], language: 'vi', promptLanguage: 'Vietnamese (Tiếng Việt)', audience: 'The learners are studying Vietnamese as a foreign language in Taiwan.' },
}

// A ladder only counts if it belongs to the track. Pairing 年級 with an English
// class, or a TOEIC colour with 華語文, has to be impossible rather than merely
// unlikely: the level is prompt material, so a nonsensical pairing produces
// questions at the wrong difficulty instead of failing loudly.
export function resolveFramework(trackId: string | null | undefined, frameworkId: string | null | undefined): Framework {
  const track = resolveTrack(trackId)
  return track.frameworks.find((candidate) => candidate === frameworkId) || track.frameworks[0]
}

export const DEFAULT_TRACK = 'huayu'

// Sessions created before tracks existed stored a bare language code, and
// 'zh-tw' then meant the only Chinese there was: 華語文.
const legacyTrackIds: Record<string, string> = { 'zh-tw': 'huayu', 'zh-cn': 'huayu' }

export function resolveTrack(id: string | null | undefined): TeachingTrack {
  const wanted = (id && legacyTrackIds[id]) || id || ''
  return TEACHING_TRACKS[wanted] || TEACHING_TRACKS[DEFAULT_TRACK]
}

export const teachingTrackIds = new Set(Object.keys(TEACHING_TRACKS))

// What every generated question has to obey before anything about the material.
// The teacher picked the track when the class was created; they should not have
// to restate it in 出題方向 every time they dispatch.
export function trackInstruction(trackId: string | null | undefined) {
  const track = resolveTrack(trackId)
  return [
    `This class is a ${track.promptLanguage} class. Every question, option, instruction and reference answer must be written in ${track.promptLanguage} unless the teacher's direction explicitly asks for another language.`,
    track.audience,
  ].join('\n')
}
