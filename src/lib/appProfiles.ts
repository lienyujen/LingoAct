import type { ActivityId, SkillTab } from './activities'

// Which teaching room a build opens into. Separate from edition (the paid
// feature set) — they are independent axes, not forks.
export type AppProfileId = 'full' | 'huayu' | 'english' | 'guoyu' | 'ncacls'

export type AppProfile = {
  id: AppProfileId
  productName: string
  shortName: string
  defaultTrack: string
  allowedTracks: string[]
  defaultSkill: SkillTab
  // Per tab, which activities this edition offers and in what order. A tab
  // left out keeps the shared table's own contents and order, which is what
  // most editions want — spelling out all four for every profile was four
  // copies of the same list with two lines moved.
  activityOrder?: Partial<Record<SkillTab, ActivityId[]>>
}

const profiles: Record<AppProfileId, AppProfile> = {
  full: {
    id: 'full',
    productName: 'LingoAct',
    shortName: '完整教學版',
    defaultTrack: 'huayu',
    allowedTracks: ['huayu', 'guoyu', 'en', 'ja', 'ko', 'fr', 'es', 'de', 'vi'],
    defaultSkill: 'speak',
  },
  huayu: {
    id: 'huayu',
    productName: 'LingoAct 華語教學版',
    shortName: '華語教學版',
    defaultTrack: 'huayu',
    allowedTracks: ['huayu'],
    defaultSkill: 'listen',
  },
  english: {
    id: 'english',
    productName: 'LingoAct English',
    shortName: 'English',
    defaultTrack: 'en',
    allowedTracks: ['en'],
    defaultSkill: 'listen',
  },
  guoyu: {
    id: 'guoyu',
    productName: 'LingoAct 國語文教學版',
    shortName: '國語文教學版',
    defaultTrack: 'guoyu',
    allowedTracks: ['guoyu'],
    defaultSkill: 'read',
  },
  // 全美中文學校聯合總會. Its classes are 華語文 taught in traditional script to
  // learners in the United States, so it is the 華語 room with the council's
  // own name and icon. 注音 and 漢語拼音 need nothing here: the 華語文 track
  // already carries annotationChoice, which is what lets a teacher pick
  // between them per class — a beginner reading traditional wants 注音, one
  // arriving from pinyin wants 拼音, and an American Chinese school has both.
  ncacls: {
    id: 'ncacls',
    productName: 'LingoAct NCACLS',
    shortName: 'NCACLS',
    defaultTrack: 'huayu',
    allowedTracks: ['huayu'],
    defaultSkill: 'listen',
  },
}

function resolveProfile(value: unknown): AppProfile {
  return typeof value === 'string' && value in profiles
    ? profiles[value as AppProfileId]
    : profiles.full
}

export const APP_PROFILE = resolveProfile(import.meta.env.VITE_APP_PROFILE)
export const isFullProfile = APP_PROFILE.id === 'full'

export function profileAllowsTrack(trackId: string) {
  return APP_PROFILE.allowedTracks.includes(trackId)
}
