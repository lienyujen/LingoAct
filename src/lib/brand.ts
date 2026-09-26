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
export type BrandId = 'ncacls'

export const BRAND_PARAM = 'b'

// True in the NCACLS desktop build itself, which is the fallback for the
// presenter's own preview of the student page — there is no join URL there to
// read the parameter from.
export const buildBrand: BrandId | null = APP_PROFILE.id === 'ncacls' ? 'ncacls' : null

export function brandFromSearch(search: URLSearchParams): BrandId | null {
  const value = search.get(BRAND_PARAM)
  return value === 'ncacls' ? 'ncacls' : buildBrand
}
