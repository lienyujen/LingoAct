import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { isOwner } from './owner.ts'

export function getAdminClient() {
  const projectUrl = Deno.env.get('SUPABASE_URL')
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  const legacyServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const secretKey = secretKeys ? JSON.parse(secretKeys).default : legacyServiceKey

  if (!projectUrl || !secretKey) {
    throw new Error('Supabase server credentials are unavailable.')
  }

  return createClient(projectUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function hashPresenterToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

// A presenter token belongs to one browser profile, while the owner key belongs
// to the teacher's installation. Editions deliberately use separate Electron
// storage, so a class opened in another edition may have no local token even
// though this is still the project owner's machine. Every teacher-only HTTP
// function uses this same rule; otherwise presenter-action works through the
// owner key while speech, annotation and analysis fail halfway through.
export async function presenterAuthorized(
  supabase: ReturnType<typeof getAdminClient>,
  input: Record<string, unknown>,
  sessionId: string,
  presenterToken: string,
) {
  if (isOwner(input)) return true
  if (!sessionId || !presenterToken) return false
  const { data } = await supabase
    .from('presenter_session_keys')
    .select('session_id')
    .eq('session_id', sessionId)
    .eq('token_hash', await hashPresenterToken(presenterToken))
    .maybeSingle()
  return Boolean(data)
}

export const hashParticipantToken = hashPresenterToken
