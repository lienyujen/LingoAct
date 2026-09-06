import { requireSupabase } from './supabase'
import type { ListeningClip, ListeningKind, PresenterListeningClip } from '../types'

// Everything a student may be told about a clip. Spelled out rather than '*'
// because the anon role holds column-level grants: asking for '*' is refused
// outright, which is the schema doing its job rather than a bug to work around.
const STUDENT_COLUMNS = 'id, session_id, kind, language, duration_ms, public_url, created_at'

export type ListeningAnalysis = {
  kind: ListeningKind
  language: string
  script: 'traditional' | 'simplified' | null
  speakers: string[]
  transcript: string
}

export async function analyzeListeningSource(input: {
  sessionId: string
  presenterToken: string
  screenshotId: string
  teachingLanguage: string
}) {
  const { data, error } = await requireSupabase().functions.invoke('analyze-listening-source', { body: input })
  if (error) throw error
  return data as ListeningAnalysis
}

export async function synthesizeListening(input: {
  sessionId: string
  presenterToken: string
  transcript: string
  kind: ListeningKind
  language: string
  script?: 'traditional' | 'simplified' | null
  speakers?: string[]
  screenshotId?: string | null
}) {
  const { data, error } = await requireSupabase().functions.invoke('synthesize-listening', { body: input })
  if (error) throw error
  return data as { clip: PresenterListeningClip; reused: boolean }
}


// Puts the captured image somewhere the analyser can read it. It is recorded as
// a screenshot but never attached to a question, so nothing about it reaches the
// class — the audio is the only thing they get.
export async function uploadListeningScreenshot(sessionId: string, presenterToken: string, file: File) {
  const supabase = requireSupabase()
  const { data: prepared, error: prepareError } = await supabase.functions.invoke('presenter-action', {
    body: { action: 'prepare_screenshot_upload', sessionId, presenterToken, fileName: file.name },
  })
  if (prepareError) throw prepareError
  if (!prepared?.screenshotId || !prepared?.storagePath || !prepared?.uploadToken) {
    throw new Error(prepared?.message || '無法準備截圖上傳。')
  }

  const { error: uploadError } = await supabase.storage
    .from('lingoact-screenshots')
    .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, {
      contentType: file.type || 'image/png',
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data, error } = await supabase.functions.invoke('presenter-action', {
    body: {
      action: 'record_listening_screenshot',
      sessionId,
      presenterToken,
      screenshotId: prepared.screenshotId,
      storagePath: prepared.storagePath,
    },
  })
  if (error) throw error
  return data.screenshotId as string
}

export async function listListeningClips(sessionId: string, presenterToken: string) {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'list_listening_clips', sessionId, presenterToken },
  })
  if (error) throw error
  return (data as { clips: PresenterListeningClip[] }).clips
}

export async function dispatchListeningQuestion(input: {
  sessionId: string
  presenterToken: string
  listeningClipId: string
  replayLimit: number | null
  promptText: string
}) {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'create_listening_question', ...input },
  })
  if (error) throw error
  return data
}


// The quiz path goes through the ordinary custom-quiz machinery, handing it the
// transcript instead of an image. That is what keeps the class from seeing the
// passage: the question it creates carries the clip, never a screenshot.
export async function dispatchListeningQuiz(input: {
  sessionId: string
  presenterToken: string
  listeningClipId: string
  replayLimit: number | null
  direction: string
  requestedCount: number | null
}) {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'create_custom_quiz', requestedType: 'random', ...input },
  })
  if (error) throw error
  return data
}


export type AnnotationMode = 'none' | 'zhuyin' | 'pinyin'

// Works out how each character should be read. For zhuyin the answer comes back
// as the transcript with variation selectors woven in; for pinyin, as a JSON
// array of syllables aligned one-to-one with the characters.
export async function annotateReading(input: {
  sessionId: string
  presenterToken: string
  text: string
  mode: Exclude<AnnotationMode, 'none'>
}) {
  const { data, error } = await requireSupabase().functions.invoke('annotate-reading', { body: input })
  if (error) throw error
  return data as { mode: string; annotationText: string; polyphonic?: number; decided?: number }
}

// Zhuyin needs a font the student's browser can load, and it is cut here rather
// than on a server because the source face is 17 MB and already on this machine.
// Pinyin needs none: it renders as ruby text.
export async function applyAnnotation(input: {
  sessionId: string
  presenterToken: string
  clipId: string
  mode: AnnotationMode
  annotationText: string
}) {
  let fontBase64 = ''
  if (input.mode === 'zhuyin') {
    const subset = window.lingoActDesktop?.subsetBopomofoFont
    if (!subset) throw new Error('注音字型子集化只能在 LingoAct 桌面版執行。')
    const result = await subset(input.annotationText)
    if (!result.ok) throw new Error(result.message)
    fontBase64 = result.woff2
  }

  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: {
      action: 'set_clip_annotation',
      sessionId: input.sessionId,
      presenterToken: input.presenterToken,
      listeningClipId: input.clipId,
      annotation: input.mode,
      annotationText: input.mode === 'none' ? '' : input.annotationText,
      fontBase64,
    },
  })
  if (error) throw error
  return (data as { clip: PresenterListeningClip }).clip
}

export async function fetchListeningClip(clipId: string) {
  const { data, error } = await requireSupabase()
    .from('listening_clips')
    .select(STUDENT_COLUMNS)
    .eq('id', clipId)
    .maybeSingle()
  if (error) throw error
  return (data as ListeningClip | null) || null
}

// Plays are counted per student per question and kept on the device. This is a
// classroom honour system, not an exam lock: someone determined can clear their
// storage, and the teacher watching the room is the real control.
const playKey = (questionId: string) => `lingoact:listening-plays:${questionId}`

export function playsUsed(questionId: string) {
  try {
    return Number(window.localStorage.getItem(playKey(questionId)) || '0') || 0
  } catch {
    return 0
  }
}

export function recordPlay(questionId: string) {
  const next = playsUsed(questionId) + 1
  try {
    window.localStorage.setItem(playKey(questionId), String(next))
  } catch {
    // A locked-down browser simply gets an unlimited replay; losing the count is
    // better than refusing to play the audio at all.
  }
  return next
}
