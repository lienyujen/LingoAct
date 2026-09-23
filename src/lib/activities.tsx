import {
  ArrowsLeftRight, Camera, Cards, ChatCircleText, Headphones, Image,
  ListNumbers, Microphone, Notepad, Pen, PencilLine, SortAscending,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { PresenterMessageKey } from './presenterI18n'

// The four skills a language teacher already thinks in, rather than the three
// buckets this panel used to have — where 聽 held a single button and 閱讀與詞彙
// held 截圖派題, a door to eight question types that mostly are not reading or
// vocabulary at all.
export type SkillTab = 'listen' | 'speak' | 'read' | 'write'
export const SKILL_TABS: SkillTab[] = ['listen', 'speak', 'read', 'write']

export type ActivityId =
  | 'listeningStudio' | 'flashcards' | 'pronunciation' | 'oralResponse'
  | 'pictureTalk' | 'photoTask' | 'ordering' | 'matching'
  | 'storyOrdering' | 'sentenceWall' | 'writingCoach' | 'drawing'

// An activity appears under a skill only when a teacher who came looking for
// that skill would be glad to land on it. Most practise more than one — the
// names say so themselves: 聽說播音室, 看圖說寫, 排序寫作題 — so listing each in
// one tab only is what made the old grouping feel arbitrary. Listing everything
// everywhere is the opposite failure: the tabs stop filtering and become the
// same list printed four times. Hence at most two, and 'core' sorts before
// 'also' so the tab opens on what it is actually for.
export type Activity = {
  id: ActivityId
  label: PresenterMessageKey
  Icon: Icon
  skills: Partial<Record<SkillTab, 'core' | 'also'>>
}

export const ACTIVITIES: Activity[] = [
  { id: 'listeningStudio', label: 'listeningStudio', Icon: Headphones, skills: { listen: 'core', speak: 'also' } },
  { id: 'flashcards', label: 'flashcards', Icon: Cards, skills: { listen: 'core', read: 'also' } },
  { id: 'pronunciation', label: 'typePronunciation', Icon: Microphone, skills: { speak: 'core', listen: 'also' } },
  { id: 'oralResponse', label: 'typeOralResponse', Icon: ChatCircleText, skills: { speak: 'core' } },
  { id: 'pictureTalk', label: 'pictureTalk', Icon: Image, skills: { speak: 'core', write: 'also' } },
  { id: 'photoTask', label: 'photoTask', Icon: Camera, skills: { write: 'core', speak: 'also' } },
  { id: 'ordering', label: 'typeOrdering', Icon: ListNumbers, skills: { read: 'core' } },
  { id: 'matching', label: 'typeMatching', Icon: ArrowsLeftRight, skills: { read: 'core' } },
  { id: 'storyOrdering', label: 'storyOrdering', Icon: SortAscending, skills: { write: 'core', read: 'also' } },
  { id: 'sentenceWall', label: 'sentenceWall', Icon: Notepad, skills: { write: 'core' } },
  { id: 'writingCoach', label: 'writingCoach', Icon: PencilLine, skills: { write: 'core' } },
  { id: 'drawing', label: 'typeDrawing', Icon: Pen, skills: { write: 'core', read: 'also' } },
]

export function activitiesFor(tab: SkillTab) {
  return ACTIVITIES
    .filter((activity) => activity.skills[tab])
    .sort((a, b) => (a.skills[tab] === b.skills[tab] ? 0 : a.skills[tab] === 'core' ? -1 : 1))
}
