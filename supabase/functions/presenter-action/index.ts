import { callAiJson, corsHeaders, jsonResponse, errorDetail } from '../_shared/ai.ts'
import { generateCustomQuiz } from '../_shared/custom-quiz.ts'
import { levelInstruction } from '../_shared/proficiency.ts'
import { describePictureSource, drawPicture, drawingPrompt, planPictureStory } from '../_shared/picture.ts'
import { composeSentenceWall } from '../_shared/sentence-wall.ts'
import { reviewWriting } from '../_shared/writing-review.ts'
import { analyzeFileResponse, isAnalyzableFile } from '../_shared/file-analysis.ts'
import { getAdminClient, hashPresenterToken } from '../_shared/supabase.ts'
import { isOwner, ownerKeyConfigured, ownerRefusalMessage } from '../_shared/owner.ts'
import { guidanceLanguageName, guidanceLanguages } from '../_shared/languages.ts'
import { resolveFramework, resolveTrack, teachingTrackIds, trackInstruction } from '../_shared/teaching.ts'
import { ensureFlashcardAudio } from '../_shared/flashcard-audio.ts'

type ParticipantRecord = { id: string; name: string }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const questionTypes = new Set(['send_screen', 'poll', 'multiple_choice', 'true_false', 'short_answer', 'pronunciation', 'oral_response', 'file_upload'])
// Types that can carry a clock, and the subset where preparing to speak is part
// of the exercise. A screen send has no answer, an upload takes as long as the
// photo takes, and a custom quiz is answered through its own attempt flow.
const timedTypes = new Set(['poll', 'multiple_choice', 'true_false', 'short_answer', 'pronunciation', 'oral_response'])
const spokenTypes = new Set(['pronunciation', 'oral_response'])

// Null means untimed; undefined means the value was out of range, which the
// caller turns into a 400 so the teacher sees a message rather than a failed
// insert tripping the column's check constraint as a 500.
function timingSeconds(value: unknown, max: number) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 5 || value > max) return undefined
  return value
}
const speakerLanguages = new Set(['zh-tw', 'en'])
// 'source' is the presenter asking for the transcript unaltered.
const captionDisplayLanguages = new Set(['zh-tw', 'en', 'es', 'ja', 'ko', 'vi', 'de', 'id', 'th', 'fr', 'source'])
const interpretationLanguagesSupported = new Set(['zh-tw', 'en', 'es', 'ja', 'ko', 'vi', 'de', 'id', 'th', 'fr'])
const questionTranslationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    prompt_text: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'prompt_text', 'options'],
}

async function translateQuestion(title: string, promptText: string, options: string[]) {
  if (!promptText && !options.length) return {}
  const result = await callAiJson(
    'Translate this instructor-authored classroom question into concise, natural English. Preserve names, numbers, formulas, meaning, option order, and the number of options exactly. Do not answer, explain, summarize, or add content. Return only the requested JSON.',
    { title, prompt_text: promptText, options },
    questionTranslationSchema,
    null,
    'realtime',
  )
  if (result.status !== 'success') return {}
  const translated = result.output as { title?: string; prompt_text?: string; options?: string[] }
  if (!Array.isArray(translated.options) || translated.options.length !== options.length) return {}
  return { en: translated }
}

function randomIndex(length: number) {
  if (length <= 1) return 0
  const ceiling = Math.floor(0x100000000 / length) * length
  const values = new Uint32Array(1)
  do crypto.getRandomValues(values)
  while (values[0] >= ceiling)
  return values[0] % length
}

function shuffled<T>(items: T[]) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomIndex(index + 1)
    ;[copy[index], copy[target]] = [copy[target], copy[index]]
  }
  return copy
}

function normalizedUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  const parsed = new URL(candidate)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP and HTTPS links are supported.')
  return parsed.toString().slice(0, 2048)
}

function validUuid(value: unknown) {
  return typeof value === 'string' && uuidPattern.test(value)
}

const MAX_TRANSFER_BYTES = 200 * 1024 * 1024

// Storage keys must stay ASCII-safe; the original name is kept in the database.
function storageSafeName(name: string) {
  // Keep the extension: a fully non-ASCII name would otherwise collapse to nothing
  // and the browser would save the download with no extension at all.
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toLowerCase() : ''
  const stem = (dot > 0 ? name.slice(0, dot) : name)
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(-60)
  return `${stem || 'file'}${ext ? `.${ext}` : ''}`
}

function withFileUrl<T extends { storage_path?: string }>(row: T) {
  const base = Deno.env.get('SUPABASE_URL') || ''
  if (!row?.storage_path || !base) return row
  return { ...row, file_url: `${base}/storage/v1/object/public/lingoact-files/${row.storage_path}` }
}

// A question dispatched from a screenshot keeps its wording on the image, so the
// marker needs the picture as well as prompt_text. Storage is read directly
// rather than through the public URL: the bucket is private on some projects.
async function questionScreenshot(
  supabase: ReturnType<typeof getAdminClient>,
  screenshotId: string | null,
) {
  if (!screenshotId) return null
  const { data: shot } = await supabase.from('screenshots')
    .select('storage_path').eq('id', screenshotId).maybeSingle()
  if (!shot?.storage_path) return null
  const { data: blob, error } = await supabase.storage
    .from('lingoact-screenshots').download(shot.storage_path)
  if (error || !blob) return null
  const extension = shot.storage_path.split('.').at(-1)?.toLowerCase()
  return {
    mimeType: extension === 'jpg' ? 'image/jpeg' : extension === 'webp' ? 'image/webp' : 'image/png',
    bytes: new Uint8Array(await blob.arrayBuffer()),
  }
}

function normalizedOptions(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((option): option is string => typeof option === 'string')
    .map((option) => option.trim().slice(0, 500))
    .filter(Boolean))]
    .slice(0, 20)
}

