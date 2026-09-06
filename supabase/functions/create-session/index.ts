import { corsHeaders, jsonResponse, errorDetail } from '../_shared/ai.ts'
import { getAdminClient, hashPresenterToken } from '../_shared/supabase.ts'
import { isOwner, ownerKeyConfigured, ownerRefusalMessage } from '../_shared/owner.ts'
import { guidanceLanguages } from '../_shared/languages.ts'
import { DEFAULT_TRACK, resolveTrack, teachingTrackIds } from '../_shared/teaching.ts'
import { FRAMEWORKS } from '../_shared/proficiency.ts'

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const speakerLanguages = new Set(['zh-tw', 'en'])
const interpretationLanguagesSupported = new Set(['zh-tw', 'en', 'es', 'ja', 'ko', 'vi', 'de', 'id', 'th', 'fr'])

function normalizedLanguage(value: unknown, supported: Set<string>, fallback = 'zh-tw') {
  return typeof value === 'string' && supported.has(value) ? value : fallback
}

function createCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return Array.from(bytes, (byte) => codeAlphabet[byte % codeAlphabet.length]).join('')
}

function isDesktopOrigin(req: Request) {
  if (req.headers.get('x-lingoact-client') !== 'windows-app') return false

  const origin = req.headers.get('origin')
  if (origin === 'null' || origin === 'file://') return true
  if (!origin) return true

  try {
    const url = new URL(origin)
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  } catch {
    return false
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ message: 'Method not allowed.' }, 405)
  if (!isDesktopOrigin(req)) return jsonResponse({ message: '請使用 LingoAct Windows App 建立場次。' }, 403)

  try {
    const input = await req.json()
    // Starting a class spends this project's own Gemini and OpenAI credits, so
    // it takes more than the publishable key every student already holds.
    if (ownerKeyConfigured() && !isOwner(input)) return jsonResponse({ message: ownerRefusalMessage(input) }, 403)
    const title = typeof input.title === 'string' ? input.title.trim().slice(0, 120) : ''
    const sourceLanguage = normalizedLanguage(input.captionSourceLanguage, speakerLanguages)
    const interpretationLanguages = Array.isArray(input.interpretationLanguages)
      ? [...new Set(input.interpretationLanguages.filter((language: unknown): language is string => (
        typeof language === 'string' && interpretationLanguagesSupported.has(language) && language !== sourceLanguage
      )))]
      : []
    const interpretationAudioEnabled = Boolean(input.interpretationAudioEnabled) && interpretationLanguages.length > 0
    // What the class is. Anything unrecognised falls back to the default rather
    // than being written through: the track drives the listening voice, the
    // reading annotation, the proficiency ladder and the language questions are
    // written in, and a junk value would surface much later as a clip in the
    // wrong accent or a quiz in the wrong language.
    const teachingTrack = teachingTrackIds.has(input.teachingLanguage) ? input.teachingLanguage as string : DEFAULT_TRACK
    const guidanceLanguage = guidanceLanguages.has(input.guidanceLanguage) ? input.guidanceLanguage as string : 'zh-TW'

    // The ladder is the track's, never the caller's: a 華語文 class is measured
    // in TBCL and a 國語 class in school years, and no request should be able to
    // pair one with the other's levels.
    const track = resolveTrack(teachingTrack)
    const levelCode = typeof input.levelCode === 'string'
      && FRAMEWORKS[track.framework].levels.some((level) => level.code === input.levelCode)
      ? input.levelCode as string
      : null
    const readingAnnotation = ['none', 'zhuyin', 'pinyin'].includes(input.readingAnnotation)
      ? input.readingAnnotation as string
      : track.id === 'guoyu' ? 'zhuyin' : 'none'
    const presenterToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
    const tokenHash = await hashPresenterToken(presenterToken)
    const supabase = getAdminClient()

    let session = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          title: title || '未命名場次',
          code: createCode(),
          recording_enabled: false,
          captions_enabled: false,
          caption_source_language: sourceLanguage,
          caption_display_language: sourceLanguage,
          // Matches the column default in schema.sql; set here too so a project
          // deployed before that default changed still gets the current one.
          caption_font_size: 32,
          caption_font_bold: false,
          caption_position: 'bottom',
          interpretation_enabled: interpretationAudioEnabled,
          interpretation_audio_enabled: interpretationAudioEnabled,
          interpretation_languages: interpretationAudioEnabled ? interpretationLanguages : [],
          teaching_language: teachingTrack,
          guidance_language: guidanceLanguage,
          level_framework: track.framework,
          level_code: levelCode,
          reading_annotation: readingAnnotation,
        })
        .select('id, code')
        .single()

      if (!error) {
        session = data
        break
      }
      if (error.code !== '23505') throw error
    }

    if (!session) throw new Error('Could not create a unique session code.')

    const { error: keyError } = await supabase
      .from('presenter_session_keys')
      .insert({ session_id: session.id, token_hash: tokenHash })

    if (keyError) {
      await supabase.from('sessions').delete().eq('id', session.id)
      throw keyError
    }

    return jsonResponse({ sessionId: session.id, code: session.code, presenterToken })
  } catch (error) {
    console.error('create-session failed', errorDetail(error, 'failed'))
    return jsonResponse({ message: '建立場次失敗。' }, 500)
  }
})
