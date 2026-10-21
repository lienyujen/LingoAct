import type { Framework } from './proficiency.ts'
import { levelInstruction } from './proficiency.ts'
import { englishVocabularyInstruction } from './english.ts'
import { JAPANESE_TEACHING } from './japanese.ts'

// The class's track and its level, as one instruction, read from the session.
//
// Every generator needs both and none of them should be deciding for itself
// which half to look up: the Exit Ticket had neither, 下一步教學 had a bare
// level code, and AI 批改 had them only when the answer happened to carry a
// 拍照描述. One lookup, so there is one thing to get right.
export async function classLevelInstruction(
  db: { from: (table: string) => { select: (columns: string) => { eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: Record<string, string | null> | null }> } } } },
  sessionId: string,
) {
  const { data } = await db.from('sessions')
    .select('teaching_language, level_framework, level_code').eq('id', sessionId).maybeSingle()
  return [
    trackInstruction(data?.teaching_language),
    levelInstruction(data?.level_framework ?? null, data?.level_code ?? null),
    data?.teaching_language === 'en' && data?.level_framework === 'cefr'
      ? englishVocabularyInstruction('cefr', data.level_code) : '',
  ].join('\n')
}

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
  putonghua: {
    id: 'putonghua', frameworks: ['hsk'], language: 'zh-cn',
    promptLanguage: 'Simplified Chinese as written in Mainland China (中国大陆规范简体中文)',
    audience: 'The learners study Chinese as a second or foreign language using the latest HSK syllabus. Use standard Mainland Putonghua pronunciation, Hanyu Pinyin orthography and Mainland vocabulary. Never use Taiwan regional pronunciation, cross-strait substitutions, traditional characters or Bopomofo. Vocabulary and grammar must follow the official HSK syllabus, not TBCL or TOCFL.',
  },
  huayu: {
    id: 'huayu',
    // TBCL is the benchmark the teaching is written against; TOCFL is the test
    // the learners sit — the same pairing as 課綱 and 全民英檢 on the English side.
    frameworks: ['tbcl', 'tocfl'],
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
  en: { id: 'en', frameworks: ['en108', 'cefr', 'gept', 'toeic'], language: 'en', promptLanguage: 'English', audience: 'The learners are studying English as an additional language. Follow their selected school curriculum, CEFR ability level, GEPT level or TOEIC target. Do not assume every learner has Mandarin as a first language. English passages, prompts, options, reference answers, target words and sentence patterns stay in English. Guidance and explanatory feedback follow the selected guidance language. Pronunciation focuses on intelligibility, word stress, sentence stress and connected speech; intelligible accepted American and British variants are not errors.' },
  ja: { id: 'ja', frameworks: ['jf', 'kana', 'jlpt'], language: 'ja', promptLanguage: 'Japanese (日本語)', audience: JAPANESE_TEACHING },
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
    track.id === 'en'
      ? 'This is an English class. Every teaching passage, question, option, task instruction and reference answer must remain in English, even when the teacher gives directions in another language. Only separate explanatory notes may use the selected guidance language.'
      : `This class is a ${track.promptLanguage} class. Every question, option, instruction and reference answer must be written in ${track.promptLanguage} unless the teacher's direction explicitly asks for another language.`,
    track.audience,
  ].join('\n')
}
