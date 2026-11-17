import type { getAdminClient } from './supabase.ts'

type RecordingRow = Record<string, unknown> & { storage_path?: string; previous_attempt?: unknown }
// Archived takes contain private storage paths too. Never spread them into a
// response before stripping the path and generating an authorized playback URL.
export async function recordingForClient(supabase: ReturnType<typeof getAdminClient>, row: RecordingRow, includePrevious = true): Promise<Record<string, unknown>> {
  const { storage_path, previous_attempt, ...safe } = row
  const signed = storage_path ? await supabase.storage.from('lingoact-recordings').createSignedUrl(storage_path, 3600) : null
  return { ...safe, signed_url: signed?.data?.signedUrl || null,
    ...(includePrevious && previous_attempt && typeof previous_attempt === 'object'
      ? { previous_attempt: await recordingForClient(supabase, previous_attempt as RecordingRow, false) } : {}) }
}
