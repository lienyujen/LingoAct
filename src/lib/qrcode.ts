import { buildBrand, BRAND_PARAM } from './brand'
import { backendConfig } from './supabase'

// Students load this shared page instead of one the presenter has to deploy, so
// the link has to say which Supabase project the session lives in.
// The old address, https://lienyujen.github.io/LingoAct, is still published and
// has to stay that way: it is compiled into every copy of LingoAct already
// installed on someone's machine, and those copies cannot be updated remotely.
const DEFAULT_PUBLIC_APP_URL = 'https://lingo.ehuayu.org'

export function buildJoinUrl(sessionReference: string) {
  // A runtime setting wins over the value baked in at build time, so someone who
  // downloaded the app can point students at their own copy of the page.
  const configuredBase = backendConfig?.appUrl || (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)
  const fallback = typeof window !== 'undefined' && window.location.protocol.startsWith('http')
    ? `${window.location.origin}${window.location.pathname}`
    : DEFAULT_PUBLIC_APP_URL
  const base = (configuredBase || fallback).replace(/\/$/, '')
  // Built as a list rather than concatenated, because the edition has to
  // survive a presenter who has no backendConfig — the old code produced the
  // project parameters or nothing at all, so anything appended after it landed
  // on a URL with no ? in front of it.
  const params = new URLSearchParams()
  if (backendConfig) {
    params.set('p', backendConfig.ref)
    params.set('k', backendConfig.key)
  }
  // Which organisation's student page to show; see lib/brand.ts for why this
  // rides on the link instead of being compiled in.
  if (buildBrand) params.set(BRAND_PARAM, buildBrand)
  const query = params.toString()
  return `${base}/#/join/${sessionReference}${query ? `?${query}` : ''}`
}
