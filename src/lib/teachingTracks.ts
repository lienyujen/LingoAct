import type { Framework } from './proficiency'

// What the class is, decided once when the session is created.
//
// A teaching track is not just a language. Picking it settles the proficiency
// ladder, whether the text is annotated and with what, the accent the listening
// voice uses, and the language the AI writes questions in — none of which a
// teacher should be asked again per activity. Asking "which framework?" beside
// every audio clip was the wrong shape: a 華語文 teacher is never going to pick
// JLPT, and being offered it is noise.
//
// 國語 and 華語文 are separate tracks, not one Chinese entry. They share a
// language and an accent and almost nothing else: 國語 is Mandarin taught to
// children who already speak it, laddered by school year and always annotated
// in 注音; 華語文 is Mandarin taught to people who do not, laddered by TBCL,
// annotated in 注音 or 拼音 depending on who is in the room. A question written
// for one is wrong for the other even at a comparable reading level.
export type Annotation = 'none' | 'zhuyin' | 'pinyin'

export type TeachingTrack = {
  id: string
  label: string
  // The ladder, named so the teacher can see what picking this commits them to.
  note: string
  // What the speech and translation services need; several tracks share one.
  language: string
  framework: Framework
  // Fixed where the track fixes it, chosen where the teacher reasonably differs.
  annotation: Annotation
  annotationChoice: boolean
}

export const TEACHING_TRACKS: TeachingTrack[] = [
  {
    id: 'huayu',
    label: '華語文',
    note: '第二語言・TBCL',
    language: 'zh-tw',
    framework: 'tbcl',
    annotation: 'zhuyin',
    // A class of beginners reading traditional script wants 注音; one coming
    // from simplified or from a romanised textbook wants 拼音.
    annotationChoice: true,
  },
  {
    id: 'guoyu',
    label: '國語',
    note: '母語・年級・注音',
    language: 'zh-tw',
    framework: 'grade',
    annotation: 'zhuyin',
    annotationChoice: false,
  },
  { id: 'en', label: '英語', note: '全民英檢 GEPT', language: 'en', framework: 'gept', annotation: 'none', annotationChoice: false },
  { id: 'ja', label: '日語', note: '日本語能力試驗 JLPT', language: 'ja', framework: 'jlpt', annotation: 'none', annotationChoice: false },
  { id: 'ko', label: '韓語', note: '韓語能力測驗 TOPIK', language: 'ko', framework: 'topik', annotation: 'none', annotationChoice: false },
  { id: 'fr', label: '法語', note: 'CEFR', language: 'fr', framework: 'cefr', annotation: 'none', annotationChoice: false },
  { id: 'es', label: '西班牙語', note: 'CEFR', language: 'es', framework: 'cefr', annotation: 'none', annotationChoice: false },
  { id: 'de', label: '德語', note: 'CEFR', language: 'de', framework: 'cefr', annotation: 'none', annotationChoice: false },
  { id: 'vi', label: '越南語', note: '越南語能力認證', language: 'vi', framework: 'ivpt', annotation: 'none', annotationChoice: false },
]

// What a Taiwanese teacher of Chinese as a second language gets without asking.
export const DEFAULT_TRACK = 'huayu'

// Sessions created before tracks existed stored a bare language code, and
// 'zh-tw' then meant the only Chinese there was: 華語文.
const legacyTrackIds: Record<string, string> = { 'zh-tw': 'huayu', 'zh-cn': 'huayu' }

export function resolveTrack(id: string | null | undefined): TeachingTrack {
  const wanted = (id && legacyTrackIds[id]) || id
  return TEACHING_TRACKS.find((track) => track.id === wanted)
    || TEACHING_TRACKS.find((track) => track.id === DEFAULT_TRACK) as TeachingTrack
}

export function isTeachingTrack(value: unknown): value is string {
  return typeof value === 'string' && TEACHING_TRACKS.some((track) => track.id === value)
}
