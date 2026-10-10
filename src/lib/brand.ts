import { APP_PROFILE } from './appProfiles'

// Which organisation's edition a student is looking at.
//
// The desktop app picks its edition at build time — VITE_APP_PROFILE decides
// the name, the icon and which languages are on the menu. The student page
// cannot work that way: lingo.ehuayu.org is one deployment serving every
// edition, and NCACLS students join through the same address as everyone else.
// A build-time flag there would mean a second deployment and a second URL,
// which is exactly what we told NCACLS they would not need.
//
// So the presenter's join URL carries it. buildJoinUrl appends ?b=<edition>,
// JoinPage forwards the whole query string to the participant page, and this
// reads it at runtime. The default costs nothing: no parameter means the
// ordinary LingoAct page, so every existing link keeps working.
export type BrandId = 'ncacls' | 'sc' | 'huayu' | 'english'

export const BRAND_PARAM = 'b'

// True in the NCACLS desktop build itself, which is the fallback for the
// presenter's own preview of the student page — there is no join URL there to
// read the parameter from.
export const buildBrand: BrandId | null = ['ncacls', 'sc', 'huayu', 'english'].includes(APP_PROFILE.id) ? APP_PROFILE.id as BrandId : null

export function brandFromSearch(search: URLSearchParams): BrandId | null {
  const value = search.get(BRAND_PARAM)
  return value === 'ncacls' || value === 'sc' || value === 'huayu' || value === 'english' ? value : buildBrand
}

// Editions keep their teaching script while learners choose a guidance language.
// NCACLS defaults to Traditional Chinese and includes its requested languages.
// Ordering the allowed list makes the default deterministic for old join links.
const BRAND_GUIDANCE_LOCALES: Record<BrandId, readonly string[]> = {
  english: ['en', 'zh-TW'],
  huayu: ['zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'vi', 'th', 'id'],
  sc: ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'vi', 'th', 'id'],
  ncacls: ['zh-TW', 'en', 'es', 'vi', 'th', 'id', 'ja', 'ko', 'my'],
}

export function guidanceLocalesForBrand<T extends { code: string }>(all: readonly T[], brand: BrandId | null) {
  const allowed = brand ? BRAND_GUIDANCE_LOCALES[brand] : null
  if (!allowed) return all.filter((option) => option.code !== 'zh-CN')
  const kept = all.filter((option) => allowed.includes(option.code))
  return kept.length ? kept.sort((a, b) => allowed.indexOf(a.code) - allowed.indexOf(b.code)) : [...all]
}
