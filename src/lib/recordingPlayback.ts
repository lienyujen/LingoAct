import type { AudioResponse } from '../types'
import { getPresenterCredential } from './presenterAuth'
import { requireSupabase } from './supabase'

export async function refreshRecordingUrl(recording: AudioResponse, student: boolean) {
  const sessionId = recording.session_id
  const body = student ? {
    action: 'get_recording_result', sessionId, questionId: recording.question_id,
    participantId: localStorage.getItem(`lingoact_participant_${sessionId}`),
    participantToken: localStorage.getItem(`lingoact_participant_token_${sessionId}`),
  } : {
    action: 'get_recording_playback', sessionId, questionId: recording.question_id, responseId: recording.id,
    presenterToken: getPresenterCredential(sessionId),
  }
  const { data, error } = await requireSupabase().functions.invoke(student ? 'participant-action' : 'presenter-action', { body })
  if (error) throw error
  const url = student ? data?.response?.signed_url : data?.signed_url
  if (typeof url !== 'string' || !url) throw new Error('RECORDING_UNAVAILABLE')
  return url
}

// Fetch once on demand rather than letting each signed-URL refresh restart a
// native media element. A local Blob also avoids remote range-request failures.
export async function recordingBlob(url: string | null, renew: () => Promise<string>, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!url || attempt) url = await renew()
    const response = await fetch(url, { signal })
    if (!response.ok) {
      if (!attempt) continue
      throw new Error('RECORDING_UNAVAILABLE')
    }
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength <= 44) throw new Error('EMPTY_RECORDING')
    const head = new TextDecoder('ascii').decode(bytes.slice(0, 12))
    if (head.startsWith('RIFF') && head.slice(8) === 'WAVE') return new Blob([bytes], { type: 'audio/wav' })
    const type = response.headers.get('content-type')?.split(';')[0] || ''
    if (!type.startsWith('audio/')) throw new Error('INVALID_RECORDING')
    return new Blob([bytes], { type })
  }
  throw new Error('RECORDING_UNAVAILABLE')
}
