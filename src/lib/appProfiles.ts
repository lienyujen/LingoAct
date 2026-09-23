export type AppProfileId = 'full' | 'huayu' | 'english' | 'guoyu'
export type ActivityCategory = 'listen' | 'express' | 'understand'
export type ActivityId =
  | 'listeningStudio'
  | 'sentenceWall'
  | 'pictureTalk'
  | 'storyOrdering'
  | 'writingCoach'
  | 'photoTask'
  | 'captureQuestion'
  | 'flashcards'
  | 'ordering'
  | 'matching'

export type AppProfile = {
  id: AppProfileId
  productName: string
  shortName: string
  defaultTrack: string
  allowedTracks: string[]
  defaultCategory: ActivityCategory
  activityOrder: Record<ActivityCategory, ActivityId[]>
}

const profiles: Record<AppProfileId, AppProfile> = {
  full: {
    id: 'full',
    productName: 'LingoAct',
    shortName: '完整教學版',
    defaultTrack: 'huayu',
    allowedTracks: ['huayu', 'guoyu', 'en', 'ja', 'ko', 'fr', 'es', 'de', 'vi'],
    defaultCategory: 'express',
    activityOrder: {
      listen: ['listeningStudio'],
      express: ['sentenceWall', 'pictureTalk', 'storyOrdering', 'writingCoach', 'photoTask'],
      understand: ['captureQuestion', 'flashcards', 'ordering', 'matching'],
    },
  },
  huayu: {
    id: 'huayu',
    productName: 'LingoAct 華語教學版',
    shortName: '華語教學版',
    defaultTrack: 'huayu',
    allowedTracks: ['huayu'],
    defaultCategory: 'listen',
    activityOrder: {
      listen: ['listeningStudio'],
      express: ['sentenceWall', 'pictureTalk', 'storyOrdering', 'photoTask', 'writingCoach'],
      understand: ['flashcards', 'captureQuestion', 'ordering', 'matching'],
    },
  },
  english: {
    id: 'english',
    productName: 'LingoAct English',
    shortName: 'English',
    defaultTrack: 'en',
    allowedTracks: ['en'],
    defaultCategory: 'listen',
    activityOrder: {
      listen: ['listeningStudio'],
      express: ['writingCoach', 'sentenceWall', 'pictureTalk', 'photoTask', 'storyOrdering'],
      understand: ['flashcards', 'captureQuestion', 'matching', 'ordering'],
    },
  },
  guoyu: {
    id: 'guoyu',
    productName: 'LingoAct 國語文教學版',
    shortName: '國語文教學版',
    defaultTrack: 'guoyu',
    allowedTracks: ['guoyu'],
    defaultCategory: 'understand',
    activityOrder: {
      listen: ['listeningStudio'],
      express: ['sentenceWall', 'writingCoach', 'storyOrdering', 'pictureTalk', 'photoTask'],
      understand: ['captureQuestion', 'ordering', 'matching', 'flashcards'],
    },
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