async function listStorageFiles(
  supabase: ReturnType<typeof getAdminClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const item of data || []) {
      const path = `${prefix}/${item.name}`
      if (item.id) files.push(path)
      else files.push(...await listStorageFiles(supabase, bucket, path))
    }
    if (!data || data.length < 1000) break
  }
  return files
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ message: 'Method not allowed.' }, 405)

  try {
    const input = await req.json()
    const action = typeof input.action === 'string' ? input.action : ''
    const supabase = getAdminClient()

    // Lets the settings screen tell the presenter straight away whether the key
    // they just pasted is the one this project expects, instead of letting them
    // discover it when a class fails to start.
    if (action === 'verify_owner_key') {
      if (!ownerKeyConfigured()) {
        return jsonResponse({ ok: true, configured: false, message: '這個專案尚未設定管理金鑰，目前任何電腦都能開課。請執行一次自動部署以產生金鑰。' })
      }
      if (isOwner(input)) return jsonResponse({ ok: true, configured: true, message: '金鑰正確，這台電腦可以開課與管理場次。' })
      return jsonResponse({ ok: false, configured: true, message: ownerRefusalMessage(input) })
    }

    if (action === 'list_sessions') {
      if (isOwner(input)) {
        const { data: owned, error: ownedError } = await supabase
          .from('sessions')
          .select('id, title, code, status, created_at, ended_at')
          .order('created_at', { ascending: false })
          .limit(500)
        if (ownedError) throw ownedError
        return jsonResponse({ sessions: owned || [] })
      }

      const credentials: Array<{ sessionId: string; presenterToken: string }> = Array.isArray(input.credentials)
        ? input.credentials
          .map((credential: unknown) => {
            if (!credential || typeof credential !== 'object') return null
            const candidate = credential as Record<string, unknown>
            if (typeof candidate.sessionId !== 'string' || typeof candidate.presenterToken !== 'string') return null
            return { sessionId: candidate.sessionId, presenterToken: candidate.presenterToken }
          })
          .filter((credential: { sessionId: string; presenterToken: string } | null): credential is { sessionId: string; presenterToken: string } => Boolean(credential))
          .slice(0, 100)
        : []
      if (!credentials.length) return jsonResponse({ sessions: [] })

      const tokenBySession = new Map<string, string>()
      for (const credential of credentials) {
        tokenBySession.set(credential.sessionId, await hashPresenterToken(credential.presenterToken))
      }
      const sessionIds = [...tokenBySession.keys()]
      const { data: keyRecords, error: keyError } = await supabase
        .from('presenter_session_keys')
        .select('session_id, token_hash')
        .in('session_id', sessionIds)
      if (keyError) throw keyError

      const verifiedIds = (keyRecords || [])
        .filter((record) => tokenBySession.get(record.session_id) === record.token_hash)
        .map((record) => record.session_id)
      if (!verifiedIds.length) return jsonResponse({ sessions: [] })

      const { data: sessions, error: sessionError } = await supabase
        .from('sessions')
        .select('id, title, code, status, created_at, ended_at')
        .in('id', verifiedIds)
        .order('created_at', { ascending: false })
      if (sessionError) throw sessionError
      return jsonResponse({ sessions: sessions || [] })
    }

    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : ''
    const presenterToken = typeof input.presenterToken === 'string' ? input.presenterToken : ''
    // The owner is here precisely because this machine never held a token for
    // the class it is trying to tidy up, so demanding one would defeat the point.
    const owner = isOwner(input)
    if (!sessionId || !action || (!presenterToken && !owner)) {
      return jsonResponse({ message: '缺少講者操作所需資料。' }, 400)
    }

    const keyRecord = presenterToken
      ? (await supabase
        .from('presenter_session_keys')
        .select('session_id')
        .eq('session_id', sessionId)
        .eq('token_hash', await hashPresenterToken(presenterToken))
        .maybeSingle()).data
      : null
    if (!keyRecord && !owner) return jsonResponse({ message: '講者權限驗證失敗。' }, 403)

    if (action === 'update_session') {
      const values: Record<string, boolean | number | string | string[] | null> = {}
      // The two axes a language class runs on. Rejected rather than ignored:
      // these pick the listening voice, the reading annotation and the
      // proficiency ladder, so a value silently dropped here would surface much
      // later as a clip in the wrong accent.
      if (typeof input.teachingLanguage === 'string') {
        if (!teachingTrackIds.has(input.teachingLanguage)) return jsonResponse({ message: '不支援這個教學語言。' }, 400)
        values.teaching_language = input.teachingLanguage
        // The ladder is one of the track's own: TBCL for 華語文, the 108
        // curriculum for 國語文, and for English whichever of 課綱 / 全民英檢 /
        // 多益 the teacher is working towards.
        values.level_framework = resolveFramework(input.teachingLanguage, input.levelFramework)
        values.level_code = null
      }
      if (input.levelCode === null || typeof input.levelCode === 'string') {
        values.level_code = input.levelCode || null
      }
      if (typeof input.readingAnnotation === 'string') {
        if (!['none', 'zhuyin', 'pinyin'].includes(input.readingAnnotation)) {
          return jsonResponse({ message: '不支援這個標音方式。' }, 400)
        }
        values.reading_annotation = input.readingAnnotation
      }
      if (typeof input.guidanceLanguage === 'string') {
        if (!guidanceLanguages.has(input.guidanceLanguage)) return jsonResponse({ message: '不支援這個導引語。' }, 400)
        values.guidance_language = input.guidanceLanguage
      }
      if (typeof input.sentenceWallEnabled === 'boolean') values.sentence_wall_enabled = input.sentenceWallEnabled
      if (typeof input.danmakuEnabled === 'boolean') values.danmaku_enabled = input.danmakuEnabled
      if (typeof input.anonymousEnabled === 'boolean') values.anonymous_enabled = input.anonymousEnabled
      if (typeof input.recordingEnabled === 'boolean') {
        values.recording_enabled = input.recordingEnabled
        if (!input.recordingEnabled) values.captions_enabled = false
      }
      if (typeof input.captionsEnabled === 'boolean') {
        values.captions_enabled = input.captionsEnabled
      }
      if (input.recordingEnabled === true) values.caption_started_at = new Date().toISOString()
      if (['idle', 'starting', 'live', 'error'].includes(input.captionStatus)) values.caption_status = input.captionStatus
      const hasCaptionConfiguration = [
        input.captionSourceLanguage,
        input.captionDisplayLanguage,
        input.captionFontSize,
        input.captionFontBold,
        input.captionPosition,
        input.interpretationAudioEnabled,
        input.interpretationLanguages,
      ].some((value) => value !== undefined)
      if (hasCaptionConfiguration) {
        const sourceLanguage = typeof input.captionSourceLanguage === 'string'
          ? input.captionSourceLanguage.trim().toLowerCase()
          : ''
        if (!speakerLanguages.has(sourceLanguage)) return jsonResponse({ message: '講師字幕語言不支援。' }, 400)
        const displayLanguage = typeof input.captionDisplayLanguage === 'string'
          ? input.captionDisplayLanguage.trim().toLowerCase()
          : ''
        if (!captionDisplayLanguages.has(displayLanguage)) return jsonResponse({ message: '字幕顯示語言不支援。' }, 400)
        const interpretationLanguages: string[] = Array.isArray(input.interpretationLanguages)
          ? [...new Set((input.interpretationLanguages as unknown[]).filter((language: unknown): language is string => (
            typeof language === 'string' && interpretationLanguagesSupported.has(language) && language !== sourceLanguage
          )))]
          : []
        const interpretationAudioEnabled = Boolean(input.interpretationAudioEnabled) && interpretationLanguages.length > 0
        values.caption_source_language = sourceLanguage
        values.caption_display_language = displayLanguage
        if (input.captionFontSize !== undefined) {
          const captionFontSize = Number(input.captionFontSize)
          if (!Number.isInteger(captionFontSize) || captionFontSize < 24 || captionFontSize > 96) {
            return jsonResponse({ message: '字幕字型大小不正確。' }, 400)
          }
          values.caption_font_size = captionFontSize
        }
        if (typeof input.captionFontBold === 'boolean') values.caption_font_bold = input.captionFontBold
        if (input.captionPosition !== undefined) {
          const captionPosition = typeof input.captionPosition === 'string' ? input.captionPosition : ''
          if (!['top', 'center', 'bottom'].includes(captionPosition)) {
            return jsonResponse({ message: '字幕位置不正確。' }, 400)
          }
          values.caption_position = captionPosition
        }
        values.interpretation_enabled = interpretationAudioEnabled
        values.interpretation_audio_enabled = interpretationAudioEnabled
        values.interpretation_languages = interpretationAudioEnabled ? interpretationLanguages : []
      }
      if (!Object.keys(values).length) return jsonResponse({ message: '沒有可更新的場次設定。' }, 400)

      const { data, error } = await supabase
        .from('sessions')
        .update(values)
        .eq('id', sessionId)
        .eq('status', 'active')
        .select('*')
        .maybeSingle()
      if (error) throw error
      if (!data) return jsonResponse({ message: '場次已結束，無法變更設定。' }, 409)
      return jsonResponse({ session: data })
    }

    if (action === 'append_caption') {
      const segmentId = validUuid(input.segmentId) ? input.segmentId : crypto.randomUUID()
      const text = typeof input.text === 'string' ? input.text.trim().slice(0, 4000) : ''
      const language = typeof input.language === 'string' ? input.language.trim().toLowerCase().slice(0, 20) : ''
      const sourceLanguage = typeof input.sourceLanguage === 'string' ? input.sourceLanguage.trim().toLowerCase().slice(0, 20) : ''
      if (!text || !language || !sourceLanguage) return jsonResponse({ message: '字幕內容不完整。' }, 400)

      const { data, error } = await supabase
        .from('caption_segments')
        .upsert({
          id: segmentId,
          session_id: sessionId,
          language,
          source_language: sourceLanguage,
          text,
          is_translation: language !== sourceLanguage,
          started_at: typeof input.startedAt === 'string' ? input.startedAt : null,
          ended_at: new Date().toISOString(),
        }, { onConflict: 'id' })
        .select('*')
        .single()
      if (error) throw error
      return jsonResponse({ segment: data })
    }


    if (action === 'prepare_shared_file_upload') {
      const fileName = typeof input.fileName === 'string' ? input.fileName.trim().slice(0, 200) : ''
      const fileSize = Number(input.fileSize)
      if (!fileName || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_TRANSFER_BYTES) {
        return jsonResponse({ message: '檔案資料不正確，單檔上限 200 MB。' }, 400)
      }
      const fileId = crypto.randomUUID()
      const storagePath = `sessions/${sessionId}/files/shared/${fileId}/${storageSafeName(fileName)}`
      const { data, error } = await supabase.storage.from('lingoact-files').createSignedUploadUrl(storagePath)
      if (error) throw error
      return jsonResponse({ fileId, storagePath, uploadToken: data.token })
    }

    if (action === 'submit_shared_file') {
      const storagePath = typeof input.storagePath === 'string' ? input.storagePath : ''
      const fileName = typeof input.fileName === 'string' ? input.fileName.trim().slice(0, 200) : ''
      const mimeType = typeof input.mimeType === 'string' && input.mimeType.trim()
        ? input.mimeType.trim().slice(0, 150)
        : 'application/octet-stream'
      const fileSize = Number(input.fileSize)
      if (!fileName || !storagePath.startsWith(`sessions/${sessionId}/files/shared/`)
        || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_TRANSFER_BYTES) {
        return jsonResponse({ message: '檔案資料不正確。' }, 400)
      }
      const { data, error } = await supabase.from('shared_files').insert({
        session_id: sessionId,
        name: fileName,
        mime_type: mimeType,
        file_size: fileSize,
        storage_path: storagePath,
      }).select('*').single()
      if (error) throw error
      return jsonResponse({ file: withFileUrl(data) })
    }

    if (action === 'list_shared_files') {
      const { data, error } = await supabase.from('shared_files')
        .select('*').eq('session_id', sessionId).order('created_at')
      if (error) throw error
      return jsonResponse({ files: (data || []).map(withFileUrl) })
    }

    if (action === 'delete_shared_file') {
      const fileId = input.fileId
      if (!validUuid(fileId)) return jsonResponse({ message: '檔案資料不正確。' }, 400)
      const { data: file, error: findError } = await supabase.from('shared_files')
        .select('storage_path').eq('id', fileId).eq('session_id', sessionId).maybeSingle()
      if (findError) throw findError
      if (!file) return jsonResponse({ message: '找不到檔案。' }, 404)
      const { error: storageError } = await supabase.storage.from('lingoact-files').remove([file.storage_path])
      if (storageError) throw storageError
      const { error: deleteError } = await supabase.from('shared_files').delete().eq('id', fileId)
      if (deleteError) throw deleteError
      return jsonResponse({ deleted: true })
    }

    if (action === 'create_file_request') {
      const promptText = typeof input.promptText === 'string' ? input.promptText.trim().slice(0, 1000) : ''
      const { data: question, error } = await supabase.from('questions').insert({
        session_id: sessionId,
        type: 'file_upload',
        status: 'active',
        title: '檔案上傳',
        prompt_text: promptText || null,
      }).select('*').single()
      if (error) throw error
      const { error: sessionError } = await supabase.from('sessions')
        .update({ current_question_id: question.id }).eq('id', sessionId)
      if (sessionError) throw sessionError
      return jsonResponse({ question })
    }

    if (action === 'get_file_responses') {
      // The report wants every upload in the session, the modal wants one question.
      const questionId = typeof input.questionId === 'string' ? input.questionId : ''
      if (questionId && !validUuid(questionId)) return jsonResponse({ message: '題目資料不正確。' }, 400)
      let fileQuery = supabase.from('file_responses')
        .select('*').eq('session_id', sessionId)
      if (questionId) fileQuery = fileQuery.eq('question_id', questionId)
      const { data, error } = await fileQuery.order('submitted_at')
      if (error) throw error
      // A spoken 說明 sits in the private bucket, so it reaches the teacher as a
      // signed URL and its path never leaves the server.
      const responses = await Promise.all((data || []).map(async (row) => {
        const withUrl = withFileUrl(row) as Record<string, unknown>
        const { caption_audio_path: audioPath, ...rest } = withUrl
        if (typeof audioPath !== 'string' || !audioPath) return rest
        const { data: signed } = await supabase.storage.from('lingoact-recordings').createSignedUrl(audioPath, 3600)
        return { ...rest, caption_audio_url: signed?.signedUrl || null }
      }))
      return jsonResponse({ responses })
    }

    // Analysis is per file and only ever runs when the presenter asks for it.
    // Marks one student's whole submission, however many files it came in.
    if (action === 'analyze_file_response') {
      const responseId = input.responseId
      if (!validUuid(responseId)) return jsonResponse({ message: '檔案資料不正確。' }, 400)
      const { data: fileRow, error: findError } = await supabase.from('file_responses')
        .select('*').eq('id', responseId).eq('session_id', sessionId).maybeSingle()
      if (findError) throw findError
      if (!fileRow) return jsonResponse({ message: '找不到這個檔案。' }, 404)

      // A student who photographs three pages of working has handed in one
      // answer, not three. Judging a page on its own would judge an argument
      // by its middle, so the pages are read together and the one mark lands
      // on every row — which is also why nobody pays three times for it.
      const { data: submissionRows, error: siblingError } = await supabase.from('file_responses')
        .select('*')
        .eq('question_id', fileRow.question_id)
        .eq('participant_id', fileRow.participant_id)
        .order('submitted_at')
      if (siblingError) throw siblingError
      const submission = (submissionRows || []).length ? submissionRows : [fileRow]
      const readable = submission.filter((row) => isAnalyzableFile(row.mime_type, row.name)).slice(0, 6)
      const unreadable = submission.filter((row) => !readable.some((item) => item.id === row.id))
      if (!readable.length) {
        const { data: skipped } = await supabase.from('file_responses')
          .update({ analysis_status: 'unsupported', error_message: 'AI 無法讀取這個檔案格式。', analyzed_at: new Date().toISOString() })
          .eq('id', responseId).select('*').single()
        return jsonResponse({ response: withFileUrl(skipped) })
      }

      const readableIds = readable.map((row) => row.id)
      await supabase.from('file_responses')
        .update({ analysis_status: 'analyzing', error_message: null }).in('id', readableIds)
      try {
        const { data: question } = await supabase.from('questions')
          .select('prompt_text, screenshot_id, wants_caption').eq('id', fileRow.question_id).maybeSingle()
        const files = []
        for (const row of readable) {
          const { data: blob, error: downloadError } = await supabase.storage
            .from('lingoact-files').download(row.storage_path)
          if (downloadError) throw downloadError
          files.push({ fileName: row.name, mimeType: row.mime_type, fileBytes: new Uint8Array(await blob.arrayBuffer()) })
        }

        // 拍照描述: the description is the thing being marked, so it has to
        // travel with the photograph. Spoken ones are downloaded from the
        // private bucket and handed over as audio — asking the model to judge a
        // description it cannot hear would be judging the photograph alone.
        let caption = null
        let classInstruction = ''
        if (question?.wants_caption) {
          const spoken = submission.find((row) => row.caption_audio_path)
          const written = submission.map((row) => row.caption).filter(Boolean).join('\n')
          let audio = null
          if (spoken?.caption_audio_path) {
            const { data: clip } = await supabase.storage
              .from('lingoact-recordings').download(spoken.caption_audio_path)
            if (clip) audio = { mimeType: 'audio/wav', bytes: new Uint8Array(await clip.arrayBuffer()) }
          }
          caption = { text: written || null, audio }
          const { data: classRow } = await supabase.from('sessions')
            .select('teaching_language, level_framework, level_code').eq('id', sessionId).maybeSingle()
          classInstruction = [
            trackInstruction(classRow?.teaching_language),
            levelInstruction(classRow?.level_framework ?? null, classRow?.level_code ?? null),
          ].join('\n')
        }

        const analysis = await analyzeFileResponse({
          promptText: question?.prompt_text || null,
          files,
          questionImage: await questionScreenshot(supabase, question?.screenshot_id || null),
          caption,
          classInstruction,
        })
        const { data: updatedRows, error: updateError } = await supabase.from('file_responses').update({
          analysis_status: 'success',
          analysis_json: analysis,
          error_message: null,
          analyzed_at: new Date().toISOString(),
        }).in('id', readableIds).select('*')
        if (updateError) throw updateError
        // The mark is the answer to this question, so it goes where every other
        // question's answer goes: the placeholder row the upload created. From
        // there the roster's score, the 神準 badge, the correct-rate on the
        // report and the Excel sheet all read it without knowing it came from a
        // photograph. partial is not 答對, and an open-ended piece is not marked
        // right or wrong at all.
        const isCorrect = analysis.verdict === 'correct' ? true
          : analysis.verdict === 'unscored' ? null
          : false
        const { error: answerError } = await supabase.from('answers')
          .update({ is_correct: isCorrect })
          .eq('question_id', fileRow.question_id)
          .eq('participant_id', fileRow.participant_id)
        if (answerError) throw answerError

        // Anything in the same submission the model cannot open is settled now
        // too, so the presenter is never left with a row asking to be marked
        // that pressing again would not change.
        let skippedRows: Array<Record<string, unknown>> = []
        if (unreadable.length) {
          const { data } = await supabase.from('file_responses').update({
            analysis_status: 'unsupported',
            error_message: 'AI 無法讀取這個檔案格式。',
            analyzed_at: new Date().toISOString(),
          }).in('id', unreadable.map((row) => row.id)).select('*')
          skippedRows = data || []
        }
        const all = [...(updatedRows || []), ...skippedRows].map(withFileUrl)
        const primary = all.find((row) => (row as { id: string }).id === responseId) || all[0]
        return jsonResponse({ response: primary, responses: all })
      } catch (analysisError) {
        const detail = errorDetail(analysisError, 'AI 批改失敗。')
        const { data: failedRows } = await supabase.from('file_responses').update({
          analysis_status: 'failed',
          error_message: detail.slice(0, 500),
          analyzed_at: new Date().toISOString(),
        }).in('id', readableIds).select('*')
        const all = (failedRows || []).map(withFileUrl)
        const primary = all.find((row) => (row as { id: string }).id === responseId) || all[0]
        return jsonResponse({ response: primary, responses: all, message: detail.slice(0, 500) }, 200)
      }
    }
    if (action === 'prepare_screenshot_upload') {
      const screenshotId = crypto.randomUUID()
      const extension = typeof input.fileName === 'string'
        ? input.fileName.toLowerCase().match(/\.(png|jpe?g|webp)$/)?.[1] || 'png'
        : 'png'
      const normalizedExtension = extension === 'jpeg' ? 'jpg' : extension
      const storagePath = `sessions/${sessionId}/screenshots/${screenshotId}.${normalizedExtension}`
      const { data, error } = await supabase.storage
        .from('lingoact-screenshots')
        .createSignedUploadUrl(storagePath)
      if (error) throw error
      return jsonResponse({
        screenshotId,
        storagePath,
        uploadToken: data.token,
      })
    }

    // 看圖說話. Nothing is written down: the picture comes back to the teacher
    // and is uploaded only if they choose to send it, so the ones they reject
    // leave no row and no object behind. From the upload onwards it travels the
    // screenshot path unchanged — which is why this activity needs no question
    // type, no student view and no results view of its own.
    if (action === 'generate_picture') {
      const direction = typeof input.direction === 'string' ? input.direction.trim().slice(0, 500) : ''
      const { data: classRow } = await supabase.from('sessions')
        .select('teaching_language, level_framework, level_code').eq('id', sessionId).maybeSingle()

      let storyboard
      try {
        storyboard = await planPictureStory({
          trackId: classRow?.teaching_language ?? null,
          framework: classRow?.level_framework ?? null,
          levelCode: classRow?.level_code ?? null,
          direction,
        })
      } catch (error) {
        return jsonResponse({ message: errorDetail(error, '無法規劃四格圖，請再試一次。') }, 503)
      }

      let image
      try {
        image = await drawPicture(drawingPrompt(storyboard))
      } catch (error) {
        return jsonResponse({ message: errorDetail(error, '無法生成圖片，請再試一次。') }, 503)
      }

      return jsonResponse({ storyboard, image: image.data, mimeType: image.mimeType })
    }

    // The other source for 看圖說話: a picture the teacher already had on
    // screen. Nothing is drawn — the image exists — so this only reads it and
    // writes the instruction the class is given. The bytes come inline rather
    // than through storage: the crop is in the browser already, and recording
    // a screenshot row for a picture that may not be sent is litter.
    if (action === 'describe_picture') {
      const direction = typeof input.direction === 'string' ? input.direction.trim().slice(0, 500) : ''
      const base64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : ''
      const mimeType = typeof input.mimeType === 'string' ? input.mimeType : 'image/png'
      if (!base64) return jsonResponse({ message: '沒有收到圖片。' }, 400)
      // Roughly 8 MB of image once decoded, which is far more than a crop of a
      // screen and well inside what the model accepts.
      if (base64.length > 11_000_000) return jsonResponse({ message: '圖片太大，請框選小一點的範圍。' }, 413)

      const { data: classRow } = await supabase.from('sessions')
        .select('teaching_language, level_framework, level_code').eq('id', sessionId).maybeSingle()

      try {
        const storyboard = await describePictureSource({
          image: { mimeType, base64 },
          trackId: classRow?.teaching_language ?? null,
          framework: classRow?.level_framework ?? null,
          levelCode: classRow?.level_code ?? null,
          direction,
        })
        return jsonResponse({ storyboard })
      } catch (error) {
        return jsonResponse({ message: errorDetail(error, '無法讀取這張圖片，請再試一次。') }, 503)
      }
    }

    // 拍照描述. An upload question with no screenshot behind it: the material is
    // whatever the student walks up to, which is the point of the activity.
    if (action === 'open_photo_task') {
      const promptText = typeof input.promptText === 'string' ? input.promptText.trim().slice(0, 1000) : ''
      if (!promptText) return jsonResponse({ message: '請先寫出要學生拍什麼、說明什麼。' }, 400)

      let translations = {}
      try {
        translations = await translateQuestion('拍照描述', promptText, [])
      } catch (translationError) {
        console.error('question translation failed', translationError instanceof Error ? translationError.message : translationError)
      }

      const stoppedAt = new Date().toISOString()
      const { error: stopError } = await supabase.from('questions')
        .update({ status: 'stopped', stopped_at: stoppedAt })
        .eq('session_id', sessionId).eq('status', 'active')
      if (stopError) throw stopError

      const { data: question, error: questionError } = await supabase.from('questions').insert({
        session_id: sessionId,
        screenshot_id: null,
        type: 'file_upload',
        status: 'active',
        title: '拍照描述',
        prompt_text: promptText,
        options: [],
        translations,
        allow_multiple: false,
        wants_caption: true,
      }).select('*').single()
      if (questionError) throw questionError

      const { error: sessionError } = await supabase.from('sessions')
        .update({ current_question_id: question.id }).eq('id', sessionId).eq('status', 'active')
      if (sessionError) throw sessionError
      return jsonResponse({ question })
    }

    // 即時造句牆. A 問答題 dispatched with the wall switched on in the same call,
    // because the two halves are one action to a teacher: ask for the sentence
    // and put the sentences on the projector.
    if (action === 'open_sentence_wall') {
      const promptText = typeof input.promptText === 'string' ? input.promptText.trim().slice(0, 1000) : ''
      if (!promptText) return jsonResponse({ message: '請先寫出要學生造句的題目。' }, 400)
      const answerSeconds = timingSeconds(input.answerSeconds, 600)
      if (answerSeconds === undefined) return jsonResponse({ message: '時間設定不正確。' }, 400)

      let translations = {}
      try {
        translations = await translateQuestion('造句', promptText, [])
      } catch (translationError) {
        console.error('question translation failed', translationError instanceof Error ? translationError.message : translationError)
      }

      const stoppedAt = new Date().toISOString()
      const { error: stopError } = await supabase.from('questions')
        .update({ status: 'stopped', stopped_at: stoppedAt })
        .eq('session_id', sessionId).eq('status', 'active')
      if (stopError) throw stopError

      // No screenshot: the prompt is a 句型, and the wall is where the class
      // looks. Everything else about it is an ordinary 問答題.
      const { data: question, error: questionError } = await supabase.from('questions').insert({
        session_id: sessionId,
        screenshot_id: null,
        type: 'short_answer',
        status: 'active',
        title: '造句',
        prompt_text: promptText,
        options: [],
        translations,
        allow_multiple: false,
        answer_seconds: answerSeconds,
      }).select('*').single()
      if (questionError) throw questionError

      const { data: session, error: sessionError } = await supabase.from('sessions')
        .update({ current_question_id: question.id, sentence_wall_enabled: true })
        .eq('id', sessionId).eq('status', 'active').select('*').maybeSingle()
      if (sessionError) throw sessionError
      return jsonResponse({ question, session })
    }

    // The write-up. Stored rather than returned only, so closing the panel or
    // reloading does not lose it, and so the session report can find it.
    if (action === 'compose_sentence_wall') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料格式不正確。' }, 400)
      const [{ data: question }, { data: classRow }] = await Promise.all([
        supabase.from('questions').select('prompt_text').eq('id', questionId).eq('session_id', sessionId).maybeSingle(),
        supabase.from('sessions').select('teaching_language, level_framework, level_code').eq('id', sessionId).maybeSingle(),
      ])
      if (!question) return jsonResponse({ message: '找不到這一題。' }, 404)

      const { data: answers, error: answerError } = await supabase.from('answers')
        .select('answer_text').eq('question_id', questionId).order('submitted_at').limit(200)
      if (answerError) throw answerError
      const sentences = (answers || [])
        .map((answer) => typeof answer.answer_text === 'string' ? answer.answer_text.trim() : '')
        .filter(Boolean)
      if (sentences.length < 2) return jsonResponse({ message: '至少要有兩個句子才能集成。' }, 400)

      let composition
      try {
        composition = await composeSentenceWall({
          prompt: question.prompt_text || '',
          sentences,
          trackId: classRow?.teaching_language ?? null,
          framework: classRow?.level_framework ?? null,
          levelCode: classRow?.level_code ?? null,
        })
      } catch (error) {
        const detail = errorDetail(error, '無法集成這面造句牆。')
        await supabase.from('ai_summaries').insert({
          session_id: sessionId,
          question_id: questionId,
          type: 'sentence_wall',
          input_json: { sentence_count: sentences.length },
          output_json: { error: detail.slice(0, 500) },
          status: 'failed',
        })
        return jsonResponse({ message: detail }, 503)
      }

      const { error: summaryError } = await supabase.from('ai_summaries').insert({
        session_id: sessionId,
        question_id: questionId,
        type: 'sentence_wall',
        input_json: { sentence_count: sentences.length },
        output_json: composition,
        status: 'success',
      })
      if (summaryError) throw summaryError
      return jsonResponse({ composition })
    }

    // 故事排序, the picture version: the four panels arrive already cut apart and
    // already shuffled, and the class drags them back into sequence.
    //
    // The shuffle happens before the upload rather than here, and that is the
    // point of it. Panels are recorded as screenshots so that deleting the class
    // still removes them, and screenshots are readable by students — timestamps
    // included. Uploading them in reading order would leave the answer lying in
    // created_at for anyone who thought to sort by it.
    if (action === 'create_picture_ordering') {
      const rawPanels = Array.isArray(input.panels) ? input.panels : []
      if (rawPanels.length !== 4) return jsonResponse({ message: '圖片排序需要四格。' }, 400)
      const panels = rawPanels.map((raw) => {
        const panel = raw as { screenshotId?: unknown; storagePath?: unknown; order?: unknown }
        return {
          screenshotId: typeof panel.screenshotId === 'string' ? panel.screenshotId : '',
          storagePath: typeof panel.storagePath === 'string' ? panel.storagePath : '',
          order: typeof panel.order === 'number' ? panel.order : -1,
        }
      })
      const orders = [...new Set(panels.map((panel) => panel.order))].sort()
      if (panels.some((panel) => !validUuid(panel.screenshotId)) || orders.join() !== '1,2,3,4') {
        return jsonResponse({ message: '圖片排序的四格資料不正確。' }, 400)
      }
      for (const panel of panels) {
        if (panel.storagePath !== `sessions/${sessionId}/screenshots/${panel.screenshotId}.${panel.storagePath.split('.').at(-1)}` ||
            !/\.(png|jpg|webp)$/.test(panel.storagePath)) {
          return jsonResponse({ message: '截圖路徑不正確。' }, 400)
        }
      }

      const { data: objectList, error: objectError } = await supabase.storage
        .from('lingoact-screenshots')
        .list(`sessions/${sessionId}/screenshots`, { limit: 1000 })
      if (objectError) throw objectError
      const uploaded = new Set((objectList || []).map((object) => object.name))
      if (panels.some((panel) => !uploaded.has(panel.storagePath.split('/').at(-1) || ''))) {
        return jsonResponse({ message: '找不到已上傳的四格圖片。' }, 400)
      }

      const promptText = typeof input.promptText === 'string' && input.promptText.trim()
        ? input.promptText.trim().slice(0, 1000)
        : '請把這四張圖排成正確的故事順序。'
      const title = typeof input.title === 'string' && input.title.trim()
        ? input.title.trim().slice(0, 200)
        : '故事排序'

      const stoppedAt = new Date().toISOString()
      const { error: stopError } = await supabase.from('questions')
        .update({ status: 'stopped', stopped_at: stoppedAt })
        .eq('session_id', sessionId).eq('status', 'active')
      if (stopError) throw stopError

      const withUrls = panels.map((panel) => ({
        ...panel,
        publicUrl: supabase.storage.from('lingoact-screenshots').getPublicUrl(panel.storagePath).data.publicUrl,
      }))
      const { error: panelError } = await supabase.from('screenshots').insert(withUrls.map((panel) => ({
        id: panel.screenshotId,
        session_id: sessionId,
        storage_path: panel.storagePath,
        public_url: panel.publicUrl,
        ai_status: 'skipped',
      })))
      if (panelError) throw panelError

      let translations = {}
      try {
        translations = await translateQuestion(title, promptText, [])
      } catch (translationError) {
        console.error('question translation failed', translationError instanceof Error ? translationError.message : translationError)
      }

      // The question carries no screenshot: the intact picture is the answer,
      // and it never enters the class.
      const questionId = crypto.randomUUID()
      const quizId = crypto.randomUUID()
      const itemId = crypto.randomUUID()
      const { data: question, error: questionError } = await supabase.from('questions').insert({
        id: questionId,
        session_id: sessionId,
        screenshot_id: null,
        type: 'custom_quiz',
        status: 'active',
        title,
        prompt_text: promptText,
        options: [],
        translations,
        allow_multiple: false,
      }).select('*').single()
      if (questionError) throw questionError

      const { error: quizError } = await supabase.from('quizzes').insert({
        id: quizId,
        session_id: sessionId,
        question_id: questionId,
        title,
        direction: promptText,
        requested_count: 1,
        requested_type: 'picture_ordering',
        graded: true,
      })
      if (quizError) throw quizError

      const { error: itemError } = await supabase.from('quiz_items').insert({
        id: itemId,
        quiz_id: quizId,
        position: 1,
        type: 'ordering',
        prompt_text: promptText,
        options: withUrls.map((panel) => panel.screenshotId),
        option_images: withUrls.map((panel) => panel.publicUrl),
        pair_prompts: [],
        points: 100,
        translations: { en: { prompt_text: promptText, options: [], pair_prompts: [] } },
      })
      if (itemError) throw itemError

      const { error: keyError } = await supabase.from('quiz_item_keys').insert({
        item_id: itemId,
        accepted_answers: [...withUrls].sort((a, b) => a.order - b.order).map((panel) => panel.screenshotId),
        rubric: '',
      })
      if (keyError) throw keyError

      const { error: sessionError } = await supabase.from('sessions')
        .update({ current_question_id: questionId }).eq('id', sessionId).eq('status', 'active')
      if (sessionError) throw sessionError
      return jsonResponse({ question, quizId })
    }

    if (action === 'create_custom_quiz') {
      const screenshotId = input.screenshotId
      const storagePath = typeof input.storagePath === 'string' ? input.storagePath : ''
      const direction = typeof input.direction === 'string' ? input.direction.trim().slice(0, 2000) : ''
      const requestedCountValue = input.requestedCount === null || input.requestedCount === '' || input.requestedCount === undefined
        ? null
        : Number(input.requestedCount)
      const requestedCount = typeof requestedCountValue === 'number' && Number.isInteger(requestedCountValue) && requestedCountValue >= 1 && requestedCountValue <= 10
        ? requestedCountValue
        : null
      const requestedType = typeof input.requestedType === 'string' ? input.requestedType : 'random'

      // Read once, applied to every source below. The teacher settled this when
      // they created the class; making them restate it in 出題方向 each time is
      // how a Japanese class ends up with Chinese questions.
      const { data: classRow } = await supabase.from('sessions')
        .select('teaching_language, guidance_language, level_framework, level_code').eq('id', sessionId).maybeSingle()
      const classInstruction = [
        trackInstruction(classRow?.teaching_language),
        levelInstruction(classRow?.level_framework ?? null, classRow?.level_code ?? null),
      ].join('\n')
      // A quiz can be built from a screenshot or from a file the teacher shared;
      // the two differ only in where the source comes from and whether a
      // screenshot row is recorded alongside it.
      const sharedFileId = input.sharedFileId
      const fromSharedFile = sharedFileId !== undefined && sharedFileId !== null && sharedFileId !== ''
      // A listening quiz is built from the clip's transcript. Its source image
      // remains private unless the teacher explicitly asks to send it too.
      const listeningClipId = input.listeningClipId
      const fromListening = listeningClipId !== undefined && listeningClipId !== null && listeningClipId !== ''
      if (fromListening && !validUuid(listeningClipId)) return jsonResponse({ message: '語音素材不正確。' }, 400)
      if (fromSharedFile && !validUuid(sharedFileId)) return jsonResponse({ message: '檔案資料不正確。' }, 400)
      if (!fromSharedFile && !fromListening && !validUuid(screenshotId)) return jsonResponse({ message: '請提供有效的截圖與出題方向。' }, 400)
      if (!direction) return jsonResponse({ message: '請提供有效的截圖與出題方向。' }, 400)
      if (!['random', 'multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching', 'writing', 'flashcard'].includes(requestedType)) {
        return jsonResponse({ message: '測驗題型設定不正確。' }, 400)
      }
      if (input.requestedCount !== null && input.requestedCount !== '' && input.requestedCount !== undefined && requestedCount === null) {
        return jsonResponse({ message: '題數必須介於 1 到 10 之間。' }, 400)
      }
      let sourceUrl = ''
      let sourceText = ''
      let extraInstruction = ''
      let replayLimit: number | null = null
      let listeningScreenshotId: string | null = null
      if (fromListening) {
        const rawLimit = input.replayLimit
        replayLimit = rawLimit === null || rawLimit === undefined || rawLimit === '' ? null : Number(rawLimit)
        if (replayLimit !== null && (!Number.isInteger(replayLimit) || replayLimit < 1 || replayLimit > 10)) {
          return jsonResponse({ message: '重播次數請填 1 到 10，或留空表示不限。' }, 400)
        }
        const { data: clip } = await supabase.from('listening_clips')
          .select('transcript').eq('id', listeningClipId).eq('session_id', sessionId).maybeSingle()
        if (!clip) return jsonResponse({ message: '找不到這段語音。' }, 404)
        if (input.screenshotId !== null && input.screenshotId !== undefined && input.screenshotId !== '') {
          if (!validUuid(input.screenshotId)) return jsonResponse({ message: '圖片資料不正確。' }, 400)
          const { data: sourceScreenshot } = await supabase.from('screenshots')
            .select('id').eq('id', input.screenshotId).eq('session_id', sessionId).maybeSingle()
          if (!sourceScreenshot) return jsonResponse({ message: '找不到這張圖片。' }, 404)
          listeningScreenshotId = sourceScreenshot.id
        }
        sourceText = clip.transcript
        extraInstruction = [
          'This is a LISTENING comprehension test. The learners hear the passage read aloud and never see it written down.',
          'Every question must be answerable from hearing alone. Do not ask about spelling, individual characters, punctuation or page layout, and do not tell the learner to "read" anything.',
        ].join('\n')
      } else if (fromSharedFile) {
        const { data: sharedFile, error: sharedFileError } = await supabase.from('shared_files')
          .select('*').eq('id', sharedFileId).eq('session_id', sessionId).maybeSingle()
        if (sharedFileError) throw sharedFileError
        if (!sharedFile) return jsonResponse({ message: '找不到這個檔案。' }, 404)
        if (!isAnalyzableFile(sharedFile.mime_type, sharedFile.name)) {
          return jsonResponse({ message: 'AI 無法讀取這個檔案格式，無法用來出題。' }, 400)
        }
        const { data: fileUrlData } = supabase.storage.from('lingoact-files').getPublicUrl(sharedFile.storage_path)
        sourceUrl = fileUrlData.publicUrl
      } else {
        if (storagePath !== `sessions/${sessionId}/screenshots/${screenshotId}.${storagePath.split('.').at(-1)}` ||
            !/\.(png|jpg|webp)$/.test(storagePath)) {
          return jsonResponse({ message: '截圖路徑不正確。' }, 400)
        }

        const { data: objectList, error: objectError } = await supabase.storage
          .from('lingoact-screenshots')
          .list(`sessions/${sessionId}/screenshots`, { search: `${screenshotId}.`, limit: 2 })
        if (objectError) throw objectError
        if (!objectList?.some((object) => storagePath.endsWith(`/${object.name}`))) {
          return jsonResponse({ message: '找不到已上傳的截圖。' }, 400)
        }

        const { data: publicData } = supabase.storage.from('lingoact-screenshots').getPublicUrl(storagePath)
        sourceUrl = publicData.publicUrl
      }

      const stoppedAt = new Date().toISOString()
      const { error: stopError } = await supabase.from('questions')
        .update({ status: 'stopped', stopped_at: stoppedAt })
        .eq('session_id', sessionId).eq('status', 'active')
      if (stopError) throw stopError

      // Only a screenshot-sourced quiz has a screenshot to record; a file-sourced
      // one leaves screenshot_id null, which the result view already allows for.
      if (!fromSharedFile && !fromListening) {
        const { error: screenshotError } = await supabase.from('screenshots').insert({
          id: screenshotId,
          session_id: sessionId,
          storage_path: storagePath,
          public_url: sourceUrl,
          ai_status: 'pending',
        })
        if (screenshotError) throw screenshotError
      }

      const questionId = crypto.randomUUID()
      const quizId = crypto.randomUUID()
      const { data: pendingQuestion, error: questionError } = await supabase.from('questions').insert({
        id: questionId,
        session_id: sessionId,
        screenshot_id: fromListening ? listeningScreenshotId : (fromSharedFile ? null : screenshotId),
        listening_clip_id: fromListening ? listeningClipId : null,
        replay_limit: replayLimit,
        type: 'custom_quiz',
        status: 'active',
        title: '出題中，請稍候',
        prompt_text: direction,
        options: [],
        translations: { en: { title: 'Preparing questions, please wait', prompt_text: direction, options: [] } },
        allow_multiple: false,
      }).select('*').single()
      if (questionError) throw questionError

      const { error: sessionError } = await supabase.from('sessions')
        .update({ current_question_id: questionId }).eq('id', sessionId).eq('status', 'active')
      if (sessionError) throw sessionError

      const generateInBackground = async () => {
        try {
          const generated = await generateCustomQuiz({
            sourceUrl: sourceUrl || undefined,
            sourceText: sourceText || undefined,
            extraInstruction: [classInstruction, extraInstruction].filter(Boolean).join('\n'),
            teachingLanguage: resolveTrack(classRow?.teaching_language).promptLanguage,
            guidanceLanguage: guidanceLanguageName(classRow?.guidance_language),
            levelFramework: classRow?.level_framework ?? null,
            levelCode: classRow?.level_code ?? null,
            direction,
            requestedCount,
            requestedType: requestedType as 'random' | 'multiple_choice' | 'fill_blank' | 'short_answer' | 'ordering' | 'matching' | 'writing' | 'flashcard',
          })

          if (!fromSharedFile && !fromListening) {
            const { error: screenshotUpdateError } = await supabase.from('screenshots').update({
              ai_status: 'success',
              screen_summary: { quiz_title: generated.title, item_count: generated.items.length },
            }).eq('id', screenshotId)
            if (screenshotUpdateError) throw screenshotUpdateError
          }

          const { error: quizError } = await supabase.from('quizzes').insert({
            id: quizId,
            session_id: sessionId,
            question_id: questionId,
            title: generated.title,
            direction,
            requested_count: requestedCount,
            requested_type: requestedType,
            graded: !['writing', 'flashcard'].includes(requestedType),
            // Only 寫作教練 has anything to coach; asking for it on a quiz would
            // put a "show the coach" button beside a multiple choice.
            coaching: requestedType === 'writing' && input.coaching === true,
            // Kept so the deck can be added to later; a screenshot-sourced one
            // finds its way back through questions.screenshot_id instead.
            source_file_id: fromSharedFile ? sharedFileId : null,
          })
          if (quizError) throw quizError

          const { error: itemError } = await supabase.from('quiz_items').insert(generated.items.map((item) => ({
            id: item.id,
            quiz_id: quizId,
            position: item.position,
            type: item.type,
            prompt_text: item.prompt_text,
            options: item.options,
            pair_prompts: item.pair_prompts,
            points: item.points,
            // 單字卡: which side is the word, so the 標音 lands on it and not on
            // the gloss beside it.
            prompt_is_word: item.prompt_is_word,
            translations: item.translations,
          })))
          if (itemError) throw itemError

          const { error: keyError } = await supabase.from('quiz_item_keys').insert(generated.items.map((item) => ({
            item_id: item.id,
            accepted_answers: item.accepted_answers,
            rubric: item.rubric,
          })))
          if (keyError) throw keyError

          if (requestedType === 'flashcard') {
            await ensureFlashcardAudio(sessionId, quizId, classRow?.teaching_language)
          }

          const { error: questionUpdateError } = await supabase.from('questions').update({
            title: generated.title,
            translations: { en: { title: 'AI custom quiz', prompt_text: direction, options: [] } },
          }).eq('id', questionId)
          if (questionUpdateError) throw questionUpdateError
        } catch (error) {
          const detail = errorDetail(error, 'AI quiz generation failed.')
          console.error('custom quiz generation failed', detail)
          await Promise.all([
            fromSharedFile || fromListening ? Promise.resolve() : supabase.from('screenshots').update({
              ai_status: 'failed',
              screen_summary: { error: detail.slice(0, 500) },
            }).eq('id', screenshotId),
            supabase.from('questions').update({
              title: '出題失敗，請重新派送',
              translations: { en: { title: 'Question generation failed. Please send it again.', prompt_text: direction, options: [] } },
            }).eq('id', questionId),
          ])
        }
      }

      EdgeRuntime.waitUntil(generateInBackground())
      return jsonResponse({ question: pendingQuestion, quizId, generating: true }, 202)
    }

    // AI 批改 for 寫作教練, one student at a time and only when asked. Feedback
    // rather than a mark: the activity is unscored by design, and total_score
    // stays null. Work already paid for is never redone — the same rule the
    // upload marking follows — so a second press costs nothing unless the
    // teacher explicitly asks for a re-read.
    if (action === 'analyze_writing_attempt') {
      const attemptId = input.attemptId
      if (!validUuid(attemptId)) return jsonResponse({ message: '作答資料不正確。' }, 400)
      const { data: attempt, error: attemptError } = await supabase.from('quiz_attempts')
        .select('id, quiz_id, session_id, composition').eq('id', attemptId).eq('session_id', sessionId).maybeSingle()
      if (attemptError) throw attemptError
      if (!attempt) return jsonResponse({ message: '找不到這份作答。' }, 404)

      const [{ data: quiz }, { data: answers }, { data: items }] = await Promise.all([
        supabase.from('quizzes').select('direction, graded').eq('id', attempt.quiz_id).maybeSingle(),
        supabase.from('quiz_item_answers').select('id, item_id, answer_text, feedback').eq('attempt_id', attemptId),
        supabase.from('quiz_items').select('id, prompt_text, position').eq('quiz_id', attempt.quiz_id).order('position'),
      ])
      if (quiz?.graded !== false) return jsonResponse({ message: '這不是寫作教練，請用原本的評分。' }, 400)

      const promptById = new Map((items || []).map((item) => [item.id, item.prompt_text as string]))
      const written = (answers || []).filter((answer) => (answer.answer_text || '').trim())
      if (!written.length) return jsonResponse({ message: '這位學員沒有寫任何內容。' }, 400)
      const needsRevision = Boolean((attempt.composition || '').trim())
      const { data: reviewedAttempt } = await supabase.from('quiz_attempts')
        .select('revision').eq('id', attemptId).maybeSingle()
      const revisionDone = !needsRevision || Boolean(reviewedAttempt?.revision)
      if (!input.force && revisionDone && written.every((answer) => answer.feedback)) {
        return jsonResponse({ alreadyReviewed: true, answers: written })
      }

      const { data: classRow } = await supabase.from('sessions')
        .select('teaching_language, level_framework, level_code').eq('id', sessionId).maybeSingle()

      let review
      try {
        review = await reviewWriting({
          direction: quiz?.direction || '',
          fields: written.map((answer) => ({
            itemId: answer.item_id as string,
            prompt: promptById.get(answer.item_id as string) || '',
            text: (answer.answer_text || '').slice(0, 4000),
          })),
          composition: (attempt.composition || '').slice(0, 12000),
          trackId: classRow?.teaching_language ?? null,
          framework: classRow?.level_framework ?? null,
          levelCode: classRow?.level_code ?? null,
        })
      } catch (error) {
        return jsonResponse({ message: errorDetail(error, '批改失敗，請再試一次。') }, 503)
      }

      const feedbackByItem = new Map(review.fields.map((field) => [field.itemId, field]))
      for (const answer of written) {
        const field = feedbackByItem.get(answer.item_id as string)
        if (!field) continue
        const { error: writeError } = await supabase.from('quiz_item_answers')
          // score stays untouched: 寫作教練 carries no mark, and writing one
          // here would turn 「已送出」 into a grade on the teacher's panel.
          .update({ feedback: { zh_tw: field.zhTw, en: field.en } }).eq('id', answer.id)
        if (writeError) throw writeError
      }
      const { error: overallError } = await supabase.from('quiz_attempts')
        .update({
          feedback: { zh_tw: review.overall.zhTw, en: review.overall.en },
          // The corrected article, which the student's own page diffs against
          // what they wrote and shows marked up.
          revision: review.revision ? { zh_tw: review.revision.zhTw, notes: review.revision.notes } : null,
        }).eq('id', attemptId)
      if (overallError) throw overallError

      const { data: refreshed } = await supabase.from('quiz_item_answers')
        .select('*').eq('attempt_id', attemptId)
      return jsonResponse({ answers: refreshed || [], overall: review.overall, revision: review.revision })
    }

    // 單字卡 標音. The readings arrive already chosen and the font already cut:
    // the source face is 17 MB and sits on the teacher's machine, so subsetting
    // happens there and this only files the result.
    if (action === 'set_quiz_annotation') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '測驗資料格式不正確。' }, 400)
      const { data: quiz } = await supabase.from('quizzes').select('id')
        .eq('question_id', questionId).eq('session_id', sessionId).maybeSingle()
      if (!quiz) return jsonResponse({ message: '找不到這份測驗。' }, 404)

      const rows = Array.isArray(input.items) ? input.items : []
      const { data: items } = await supabase.from('quiz_items').select('id').eq('quiz_id', quiz.id)
      const known = new Set((items || []).map((item) => item.id))

      const fontBase64 = typeof input.fontBase64 === 'string' ? input.fontBase64 : ''
      let fontUrl: string | null = null
      if (fontBase64) {
        const bytes = Uint8Array.from(atob(fontBase64), (character) => character.charCodeAt(0))
        if (bytes.length > 2 * 1024 * 1024) return jsonResponse({ message: '字型子集過大。' }, 413)
        // A rebuilt subset must have a new URL. Reusing the old object path
        // left browsers holding the already-loaded FontFace, so cards added
        // later carried readings the old subset had no glyphs for.
        const fontPath = `${sessionId}/cards-${questionId}-${crypto.randomUUID()}.woff2`
        const { error: uploadError } = await supabase.storage
          .from('lingoact-listening').upload(fontPath, bytes, { contentType: 'font/woff2' })
        if (uploadError) throw uploadError
        fontUrl = supabase.storage.from('lingoact-listening').getPublicUrl(fontPath).data.publicUrl
      }

      // The reading goes on whichever side the word is. A card asked the other
      // way round — 看詞選解釋 — has the word in the prompt and three glosses in
      // the options, and annotating the glosses put 注音 on 「不同之處」 under a
      // question about 「差異」.
      for (const raw of rows) {
        const row = raw as { itemId?: unknown; readings?: unknown; promptReading?: unknown }
        const itemId = typeof row.itemId === 'string' ? row.itemId : ''
        if (!known.has(itemId)) continue
        const readings = Array.isArray(row.readings)
          ? row.readings.map((reading) => typeof reading === 'string' ? reading : '')
          : []
        const promptReading = typeof row.promptReading === 'string' ? row.promptReading : ''
        const { error: itemError } = await supabase.from('quiz_items')
          .update({ option_readings: readings, prompt_reading: promptReading || null }).eq('id', itemId)
        if (itemError) throw itemError
      }

      const { error: questionError } = await supabase.from('questions')
        .update({ card_font_url: fontUrl }).eq('id', questionId).eq('session_id', sessionId)
      if (questionError) throw questionError
      return jsonResponse({ cardFontUrl: fontUrl })
    }

    // 增減詞彙量: the deck the AI produced is a first draft, and the teacher is
    // the one who knows which words this class actually needs.
    if (action === 'edit_quiz_items') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '測驗資料格式不正確。' }, 400)
      const { data: quiz } = await supabase.from('quizzes').select('*')
        .eq('question_id', questionId).eq('session_id', sessionId).maybeSingle()
      if (!quiz) return jsonResponse({ message: '找不到這份測驗。' }, 404)

      const removeId = typeof input.removeItemId === 'string' ? input.removeItemId : ''
      const addCount = Number(input.addCount)

      if (removeId) {
        if (!validUuid(removeId)) return jsonResponse({ message: '卡片資料不正確。' }, 400)
        const { data: remaining } = await supabase.from('quiz_items')
          .select('id').eq('quiz_id', quiz.id)
        if ((remaining || []).length <= 1) return jsonResponse({ message: '至少要留一張。' }, 400)
        const { error: deleteError } = await supabase.from('quiz_items')
          .delete().eq('id', removeId).eq('quiz_id', quiz.id)
        if (deleteError) throw deleteError
      }

      // One call per press, and a call cannot exceed ten items — see the
      // schema comment in custom-quiz.ts. The deck itself may reach thirty.
      if (Number.isInteger(addCount) && addCount > 0 && addCount <= 10) {
        const { data: existing } = await supabase.from('quiz_items')
          .select('id, position, prompt_text, options').eq('quiz_id', quiz.id).order('position')
        const taken = (existing || []).length
        if (taken + addCount > 30) return jsonResponse({ message: '一疊最多 30 張。' }, 400)

        const { data: question } = await supabase.from('questions')
          .select('screenshot_id').eq('id', questionId).maybeSingle()
        // Back to whatever the deck was built from, screenshot or shared file.
        let sourceUrl = ''
        if (question?.screenshot_id) {
          const { data: screenshot } = await supabase.from('screenshots')
            .select('public_url').eq('id', question.screenshot_id).maybeSingle()
          sourceUrl = screenshot?.public_url || ''
        } else if (quiz.source_file_id) {
          const { data: file } = await supabase.from('shared_files')
            .select('storage_path').eq('id', quiz.source_file_id).maybeSingle()
          if (file) sourceUrl = supabase.storage.from('lingoact-files').getPublicUrl(file.storage_path).data.publicUrl
        }
        if (!sourceUrl) return jsonResponse({ message: '找不到原始教材，無法再出卡。' }, 400)

        const { data: classRow } = await supabase.from('sessions')
          .select('teaching_language, guidance_language, level_framework, level_code').eq('id', sessionId).maybeSingle()
        // What each card TEACHES, not every word printed on it. A card's other
        // options are distractors drawn from the same lesson by design, so
        // treating them as covered makes a thirteen-word lesson look exhausted
        // after five cards and every 再出 refuse.
        const { data: existingKeys } = await supabase.from('quiz_item_keys')
          .select('accepted_answers').in('item_id', (existing || []).map((item) => item.id))
        const covered = (existingKeys || [])
          .map((key) => (key.accepted_answers as string[])?.[0])
          .filter(Boolean)
          .slice(0, 100)
        try {
          const generated = await generateCustomQuiz({
            sourceUrl,
            extraInstruction: [
              trackInstruction(classRow?.teaching_language),
              levelInstruction(classRow?.level_framework ?? null, classRow?.level_code ?? null),
              covered.length ? `These are already on cards in this deck; choose different ones: ${covered.join('、')}` : '',
            ].filter(Boolean).join('\n'),
            teachingLanguage: resolveTrack(classRow?.teaching_language).promptLanguage,
            guidanceLanguage: guidanceLanguageName(classRow?.guidance_language),
            levelFramework: classRow?.level_framework ?? null,
            levelCode: classRow?.level_code ?? null,
            direction: quiz.direction,
            requestedCount: addCount,
            requestedType: quiz.requested_type as 'flashcard',
          })
          // Asked for more than the material holds, the model repeats itself
          // rather than returning fewer — and the same word twice in one deck
          // is worse than a shorter deck. Whatever is already here is dropped.
          const seen = new Set(covered)
          const fresh = generated.items.filter((item) => {
            const answer = (item.accepted_answers || [])[0] || item.prompt_text
            if (seen.has(answer)) return false
            seen.add(answer)
            return true
          })
          if (!fresh.length) {
            return jsonResponse({ message: '這份教材裡的詞已經都出過了，沒有新的可以再出。' }, 409)
          }
          const added = fresh.map((item, index) => ({
            id: item.id,
            quiz_id: quiz.id,
            position: taken + index + 1,
            type: item.type,
            prompt_text: item.prompt_text,
            options: item.options,
            pair_prompts: item.pair_prompts,
            points: item.points,
            // 單字卡: which side is the word, so the 標音 lands on it and not on
            // the gloss beside it.
            prompt_is_word: item.prompt_is_word,
            translations: item.translations,
          }))
          const { error: insertError } = await supabase.from('quiz_items').insert(added)
          if (insertError) throw insertError
          const { error: keyError } = await supabase.from('quiz_item_keys').insert(fresh.map((item) => ({
            item_id: item.id,
            accepted_answers: item.accepted_answers,
            rubric: item.rubric,
          })))
          if (keyError) throw keyError
          await ensureFlashcardAudio(sessionId, quiz.id, classRow?.teaching_language)
        } catch (error) {
          return jsonResponse({ message: errorDetail(error, '再出卡失敗，請再試一次。') }, 503)
        }
      }

      // Positions are renumbered so a deck with a hole in it does not carry that
      // hole into the next edit, where it would collide.
      const { data: finalItems } = await supabase.from('quiz_items')
        .select('id, position').eq('quiz_id', quiz.id).order('position')
      for (const [index, item] of (finalItems || []).entries()) {
        if (item.position === index + 1) continue
        await supabase.from('quiz_items').update({ position: index + 1 }).eq('id', item.id)
      }
      // New words change the glyph subset. Clearing every reading makes the
      // existing annotation pass rebuild one coherent deck, including the new
      // cards, rather than leaving only those cards unlabelled.
      const { error: clearReadingError } = await supabase.from('quiz_items')
        .update({ prompt_reading: null, option_readings: [] }).eq('quiz_id', quiz.id)
      if (clearReadingError) throw clearReadingError
      // quiz_items is intentionally not a public realtime table. Touching the
      // parent question safely tells every student page to refetch the deck.
      const { error: notifyError } = await supabase.from('questions')
        .update({ card_font_url: null }).eq('id', questionId).eq('session_id', sessionId)
      if (notifyError) throw notifyError
      return jsonResponse({ count: (finalItems || []).length })
    }

    if (action === 'get_session_custom_quiz_results') {
      const { data: quizzes, error: quizError } = await supabase.from('quizzes').select('*')
        .eq('session_id', sessionId).order('created_at')
      if (quizError) throw quizError

      const quizIds = (quizzes || []).map((quiz) => quiz.id)
      if (!quizIds.length) {
        return jsonResponse({ quizzes: [], items: [], attempts: [], answers: [], keys: [] })
      }

      const [{ data: items, error: itemError }, { data: attempts, error: attemptError }] = await Promise.all([
        supabase.from('quiz_items').select('*').in('quiz_id', quizIds).order('position'),
        supabase.from('quiz_attempts').select('*').eq('session_id', sessionId).in('quiz_id', quizIds).order('submitted_at'),
      ])
      if (itemError || attemptError) throw itemError || attemptError

      const itemIds = (items || []).map((item) => item.id)
      const attemptIds = (attempts || []).map((attempt) => attempt.id)
      const [{ data: keys, error: keyError }, { data: answers, error: answerError }] = await Promise.all([
        itemIds.length ? supabase.from('quiz_item_keys').select('*').in('item_id', itemIds) : Promise.resolve({ data: [], error: null }),
        attemptIds.length ? supabase.from('quiz_item_answers').select('*').in('attempt_id', attemptIds).order('created_at') : Promise.resolve({ data: [], error: null }),
      ])
      if (keyError || answerError) throw keyError || answerError

      return jsonResponse({
        quizzes: quizzes || [],
        items: items || [],
        attempts: attempts || [],
        answers: answers || [],
        keys: keys || [],
      })
    }

    if (action === 'get_custom_quiz_results') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '測驗資料格式不正確。' }, 400)
      const { data: quiz, error: quizError } = await supabase.from('quizzes').select('*')
        .eq('question_id', questionId).eq('session_id', sessionId).maybeSingle()
      if (quizError) throw quizError
      if (!quiz) {
        const { data: pendingQuestion, error: pendingError } = await supabase.from('questions').select('title')
          .eq('id', questionId).eq('session_id', sessionId).maybeSingle()
        if (pendingError) throw pendingError
        if (pendingQuestion?.title === '出題失敗，請重新派送') {
          return jsonResponse({ message: 'AI 出題暫時失敗，請重新派送。', generating: false }, 503)
        }
        if (pendingQuestion) {
          return jsonResponse({ generating: true, quiz: null, items: [], attempts: [], answers: [], keys: [], tries: [], screenshot: null }, 202)
        }
        return jsonResponse({ message: '找不到自訂測驗。' }, 404)
      }
      if (quiz.requested_type === 'flashcard') {
        const { data: classRow } = await supabase.from('sessions')
          .select('teaching_language').eq('id', sessionId).maybeSingle()
        await ensureFlashcardAudio(sessionId, quiz.id, classRow?.teaching_language)
      }
      const [{ data: items, error: itemError }, { data: attempts, error: attemptError }, { data: question, error: questionError }] = await Promise.all([
        supabase.from('quiz_items').select('*').eq('quiz_id', quiz.id).order('position'),
        supabase.from('quiz_attempts').select('*').eq('quiz_id', quiz.id).order('submitted_at'),
        supabase.from('questions').select('screenshot_id').eq('id', questionId).eq('session_id', sessionId).single(),
      ])
      if (itemError || attemptError || questionError) throw itemError || attemptError || questionError
      const itemIds = (items || []).map((item) => item.id)
      const attemptIds = (attempts || []).map((attempt) => attempt.id)
      const [{ data: keys, error: keyError }, { data: answers, error: answerError }, { data: screenshot, error: screenshotError }, { data: tries }] = await Promise.all([
        itemIds.length ? supabase.from('quiz_item_keys').select('*').in('item_id', itemIds) : Promise.resolve({ data: [], error: null }),
        attemptIds.length ? supabase.from('quiz_item_answers').select('*').in('attempt_id', attemptIds) : Promise.resolve({ data: [], error: null }),
        question.screenshot_id
          ? supabase.from('screenshots').select('*').eq('id', question.screenshot_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        // Only a 單字卡 deck produces more than one of these per card, and they
        // are what it is for: which cards were known cold and which came back.
        attemptIds.length
          ? supabase.from('quiz_item_tries').select('id, attempt_id, item_id, correct, tried_at').in('attempt_id', attemptIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (keyError || answerError || screenshotError) throw keyError || answerError || screenshotError
      // 寫作歷程: every round the class took to the coach. This is what the
      // teacher reads afterwards — a first draft and the question that moved it
      // says more about a student's writing than the finished paragraph does.
      const { data: coachTurns } = quiz.coaching
        ? await supabase.from('writing_coach_turns')
          .select('id, item_id, participant_id, round, draft, reply, created_at')
          .eq('question_id', questionId).order('created_at')
        : { data: [] }
      return jsonResponse({
        quiz,
        items: items || [],
        attempts: attempts || [],
        answers: answers || [],
        keys: keys || [],
        tries: tries || [],
        coachTurns: coachTurns || [],
        screenshot: screenshot || null,
      })
    }

    if (action === 'update_custom_quiz_key') {
      const questionId = input.questionId
      const itemId = input.itemId
      const acceptedAnswers = normalizedOptions(input.acceptedAnswers).slice(0, 12)
      if (!validUuid(questionId) || !validUuid(itemId) || !acceptedAnswers.length) {
        return jsonResponse({ message: '請提供有效的題目與正確答案。' }, 400)
      }
      const { data: quiz, error: quizError } = await supabase.from('quizzes').select('id')
        .eq('question_id', questionId).eq('session_id', sessionId).maybeSingle()
      if (quizError) throw quizError
      if (!quiz) return jsonResponse({ message: '找不到自訂測驗。' }, 404)
      const { data: item, error: itemError } = await supabase.from('quiz_items').select('*')
        .eq('id', itemId).eq('quiz_id', quiz.id).maybeSingle()
      if (itemError) throw itemError
      if (!item) return jsonResponse({ message: '找不到測驗題目。' }, 404)
      if (item.type === 'multiple_choice' && (acceptedAnswers.length !== 1 || !item.options.includes(acceptedAnswers[0]))) {
        return jsonResponse({ message: '正確答案必須是題目中的一個選項。' }, 400)
      }
      const { error: keyError } = await supabase.from('quiz_item_keys')
        .update({ accepted_answers: acceptedAnswers }).eq('item_id', itemId)
      if (keyError) throw keyError

      if (item.type === 'multiple_choice') {
        const [{ data: itemAnswers, error: answerError }, { data: quizItems, error: quizItemsError }] = await Promise.all([
          supabase.from('quiz_item_answers').select('id, attempt_id, answer_values').eq('item_id', itemId),
          supabase.from('quiz_items').select('type').eq('quiz_id', quiz.id),
        ])
        if (answerError || quizItemsError) throw answerError || quizItemsError
        const isChoiceOnlyQuiz = Boolean(quizItems?.length) && quizItems.every((quizItem) => quizItem.type === 'multiple_choice')
        const affectedAttemptIds = new Set<string>()
        for (const answer of itemAnswers || []) {
          const submitted = Array.isArray(answer.answer_values) ? [...new Set(answer.answer_values)].sort() : []
          const expected = [...acceptedAnswers].sort()
          const correct = submitted.length === expected.length && expected.every((value, index) => value === submitted[index])
          const { error } = await supabase.from('quiz_item_answers').update({
            score: correct ? item.points : 0,
            feedback: {
              zh_tw: correct ? '回答正確。' : `回答錯誤，正確答案：${expected.join('、')}`,
              en: correct ? 'Correct.' : `Incorrect. Correct answer: ${expected.join(', ')}`,
            },
          }).eq('id', answer.id)
          if (error) throw error
          affectedAttemptIds.add(answer.attempt_id)
        }
        for (const attemptId of affectedAttemptIds) {
          const { data: scoredAnswers, error: scoreError } = await supabase.from('quiz_item_answers')
            .select('score').eq('attempt_id', attemptId)
          if (scoreError) throw scoreError
          const totalScore = Math.round((scoredAnswers || []).reduce((sum, answer) => sum + (Number(answer.score) || 0), 0) * 100) / 100
          const values: Record<string, unknown> = { total_score: totalScore }
          if (isChoiceOnlyQuiz) {
            values.feedback = {
              zh_tw: `本次自動評分 ${totalScore}/100。`,
              en: `Auto-marked score: ${totalScore}/100.`,
            }
          }
          const { error } = await supabase.from('quiz_attempts').update(values).eq('id', attemptId)
          if (error) throw error
        }
      }
      return jsonResponse({ success: true })
    }

    // The presenter reads clips through here rather than from the browser,
    // because the transcript is deliberately not granted to the anon role: it is
    // the answer key, and the teacher is the only one who may see it.
    // Records the uploaded image so it can be read for its text, without
    // dispatching anything. Every other path that writes a screenshots row also
    // puts a question in front of the class; a listening clip must not, because
    // the image is the very thing the class is not allowed to see.
    if (action === 'record_listening_screenshot') {
      const screenshotId = input.screenshotId
      const storagePath = typeof input.storagePath === 'string' ? input.storagePath : ''
      if (!validUuid(screenshotId)) return jsonResponse({ message: '截圖識別碼不正確。' }, 400)
      if (storagePath !== `sessions/${sessionId}/screenshots/${screenshotId}.${storagePath.split('.').at(-1)}` ||
          !/\.(png|jpg|webp)$/.test(storagePath)) {
        return jsonResponse({ message: '截圖路徑不正確。' }, 400)
      }

      const { data: objectList, error: objectError } = await supabase.storage
        .from('lingoact-screenshots')
        .list(`sessions/${sessionId}/screenshots`, { search: `${screenshotId}.`, limit: 2 })
      if (objectError) throw objectError
      if (!objectList?.some((object) => storagePath.endsWith(`/${object.name}`))) {
        return jsonResponse({ message: '找不到已上傳的截圖。' }, 400)
      }

      const { data: publicData } = supabase.storage.from('lingoact-screenshots').getPublicUrl(storagePath)
      const { error: insertError } = await supabase.from('screenshots').insert({
        id: screenshotId,
        session_id: sessionId,
        storage_path: storagePath,
        public_url: publicData.publicUrl,
        ai_status: 'skipped',
      })
      if (insertError) throw insertError
      return jsonResponse({ screenshotId, publicUrl: publicData.publicUrl })
    }

    // Finishes an annotation in one write: the marked-up text and, for zhuyin,
    // the font subset cut on the teacher's machine. Both or neither — a clip
    // carrying variation selectors but no font would render every polyphonic
    // character with its default reading, which is worse than no annotation at
    // all because it looks correct.
    if (action === 'set_clip_annotation') {
      const clipId = input.listeningClipId
      const annotation = ['none', 'zhuyin', 'pinyin'].includes(input.annotation) ? input.annotation : 'none'
      const annotationText = typeof input.annotationText === 'string' ? input.annotationText : ''
      const fontBase64 = typeof input.fontBase64 === 'string' ? input.fontBase64 : ''
      if (!validUuid(clipId)) return jsonResponse({ message: '語音素材不正確。' }, 400)

      const { data: clip } = await supabase
        .from('listening_clips')
        .select('id, content_hash')
        .eq('id', clipId)
        .eq('session_id', sessionId)
        .maybeSingle()
      if (!clip) return jsonResponse({ message: '找不到這段語音。' }, 404)

      if (annotation === 'zhuyin' && !fontBase64) {
        return jsonResponse({ message: '注音標記需要一併提供字型子集。' }, 400)
      }

      let fontPath = null
      let fontUrl = null
      if (annotation === 'zhuyin') {
        const bytes = Uint8Array.from(atob(fontBase64), (character) => character.charCodeAt(0))
        if (bytes.length > 2 * 1024 * 1024) {
          return jsonResponse({ message: '字型子集過大，請縮短文字。' }, 413)
        }
        fontPath = `${sessionId}/${clip.content_hash}.woff2`
        const { error: uploadError } = await supabase.storage
          .from('lingoact-listening')
          .upload(fontPath, bytes, { contentType: 'font/woff2', upsert: true })
        if (uploadError) throw uploadError
        const { data: publicUrl } = supabase.storage.from('lingoact-listening').getPublicUrl(fontPath)
        fontUrl = publicUrl.publicUrl
      }

      const { data: updated, error: updateError } = await supabase
        .from('listening_clips')
        .update({
          annotation,
          annotation_text: annotation === 'none' ? null : annotationText,
          font_path: fontPath,
          font_url: fontUrl,
        })
        .eq('id', clipId)
        .select('*')
        .single()
      if (updateError) throw updateError
      return jsonResponse({ clip: updated })
    }

    if (action === 'list_listening_clips') {
      const { data: clips, error: listError } = await supabase
        .from('listening_clips')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (listError) throw listError
      return jsonResponse({ clips: clips || [] })
    }

    // Its own action rather than a branch of create_question. The source image
    // is attached only when the teacher explicitly chooses it in the studio.
    if (action === 'create_listening_question') {
      const clipId = input.listeningClipId
      if (!validUuid(clipId)) return jsonResponse({ message: '缺少語音素材。' }, 400)

      const rawLimit = input.replayLimit
      const replayLimit = rawLimit === null || rawLimit === undefined || rawLimit === '' ? null : Number(rawLimit)
      if (replayLimit !== null && (!Number.isInteger(replayLimit) || replayLimit < 1 || replayLimit > 10)) {
        return jsonResponse({ message: '重播次數請填 1 到 10，或留空表示不限。' }, 400)
      }

      const { data: clip } = await supabase
        .from('listening_clips')
        .select('id, transcript, annotation, annotation_text, font_url, karaoke_cues')
        .eq('id', clipId)
        .eq('session_id', sessionId)
        .maybeSingle()
      if (!clip) return jsonResponse({ message: '找不到這段語音。' }, 404)

      let listeningScreenshotId: string | null = null
      if (input.screenshotId !== null && input.screenshotId !== undefined && input.screenshotId !== '') {
        if (!validUuid(input.screenshotId)) return jsonResponse({ message: '圖片資料不正確。' }, 400)
        const { data: sourceScreenshot } = await supabase.from('screenshots')
          .select('id').eq('id', input.screenshotId).eq('session_id', sessionId).maybeSingle()
        if (!sourceScreenshot) return jsonResponse({ message: '找不到這張圖片。' }, 404)
        listeningScreenshotId = sourceScreenshot.id
      }

      // Reading aloud inverts a listening item: the learner must see the words
      // and hear a model, so the transcript moves onto the question — the one
      // place students may read — and the clip becomes the reference recording.
      const readAloud = input.mode === 'read_aloud'
      const audioOnly = input.mode === 'audio'

      const prepareSeconds = readAloud ? timingSeconds(input.prepareSeconds, 300) : null
      const answerSeconds = readAloud ? timingSeconds(input.answerSeconds, 600) : null
      if (prepareSeconds === undefined || answerSeconds === undefined) {
        return jsonResponse({ message: '時間設定不正確。' }, 400)
      }

      const teacherPrompt = typeof input.promptText === 'string' ? input.promptText.trim().slice(0, 1000) : ''
      // 注音 is set into the glyphs, so the annotated text IS the text to show.
      // 拼音 is not: annotate-reading returns a syllable per character, and
      // printing that list is how students ended up reading ["wǒ","měi",...].
      // It travels in reading_ruby instead and the prompt stays the sentence.
      const zhuyin = clip.annotation === 'zhuyin'
      const readingText = zhuyin ? (clip.annotation_text || clip.transcript) : clip.transcript
      const promptText = audioOnly ? readingText.slice(0, 4000) : readAloud ? readingText.slice(0, 1000) : teacherPrompt
      let readingRuby: string[] | null = null
      if ((readAloud || audioOnly) && clip.annotation === 'pinyin' && clip.annotation_text) {
        try {
          const syllables = JSON.parse(clip.annotation_text)
          // Aligned per character, so a list of the wrong length would put every
          // reading over the wrong word — better none than that.
          if (Array.isArray(syllables) && syllables.length === [...promptText].length) {
            readingRuby = syllables.map((syllable) => typeof syllable === 'string' ? syllable : '')
          }
        } catch {
          // Stored by an older build in a shape this cannot read; the sentence
          // still goes out, just without the pinyin above it.
        }
      }
      const title = readAloud ? '朗讀發音' : '聽力'
      let translations = {}
      // The audio-only prompt is the exact script being spoken, not guidance
      // text. Translating it would make the highlighted words disagree with the
      // recording for every student using another interface language.
      if (!audioOnly) {
        try {
          translations = await translateQuestion(title, promptText, [])
        } catch (translationError) {
          console.error('listening question translation failed', translationError instanceof Error ? translationError.message : translationError)
        }
      }

      const { error: stopError } = await supabase
        .from('questions')
        .update({ status: 'stopped', stopped_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('status', 'active')
      if (stopError) throw stopError

      const { data: question, error: questionError } = await supabase
        .from('questions')
        .insert({
          session_id: sessionId,
          screenshot_id: listeningScreenshotId,
          listening_clip_id: clipId,
          // Practice, not assessment: a learner comparing themselves to a model
          // should hear it as often as they need.
          replay_limit: readAloud ? null : replayLimit,
          type: readAloud ? 'pronunciation' : 'listening',
          status: 'active',
          title,
          prompt_text: promptText || null,
          // Only modes that deliberately offer the words carry the font. A
          // comprehension quiz gets neither subset nor transcript, because the
          // characters themselves would reveal its source passage.
          reading_font_url: (readAloud || audioOnly) && zhuyin ? clip.font_url : null,
          reading_ruby: readingRuby,
          karaoke_cues: audioOnly && Array.isArray(clip.karaoke_cues) ? clip.karaoke_cues : [],
          prepare_seconds: prepareSeconds,
          answer_seconds: answerSeconds,
          translations,
        })
        .select('*')
        .single()
      if (questionError) throw questionError

      const { error: sessionError } = await supabase
        .from('sessions')
        .update({ current_question_id: question.id })
        .eq('id', sessionId)
        .eq('status', 'active')
      if (sessionError) throw sessionError
      return jsonResponse({ question })
    }

    if (action === 'create_question') {
      const screenshotId = input.screenshotId
      const storagePath = typeof input.storagePath === 'string' ? input.storagePath : ''
      const type = typeof input.questionType === 'string' ? input.questionType : ''
      if (!validUuid(screenshotId) || !questionTypes.has(type)) {
        return jsonResponse({ message: '題目資料格式不正確。' }, 400)
      }
      if (storagePath !== `sessions/${sessionId}/screenshots/${screenshotId}.${storagePath.split('.').at(-1)}` ||
          !/\.(png|jpg|webp)$/.test(storagePath)) {
        return jsonResponse({ message: '截圖路徑不正確。' }, 400)
      }

      const options = normalizedOptions(input.options)
      const allowMultiple = Boolean(input.allowMultiple) && ['poll', 'multiple_choice'].includes(type)
      // Only a spoken answer has preparation, and only a type students answer
      // has a clock at all; storing either on any other type would leave a
      // limit behind that nothing reads.
      const prepareSeconds = timedTypes.has(type) && spokenTypes.has(type) ? timingSeconds(input.prepareSeconds, 300) : null
      const answerSeconds = timedTypes.has(type) ? timingSeconds(input.answerSeconds, 600) : null
      if (prepareSeconds === undefined || answerSeconds === undefined) {
        return jsonResponse({ message: '時間設定不正確。' }, 400)
      }
      const promptText = typeof input.promptText === 'string' ? input.promptText.trim().slice(0, 1000) : ''
      const titles: Record<string, string> = {
        send_screen: '派送畫面',
        poll: '投票題',
        multiple_choice: '選擇題',
        true_false: '是非題',
        short_answer: '問答題',
        pronunciation: '朗讀發音',
        oral_response: '口語表達',
        file_upload: '上傳作答',
      }
      let translations = {}
      try {
        translations = await translateQuestion(titles[type], promptText, options)
      } catch (translationError) {
        console.error('question translation failed', translationError instanceof Error ? translationError.message : translationError)
      }
      const { data: objectList, error: objectError } = await supabase.storage
        .from('lingoact-screenshots')
        .list(`sessions/${sessionId}/screenshots`, { search: `${screenshotId}.`, limit: 2 })
      if (objectError) throw objectError
      if (!objectList?.some((object) => storagePath.endsWith(`/${object.name}`))) {
        return jsonResponse({ message: '找不到已上傳的截圖。' }, 400)
      }

      const stoppedAt = new Date().toISOString()
      const { error: stopError } = await supabase
        .from('questions')
        .update({ status: 'stopped', stopped_at: stoppedAt })
        .eq('session_id', sessionId)
        .eq('status', 'active')
      if (stopError) throw stopError

      const { data: publicData } = supabase.storage.from('lingoact-screenshots').getPublicUrl(storagePath)
      const { error: screenshotError } = await supabase
        .from('screenshots')
        .insert({
          id: screenshotId,
          session_id: sessionId,
          storage_path: storagePath,
          public_url: publicData.publicUrl,
          ai_status: 'skipped',
        })
      if (screenshotError) throw screenshotError

      const { data: question, error: questionError } = await supabase
        .from('questions')
        .insert({
          session_id: sessionId,
          screenshot_id: screenshotId,
          type,
          status: 'active',
          title: titles[type],
          prompt_text: promptText || null,
          options,
          translations,
          allow_multiple: allowMultiple,
          prepare_seconds: prepareSeconds,
          answer_seconds: answerSeconds,
        })
        .select('*')
        .single()
      if (questionError) throw questionError

      const { error: sessionError } = await supabase
        .from('sessions')
        .update({ current_question_id: question.id })
        .eq('id', sessionId)
        .eq('status', 'active')
      if (sessionError) throw sessionError
      return jsonResponse({ question })
    }

    if (action === 'stop_question') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料格式不正確。' }, 400)
      const { data, error } = await supabase
        .from('questions')
        .update({ status: 'stopped', stopped_at: new Date().toISOString() })
        .eq('id', questionId)
        .eq('session_id', sessionId)
        .eq('status', 'active')
        .select('*')
        .maybeSingle()
      if (error) throw error
      if (!data) return jsonResponse({ message: '題目已停止或不存在。' }, 409)
      return jsonResponse({ question: data })
    }

    // Stopping is how a teacher ends a question; reopening it is how they give
    // the class another minute after someone asks. Without this the only way
    // back was to dispatch the question again, which threw away the answers
    // already in.
    if (action === 'resume_question') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料格式不正確。' }, 400)

      // Only the question the class is actually on. Reviving an older one would
      // leave two questions accepting answers with the students' pages showing
      // only the newer, so the earlier one would take answers nobody could see.
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('current_question_id, status')
        .eq('id', sessionId)
        .maybeSingle()
      if (sessionError) throw sessionError
      if (!session || session.status !== 'active') return jsonResponse({ message: '課堂已結束。' }, 409)
      if (session.current_question_id !== questionId) {
        return jsonResponse({ message: '這題已經不是目前的題目，請重新派送。' }, 409)
      }

      // started_at moves to now because it is what the answer clock counts
      // from: a timed question reopened after its window had passed would
      // otherwise come back already expired, refusing every answer it invited.
      const { data, error } = await supabase
        .from('questions')
        .update({ status: 'active', stopped_at: null, started_at: new Date().toISOString() })
        .eq('id', questionId)
        .eq('session_id', sessionId)
        .eq('status', 'stopped')
        .select('*')
        .maybeSingle()
      if (error) throw error
      if (!data) return jsonResponse({ message: '這題目前不是停止狀態。' }, 409)
      return jsonResponse({ question: data })
    }

    // Editing an older flashcard deck is the teacher choosing to use that deck
    // again. Handle that as one server action: stop the question currently
    // accepting answers, revive the selected deck, then point the class at it.
    if (action === 'activate_question') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料格式不正確。' }, 400)
      const { data: target, error: targetError } = await supabase.from('questions')
        .select('id, type').eq('id', questionId).eq('session_id', sessionId).maybeSingle()
      if (targetError) throw targetError
      if (!target) return jsonResponse({ message: '找不到這個題目。' }, 404)

      const { data: liveSession, error: liveSessionError } = await supabase.from('sessions')
        .select('status').eq('id', sessionId).maybeSingle()
      if (liveSessionError) throw liveSessionError
      if (liveSession?.status !== 'active') return jsonResponse({ message: '課堂已結束。' }, 409)

      const now = new Date().toISOString()
      const { error: stopError } = await supabase.from('questions')
        .update({ status: 'stopped', stopped_at: now })
        .eq('session_id', sessionId).eq('status', 'active').neq('id', questionId)
      if (stopError) throw stopError
      const { data: question, error: questionError } = await supabase.from('questions')
        .update({ status: 'active', stopped_at: null, started_at: now })
        .eq('id', questionId).eq('session_id', sessionId).select('*').single()
      if (questionError) throw questionError
      const { error: sessionError } = await supabase.from('sessions')
        .update({ current_question_id: questionId }).eq('id', sessionId).eq('status', 'active')
      if (sessionError) throw sessionError
      return jsonResponse({ question })
    }

    if (action === 'get_recording_results') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料格式不正確。' }, 400)
      const { data: question, error: questionError } = await supabase
        .from('questions')
        .select('id, status, type')
        .eq('id', questionId)
        .eq('session_id', sessionId)
        .maybeSingle()
      if (questionError) throw questionError
      if (!question || !['pronunciation', 'oral_response'].includes(question.type)) {
        return jsonResponse({ message: '找不到錄音題目。' }, 404)
      }
      if (question.status === 'active') return jsonResponse({ responses: [] })

      const { data: responses, error } = await supabase
        .from('audio_responses')
        .select('id, session_id, question_id, participant_id, participant_name, storage_path, mime_type, duration_ms, analysis_status, detected_language, transcript, score, analysis_json, error_message, submitted_at, analyzed_at')
        .eq('question_id', questionId)
        .order('submitted_at')
      if (error) throw error
      const signedResponses = await Promise.all((responses || []).map(async (response) => {
        const { data: signed } = await supabase.storage.from('lingoact-recordings').createSignedUrl(response.storage_path, 3600)
        const { storage_path: _storagePath, ...safeResponse } = response
        return { ...safeResponse, signed_url: signed?.signedUrl || null }
      }))
      return jsonResponse({ responses: signedResponses })
    }

    if (action === 'get_session_recording_results') {
      const { data: responses, error } = await supabase
        .from('audio_responses')
        .select('id, session_id, question_id, participant_id, participant_name, mime_type, duration_ms, analysis_status, detected_language, transcript, score, analysis_json, error_message, submitted_at, analyzed_at')
        .eq('session_id', sessionId)
        .order('submitted_at')
      if (error) throw error
      return jsonResponse({ responses: responses || [] })
    }

    if (action === 'grade_question') {
      const questionId = input.questionId
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料格式不正確。' }, 400)
      const { data: question, error: questionError } = await supabase
        .from('questions')
        .select('id, allow_multiple, options, status')
        .eq('id', questionId)
        .eq('session_id', sessionId)
        .maybeSingle()
      if (questionError) throw questionError
      if (!question || !['stopped', 'closed'].includes(question.status)) {
        return jsonResponse({ message: '題目尚未停止或不存在。' }, 409)
      }

      const available = new Set(normalizedOptions(question.options))
      const correctAnswers = normalizedOptions(input.correctAnswers).filter((answer) => available.has(answer))
      const expected = [...correctAnswers].sort()
      const { error: updateQuestionError } = await supabase
        .from('questions')
        .update({
          correct_answer: question.allow_multiple ? null : correctAnswers[0] || null,
          correct_answers: correctAnswers,
        })
        .eq('id', questionId)
      if (updateQuestionError) throw updateQuestionError

      const { data: answers, error: answerError } = await supabase
        .from('answers')
        .select('id, answer_value, answer_values')
        .eq('question_id', questionId)
        .eq('session_id', sessionId)
      if (answerError) throw answerError
      for (const answer of answers || []) {
        const values = Array.isArray(answer.answer_values) && answer.answer_values.length
          ? answer.answer_values
          : answer.answer_value
            ? [answer.answer_value]
            : []
        const actual = [...new Set(values)].sort()
        const isCorrect = expected.length
          ? actual.length === expected.length && actual.every((value, index) => value === expected[index])
          : null
        const { error } = await supabase.from('answers').update({ is_correct: isCorrect }).eq('id', answer.id)
        if (error) throw error
      }
      return jsonResponse({ correctAnswers })
    }

    if (action === 'end_session') {
      const endedAt = new Date().toISOString()
      const [sessionResult, questionResult] = await Promise.all([
        supabase
          .from('sessions')
          .update({
            status: 'ended',
            ended_at: endedAt,
            danmaku_enabled: false,
            recording_enabled: false,
            captions_enabled: false,
            caption_status: 'idle',
            current_question_id: null,
          })
          .eq('id', sessionId)
          .select('id, title, code, status, created_at, ended_at')
          .single(),
        supabase
          .from('questions')
          .update({ status: 'stopped', stopped_at: endedAt })
          .eq('session_id', sessionId)
          .eq('status', 'active'),
      ])
      if (sessionResult.error) throw sessionResult.error
      if (questionResult.error) throw questionResult.error
      return jsonResponse({ session: sessionResult.data })
    }

    if (action === 'delete_session') {
      const { data: screenshots, error: screenshotError } = await supabase
        .from('screenshots')
        .select('storage_path')
        .eq('session_id', sessionId)
      if (screenshotError) throw screenshotError

      const paths = (screenshots || [])
        .map((screenshot) => screenshot.storage_path)
        .filter((path): path is string => typeof path === 'string' && Boolean(path))
      for (let index = 0; index < paths.length; index += 100) {
        const { error: storageError } = await supabase.storage
          .from('lingoact-screenshots')
          .remove(paths.slice(index, index + 100))
        if (storageError) throw storageError
      }

      const { data: recordings, error: recordingListError } = await supabase
        .from('audio_responses')
        .select('storage_path')
        .eq('session_id', sessionId)
      if (recordingListError) throw recordingListError
      const recordingPaths = (recordings || []).map((recording) => recording.storage_path).filter(Boolean)
      for (let index = 0; index < recordingPaths.length; index += 100) {
        const { error: storageError } = await supabase.storage
          .from('lingoact-recordings')
          .remove(recordingPaths.slice(index, index + 100))
        if (storageError) throw storageError
      }

      const orphanRecordingPaths = await listStorageFiles(
        supabase,
        'lingoact-recordings',
        `sessions/${sessionId}/recordings`,
      )
      const knownRecordingPaths = new Set(recordingPaths)
      const orphanPaths = orphanRecordingPaths.filter((path) => !knownRecordingPaths.has(path))
      for (let index = 0; index < orphanPaths.length; index += 100) {
        const { error: storageError } = await supabase.storage
          .from('lingoact-recordings')
          .remove(orphanPaths.slice(index, index + 100))
        if (storageError) throw storageError
      }

      const { data: listeningClips, error: listeningListError } = await supabase
        .from('listening_clips')
        .select('storage_path')
        .eq('session_id', sessionId)
      if (listeningListError) throw listeningListError
      const listeningPaths = (listeningClips || []).map((clip) => clip.storage_path).filter(Boolean)
      for (let index = 0; index < listeningPaths.length; index += 100) {
        const { error: storageError } = await supabase.storage
          .from('lingoact-listening')
          .remove(listeningPaths.slice(index, index + 100))
        if (storageError) throw storageError
      }


      // 檔案傳送：清掉這場次底下所有教師分享與學生回傳的檔案。
      const filePrefix = `sessions/${sessionId}/files`
      const transferPaths = await listStorageFiles(supabase, 'lingoact-files', filePrefix)
      for (let index = 0; index < transferPaths.length; index += 100) {
        const { error: storageError } = await supabase.storage
          .from('lingoact-files')
          .remove(transferPaths.slice(index, index + 100))
        if (storageError) throw storageError
      }
      const { data: deletedSession, error: deleteError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId)
        .select('id')
        .maybeSingle()
      if (deleteError) throw deleteError
      if (!deletedSession) return jsonResponse({ message: '找不到要移除的場次，資料未變更。' }, 404)
      return jsonResponse({ deleted: true, sessionId })
    }

    if (action === 'share_content') {
      const body = typeof input.body === 'string' ? input.body.trim().slice(0, 5000) : ''
      const url = normalizedUrl(input.url)
      if (!body && !url) return jsonResponse({ message: '請輸入文字或網址。' }, 400)

      const { data, error } = await supabase
        .from('shared_contents')
        .insert({ session_id: sessionId, body: body || null, url })
        .select('*')
        .single()
      if (error) throw error
      return jsonResponse({ content: data })
    }

    if (action === 'draw_lottery') {
      const candidateIds = Array.isArray(input.candidateIds)
        ? [...new Set(input.candidateIds.filter((id: unknown) => typeof id === 'string'))].slice(0, 2000)
        : []
      if (!candidateIds.length) return jsonResponse({ message: '目前沒有在線學員。' }, 400)

      const [{ data: participants, error: participantError }, { data: priorEvents, error: eventError }] = await Promise.all([
        supabase.from('participants').select('id, name').eq('session_id', sessionId).in('id', candidateIds),
        supabase
          .from('session_events')
          .select('payload')
          .eq('session_id', sessionId)
          .eq('event_type', 'lottery')
          .order('created_at', { ascending: false })
          .limit(5000),
      ])
      if (participantError) throw participantError
      if (eventError) throw eventError

      const candidates = (participants || []) as ParticipantRecord[]
      if (!candidates.length) return jsonResponse({ message: '目前沒有可抽選的在線學員。' }, 400)

      const latestRound = Math.max(1, ...((priorEvents || []).map((event) => Number(event.payload?.round) || 1)))
      const drawnThisRound = new Set(
        (priorEvents || [])
          .filter((event) => (Number(event.payload?.round) || 1) === latestRound)
          .map((event) => event.payload?.winner_id)
          .filter((id): id is string => typeof id === 'string'),
      )
      let round = latestRound
      let eligible = candidates.filter((participant) => !drawnThisRound.has(participant.id))
      if (!eligible.length) {
        round += 1
        eligible = candidates
      }

      const winner = eligible[randomIndex(eligible.length)]
      const animationPool = shuffled(candidates).slice(0, 39)
      if (!animationPool.some((participant) => participant.id === winner.id)) animationPool.push(winner)
      const orderedPool = shuffled(animationPool)

      const payload = {
        round,
        winner_id: winner.id,
        winner_name: winner.name,
        candidate_count: candidates.length,
        candidate_names: orderedPool.map((participant) => participant.name),
        candidate_ids: orderedPool.map((participant) => participant.id),
        duration_ms: 6000,
        finalized: false,
      }
      const { data: event, error: insertError } = await supabase
        .from('session_events')
        .insert({ session_id: sessionId, event_type: 'lottery', payload })
        .select('*')
        .single()
      if (insertError) throw insertError
      return jsonResponse({ event })
    }

    if (action === 'start_buzzer') {
      const candidateIds = Array.isArray(input.candidateIds)
        ? [...new Set(input.candidateIds.filter((id: unknown) => typeof id === 'string'))].slice(0, 2000)
        : []
      if (!candidateIds.length) return jsonResponse({ message: '目前沒有在線學員。' }, 400)

      const [{ data: participants, error: participantError }, { data: priorEvents, error: eventError }] = await Promise.all([
        supabase.from('participants').select('id').eq('session_id', sessionId).in('id', candidateIds),
        supabase
          .from('session_events')
          .select('id, payload')
          .eq('session_id', sessionId)
          .eq('event_type', 'buzzer')
          .order('created_at', { ascending: false })
          .limit(20),
      ])
      if (participantError) throw participantError
      if (eventError) throw eventError

      const eligibleIds = (participants || []).map((participant) => participant.id)
      if (!eligibleIds.length) return jsonResponse({ message: '目前沒有可搶答的在線學員。' }, 400)

      const preparedAt = new Date()
      const finalizedAt = preparedAt.toISOString()
      await Promise.all(
        (priorEvents || [])
          .filter((event) => event.payload?.finalized !== true)
          .map((event) => supabase
            .from('session_events')
            .update({ payload: { ...event.payload, accepting: false, finalized: true, cancelled: true, finalized_at: finalizedAt } })
            .eq('id', event.id)),
      )

      const payload = {
        candidate_count: eligibleIds.length,
        candidate_ids: eligibleIds,
        prepared_at: finalizedAt,
        expires_at: new Date(preparedAt.getTime() + 5 * 60 * 1000).toISOString(),
        duration_ms: 6000,
        finalized: false,
        accepting: false,
      }
      const { data: event, error: insertError } = await supabase
        .from('session_events')
        .insert({ session_id: sessionId, event_type: 'buzzer', payload })
        .select('*')
        .single()
      if (insertError) throw insertError
      return jsonResponse({ event })
    }

    if (action === 'activate_buzzer') {
      const eventId = typeof input.eventId === 'string' ? input.eventId : ''
      if (!eventId) return jsonResponse({ message: '找不到這次搶答。' }, 400)

      const { data: currentEvent, error: eventError } = await supabase
        .from('session_events')
        .select('*')
        .eq('id', eventId)
        .eq('session_id', sessionId)
        .eq('event_type', 'buzzer')
        .maybeSingle()
      if (eventError) throw eventError
      if (!currentEvent || currentEvent.payload?.finalized || currentEvent.payload?.cancelled) {
        return jsonResponse({ message: '這次搶答已失效。' }, 409)
      }
      if (currentEvent.payload?.accepting === true) return jsonResponse({ event: currentEvent })
      const readyExpiresAt = Date.parse(currentEvent.payload?.expires_at || '')
      if (!Number.isFinite(readyExpiresAt) || readyExpiresAt <= Date.now()) {
        return jsonResponse({ message: '這次搶答準備已逾時，請重新開啟。' }, 409)
      }

      const startedAt = new Date()
      const payload = {
        ...currentEvent.payload,
        accepting: true,
        started_at: startedAt.toISOString(),
        expires_at: new Date(startedAt.getTime() + 60 * 1000).toISOString(),
      }
      const { data: event, error: updateError } = await supabase
        .from('session_events')
        .update({ payload })
        .eq('id', eventId)
        .select('*')
        .single()
      if (updateError) throw updateError
      return jsonResponse({ event })
    }

    if (action === 'select_lottery_winner') {
      const eventId = typeof input.eventId === 'string' ? input.eventId : ''
      const winnerId = typeof input.winnerId === 'string' ? input.winnerId : ''
      if (!eventId || !winnerId) return jsonResponse({ message: '缺少抽籤結果資料。' }, 400)

      const { data: currentEvent, error: eventError } = await supabase
        .from('session_events')
        .select('*')
        .eq('id', eventId)
        .eq('session_id', sessionId)
        .eq('event_type', 'lottery')
        .maybeSingle()
      if (eventError) throw eventError
      if (!currentEvent) return jsonResponse({ message: '找不到這次抽籤。' }, 404)
      if (currentEvent.payload?.finalized) return jsonResponse({ event: currentEvent })

      const candidateIds = Array.isArray(currentEvent.payload?.candidate_ids)
        ? currentEvent.payload.candidate_ids.filter((id: unknown) => typeof id === 'string')
        : [currentEvent.payload?.winner_id].filter((id: unknown) => typeof id === 'string')
      if (!candidateIds.includes(winnerId)) return jsonResponse({ message: '這位學員不在本次抽籤名單中。' }, 400)

      const { data: winner, error: winnerError } = await supabase
        .from('participants')
        .select('id, name')
        .eq('id', winnerId)
        .eq('session_id', sessionId)
        .maybeSingle()
      if (winnerError) throw winnerError
      if (!winner) return jsonResponse({ message: '找不到抽中的學員。' }, 404)

      const payload = {
        ...currentEvent.payload,
        winner_id: winner.id,
        winner_name: winner.name,
        finalized: true,
      }
      const { data: event, error: updateError } = await supabase
        .from('session_events')
        .update({ payload })
        .eq('id', currentEvent.id)
        .select('*')
        .single()
      if (updateError) throw updateError

      const { error: resultEventError } = await supabase
        .from('session_events')
        .insert({ session_id: sessionId, event_type: 'lottery_result', payload })
      if (resultEventError) throw resultEventError

      return jsonResponse({ event })
    }

    return jsonResponse({ message: '不支援的講者操作。' }, 400)
  } catch (error) {
    const detail = errorDetail(error, 'Presenter action failed.')
    console.error('presenter-action failed', detail)
    if (/Only HTTP/.test(detail)) return jsonResponse({ message: '網址格式不正確，僅支援 http 或 https。' }, 400)
    if (/Gemini quiz generation failed \(429\)/.test(detail)) return jsonResponse({ message: 'AI 出題服務目前忙碌或已達速率限制，請稍候再試。' }, 429)
    if (/Gemini quiz generation failed \((500|502|503|504)\)/.test(detail)) return jsonResponse({ message: 'AI 出題服務暫時異常，系統已自動重試；請稍候再派送一次。' }, 502)
    if (/Gemini quiz generation request failed|timed out|TimeoutError|AbortError/i.test(detail)) return jsonResponse({ message: 'AI 出題服務連線逾時，請稍候再派送一次。' }, 504)
    if (/AI returned|AI did not follow|invalid answer key|needs at least|needs an accepted answer|has no prompt|unsupported question count/i.test(detail)) {
      return jsonResponse({ message: 'AI 產生的題目格式不完整，請調整出題方向後再試。' }, 422)
    }
    // Whoever runs this owns the project, so give them the real reason instead of
    // a generic apology they cannot act on.
    return jsonResponse({ message: `講者操作失敗：${detail.slice(0, 300)}` }, 500)
  }
})
