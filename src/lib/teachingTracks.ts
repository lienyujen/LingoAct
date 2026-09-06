import type { Framework } from './proficiency'

// What the class is, decided once when the session is created.
//
// A teaching track is not just a language. Picking it settles which ladders are
// even on offer, whether the text is annotated and with what, the accent the
// listening voice uses, and the language the AI writes questions in — none of
// which a teacher should be asked again per activity. Offering every framework
// beside every audio clip was the wrong shape: a 華語文 teacher is never going
// to pick JLPT, and being asked to decline it is noise.
//
// Several ladders can be right for one language, though, and English is the
// case that proves it: a Taiwanese English teacher may be working to the 108
// curriculum, or preparing a class for 全民英檢, or for 多益. Those are three
// different targets for the same language, so the track offers the three and
// nothing else.
//
// 國語文 and 華語文 are separate tracks, not one Chinese entry. They share a
// language and an accent and almost nothing else: 國語文 is Mandarin taught to
// children who already speak it — 國語 in 國小, 國文 from 國中 up — laddered by
// the 108 curriculum, which is 素養導向 and so changes what a question must be
// and not merely how hard it is; 華語文 is Mandarin taught to people who do not
// speak it, laddered by TBCL or by the TOCFL test they sit, and annotated in
// 注音 or 拼音 depending on who is in the room. A question written for one is
// wrong for the other even at a comparable reading level.
export type Annotation = 'none' | 'zhuyin' | 'pinyin'

export type TeachingTrack = {
  id: string
  label: string
  // The ladders, named so the teacher sees what picking this commits them to.
  note: string
  // What the speech and translation services need; several tracks share one.
  language: string
  // In teaching order, most common first. The first is the default.
  frameworks: Framework[]
  // Fixed where the track fixes it, chosen where teachers reasonably differ.
  annotation: Annotation
  annotationChoice: boolean
}

export const TEACHING_TRACKS: TeachingTrack[] = [
  {
    id: 'huayu',
    label: '華語文',
    note: '第二語言・TBCL・華測',
    language: 'zh-tw',
    // TBCL is the benchmark the teaching is written against; TOCFL is the test
    // the learners sit. The same pairing as 課綱 and 全民英檢 on the English side.
    frameworks: ['tbcl', 'tocfl'],
    annotation: 'zhuyin',
    // A class of beginners reading traditional script wants 注音; one coming
    // from simplified or from a romanised textbook wants 拼音.
    annotationChoice: true,
  },
  {
    id: 'guoyu',
    label: '國語／國文',
    note: '母語・108課綱・注音',
    language: 'zh-tw',
    frameworks: ['guoyu108'],
    annotation: 'zhuyin',
    annotationChoice: false,
  },
  {
    id: 'en',
    label: '英語',
    note: '108課綱・全民英檢・多益',
    language: 'en',
    frameworks: ['en108', 'gept', 'toeic'],
    annotation: 'none',
    annotationChoice: false,
  },
  { id: 'ja', label: '日語', note: '日本語能力試驗 JLPT', language: 'ja', frameworks: ['jlpt'], annotation: 'none', annotationChoice: false },
  { id: 'ko', label: '韓語', note: '韓語能力測驗 TOPIK', language: 'ko', frameworks: ['topik'], annotation: 'none', annotationChoice: false },
  { id: 'fr', label: '法語', note: 'CEFR', language: 'fr', frameworks: ['cefr'], annotation: 'none', annotationChoice: false },
  { id: 'es', label: '西班牙語', note: 'CEFR', language: 'es', frameworks: ['cefr'], annotation: 'none', annotationChoice: false },
  { id: 'de', label: '德語', note: 'CEFR', language: 'de', frameworks: ['cefr'], annotation: 'none', annotationChoice: false },
  { id: 'vi', label: '越南語', note: '越南語能力認證', language: 'vi', frameworks: ['ivpt'], annotation: 'none', annotationChoice: false },
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

// A ladder only counts if it belongs to the track. Pairing 年級 with an English
// class, or a TOEIC colour with 華語文, has to be impossible rather than merely
// unlikely — the level is prompt material, and a nonsensical one silently
// produces questions at the wrong difficulty rather than failing loudly.
export function resolveFramework(trackId: string | null | undefined, frameworkId: string | null | undefined): Framework {
  const track = resolveTrack(trackId)
  return track.frameworks.find((candidate) => candidate === frameworkId) || track.frameworks[0]
}

export function isTeachingTrack(value: unknown): value is string {
  return typeof value === 'string' && TEACHING_TRACKS.some((track) => track.id === value)
}
