import { APP_PROFILE, profileAllowsTrack } from './appProfiles'
import { resolveTrack } from './teachingTracks'
import { frameworkById } from './proficiency'
import { GUIDANCE_LOCALES } from './participantI18n'

export type CoursePreset = {
  title: string
  teachingTrack: string
  guidanceLanguage: string
  levelFramework: string
  levelCode: string
  readingAnnotation: string
}

// Keep the existing key for the full build so upgrading never loses a
// teacher's saved classes. Dedicated builds get their own shelf: the same
// computer can run all four products without an English preset appearing in
// the 國語文 app.
const KEY = APP_PROFILE.id === 'full'
  ? 'lingoact_course_presets_v1'
  : `lingoact_${APP_PROFILE.id}_course_presets_v1`

const defaultTrack = resolveTrack(APP_PROFILE.defaultTrack)

export const defaultCourse: CoursePreset = {
  title: '', teachingTrack: defaultTrack.id, guidanceLanguage: 'zh-TW',
  levelFramework: defaultTrack.frameworks[0], levelCode: '',
  readingAnnotation: defaultTrack.annotation,
}

export function readCoursePresets(): CoursePreset[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((value): value is CoursePreset => {
      if (!value || typeof value !== 'object') return false
      const course = value as CoursePreset
      const track = resolveTrack(course.teachingTrack)
      const framework = frameworkById(course.levelFramework)
      return typeof course.title === 'string' && course.title.length <= 120
        && profileAllowsTrack(course.teachingTrack)
        && track.id === course.teachingTrack
        && track.frameworks.some((id) => id === course.levelFramework)
        && (course.levelCode === '' || Boolean(framework?.levels.some((level) => level.code === course.levelCode)))
        && GUIDANCE_LOCALES.some((locale) => locale.code === course.guidanceLanguage)
        && (track.annotationChoice ? ['none', 'zhuyin', 'pinyin'].includes(course.readingAnnotation) : course.readingAnnotation === track.annotation)
    }).slice(0, 6)
  } catch {
    return []
  }
}

export function saveCoursePreset(course: CoursePreset): boolean {
  try {
    // Only reusable teaching preferences live here; class records and access keys
    // remain with their existing storage and permission rules.
    const remaining = readCoursePresets().filter((item) => item.title !== course.title)
    localStorage.setItem(KEY, JSON.stringify([course, ...remaining].slice(0, 6)))
    return true
  } catch {
    return false
  }
}

export function courseSummary(course: CoursePreset): string {
  const framework = frameworkById(course.levelFramework)
  return [resolveTrack(course.teachingTrack).label, framework?.short,
    framework?.levels.find((level) => level.code === course.levelCode)?.label,
    GUIDANCE_LOCALES.find((locale) => locale.code === course.guidanceLanguage)?.label,
  ].filter(Boolean).join(' · ')
}
