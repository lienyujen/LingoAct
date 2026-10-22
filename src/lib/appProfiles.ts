import type { ActivityId, SkillTab } from './activities'

// Which teaching room a build opens into. Separate from edition (the paid
// feature set) — they are independent axes, not forks.
export type AppProfileId = 'full' | 'huayu' | 'english' | 'japanese' | 'guoyu' | 'ncacls' | 'sc'

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
  japanese: {
    id: 'japanese', productName: 'LingoAct-JP', shortName: '日語教學版',
    defaultTrack: 'ja', allowedTracks: ['ja'], defaultSkill: 'listen',
  },
  sc: {
    id: 'sc', productName: 'LingoAct-SC', shortName: '中文教学版',
    defaultTrack: 'putonghua', allowedTracks: ['putonghua'], defaultSkill: 'listen',
  },
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
    allowedTracks: ['huayu', 'putonghua'],
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
  // The Traditional-only edition retains its legacy profile id for old join links
  // and saved courses, while its visible name and branding are now LingoAct TC.
  ncacls: {
    id: 'ncacls',
    productName: 'LingoAct TC',
    shortName: '繁體中文版',
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
