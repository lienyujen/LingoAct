import { MAX_RECORDING_SECONDS, recordingLimitMs } from '../_shared/recording-limits.ts'
import { isWrittenAssessment } from '../_shared/written-assessment.ts'
import { flashcardReviewTerm, translateFlashcardReview } from '../_shared/flashcard-review.ts'
import { hasRecordingTranscript, inspectRecording } from '../_shared/recording-validation.ts'
import { checkHanWriting, hanCharacters, usesTraditionalFlashcardHandwriting } from '../_shared/han-stroke-match.ts'
import type { Ink } from '../_shared/han-stroke-match.ts'
import { extractMoeStrokeXml, parseMoeStrokeTracks } from '../_shared/moe-stroke-xml.ts'
import { readingEvidenceSentences } from '../_shared/reading-evidence.ts'
import { recordingForClient } from '../_shared/recording-results.ts'
import { corsHeaders, jsonResponse, errorDetail } from '../_shared/ai.ts'
import { attachBoardUrls, BOARD_BUCKET, boardStoragePrefix } from '../_shared/board.ts'
import { analyzeAudioResponse, removeRecording } from '../_shared/audio-analysis.ts'
import { gradeCustomQuizAttempt, translateFlashcardItems } from '../_shared/custom-quiz.ts'
import { getAdminClient, hashParticipantToken } from '../_shared/supabase.ts'
import { askWritingCoach } from '../_shared/writing-coach.ts'
import { guidanceLanguageName, guidanceLanguages } from '../_shared/languages.ts'
import { cachedLearningTranslation, demandTranslationLocales, explanationSource, translateQuizFeedback, translateFileFeedback, translateAudioFeedback, type TranslationSource } from '../_shared/learning-translation.ts'
import { classFeedbackSettings } from '../_shared/feedback-language.ts'
import { classLevelInstruction } from '../_shared/teaching.ts'
import { prepareFlashcardAudioInBackground } from '../_shared/flashcard-audio.ts'
import { quizGenerationFailed } from '../_shared/quiz-state.ts'
import { participantTeachingCycle } from '../_shared/teaching-cycle.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

// How many times one field may be taken back to the coach. Bounded because an
// unbounded loop is both a bill and a way to never finish the writing.
const COACH_ROUNDS = 3

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validUuid(value: unknown) {
  return typeof value === 'string' && uuidPattern.test(value)
}

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

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

async function verifyParticipant(
  supabase: ReturnType<typeof getAdminClient>,
  sessionId: string,
  participantId: string,
  participantToken: string,
) {
  if (!validUuid(sessionId) || !validUuid(participantId) || participantToken.length < 32) return null
  const tokenHash = await hashParticipantToken(participantToken)
  const { data } = await supabase
    .from('participant_session_keys')
    .select('participant_id, participants!inner(id, session_id, name, locale)')
    .eq('participant_id', participantId)
    .eq('token_hash', tokenHash)
    .eq('participants.session_id', sessionId)
    .maybeSingle()
  const participant = data?.participants as unknown as { id: string; session_id: string; name: string; locale: string | null } | null
  return participant || null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ message: 'Method not allowed.' }, 405)

  let action = ''
  try {
    const input = await req.json()
    action = typeof input.action === 'string' ? input.action : ''
    const supabase = getAdminClient()

    if (action === 'join_session') {
      const reference = typeof input.sessionReference === 'string' ? input.sessionReference.trim() : ''
      const name = typeof input.name === 'string' ? input.name.trim().slice(0, 80) : ''
      const deviceId = typeof input.deviceId === 'string' ? input.deviceId.trim().slice(0, 200) : ''
      if (!reference || !name || !deviceId) return jsonResponse({ message: '姓名或場次資料不完整。' }, 400)

      const isId = validUuid(reference)
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq(isId ? 'id' : 'code', reference)
        .maybeSingle()
      if (sessionError) throw sessionError
      if (!session) return jsonResponse({ message: '找不到這個場次。' }, 404)
      if (!['active', 'ended'].includes(session.status)) return jsonResponse({ message: '這個場次目前無法加入。' }, 409)

      const { data: existing, error: existingError } = await supabase
        .from('participants')
        .select('*')
        .eq('session_id', session.id)
        .eq('device_id', deviceId)
        .maybeSingle()
      if (existingError) throw existingError

      // A real key is still issued after class: it cannot submit to an ended
      // session, but it can open the public study decks. A returning device gets
      // its original participant row and therefore its own private recording;
      // a new device gets no one else's recording, only the shared class cards.
      let participant = existing
      if (!participant) {
        const { data, error } = await supabase
          .from('participants')
          .insert({ session_id: session.id, name, device_id: deviceId })
          .select('*')
          .single()
        if (error) throw error
        participant = data
      }

      const participantToken = `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll('-', '')
      const tokenHash = await hashParticipantToken(participantToken)
      const { error: keyError } = await supabase
        .from('participant_session_keys')
        .upsert({ participant_id: participant.id, token_hash: tokenHash })
      if (keyError) throw keyError
      return jsonResponse({ session, participant, participantToken })
    }

    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : ''
    const participantId = typeof input.participantId === 'string' ? input.participantId : ''
    const participantToken = typeof input.participantToken === 'string' ? input.participantToken : ''
    if (action === 'get_stroke_reference' || action === 'submit_handwriting_check') {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: 'Participant authorization failed.' }, 403)
      const character = typeof input.character === 'string' ? input.character : ''
      if (!/^\p{Unified_Ideograph}$/u.test(character)) return jsonResponse({ message: '請指定一個漢字。' }, 400)
      const { data: room, error } = await supabase.from('sessions').select('teaching_language, level_framework, level_code')
        .eq('id', sessionId).maybeSingle()
      if (error) throw error
      const elementaryGuoyu = room?.teaching_language === 'guoyu' && room.level_framework === 'guoyu108' && /^g[1-6]$/.test(room.level_code || '')
      const traditionalDeck = action === 'submit_handwriting_check' && usesTraditionalFlashcardHandwriting(room?.teaching_language)
      if (!elementaryGuoyu && !traditionalDeck) {
        return jsonResponse({ message: '這項練習適用正體字詞卡及國小國語場次。' }, 403)
      }
      const { questionId, checkId } = input
      let ink: Ink = []
      if (action === 'submit_handwriting_check') {
        if (!validUuid(questionId) || !validUuid(checkId)) return jsonResponse({ message: '手寫檢查沒有題目。' }, 400)
        const raw = input.ink
        if (!Array.isArray(raw) || raw.length === 0 || raw.length > 64 || raw.some(stroke =>
          !Array.isArray(stroke) || stroke.length === 0 || stroke.length > 80 || stroke.some(point =>
            !point || ![point.x, point.y].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 320)))) {
          return jsonResponse({ message: '手寫筆跡格式不正確。' }, 400)
        }
        ink = raw.map(stroke => stroke.map(({ x, y }: { x: number; y: number }) => ({ x, y })))
        const { data: previous, error: previousError } = await supabase.from('handwriting_checks')
          .select('result,wrong_stroke,expected_strokes').eq('id', checkId).eq('session_id', sessionId)
          .eq('question_id', questionId).eq('participant_id', participantId).eq('character', character).maybeSingle()
        if (previousError) throw previousError
        if (previous) return jsonResponse({ check: previous })
        const [question, passage, quiz] = await Promise.all([
          supabase.from('questions').select('status').eq('id', questionId).eq('session_id', sessionId).maybeSingle(),
          supabase.from('reading_passages').select('vocabulary').eq('question_id', questionId).eq('session_id', sessionId).maybeSingle(),
          supabase.from('quizzes').select('id,requested_type').eq('question_id', questionId).eq('session_id', sessionId).maybeSingle(),
        ])
        if (question.error || passage.error || quiz.error) throw question.error || passage.error || quiz.error
        if (!question.data || question.data.status === 'draft') return jsonResponse({ message: '找不到已派送的手寫題目。' }, 404)
        if (!elementaryGuoyu && quiz.data?.requested_type !== 'flashcard') {
          return jsonResponse({ message: '這項練習適用正體字詞卡。' }, 403)
        }
        const words: string[] = (elementaryGuoyu ? passage.data?.vocabulary || [] : []).map((entry: { word: string }) => entry.word)
        if (quiz.data?.requested_type === 'flashcard') {
          const { data: items, error: itemError } = await supabase.from('quiz_items')
            .select('prompt_text,prompt_is_word,options').eq('quiz_id', quiz.data.id)
          if (itemError) throw itemError
          for (const item of items || []) words.push(...(item.prompt_is_word ? [item.prompt_text] : item.options || []))
        }
        if (!words.some(word => hanCharacters(word).includes(character))) {
          return jsonResponse({ message: '這個字不屬於此題。' }, 400)
        }
      }
      const url = new URL('https://stroke-order.learningweb.moe.edu.tw/dictView.jsp')
      url.searchParams.set('ID', String(character.codePointAt(0)))
      url.searchParams.set('WORD', character)
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return jsonResponse({ message: '教育部筆順資料目前無法讀取。' }, 503)
      const xml = extractMoeStrokeXml(await response.text(), character)
      if (!xml) return jsonResponse({ message: '教育部筆順網沒有這個字的筆順資料。' }, 404)
      if (action === 'get_stroke_reference') return jsonResponse({ xml })
      const tracks = parseMoeStrokeTracks(xml)
      if (!tracks.length || tracks.some(track => !track.length || track.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y)))) {
        return jsonResponse({ message: '教育部筆跡格式目前無法讀取。' }, 503)
      }
      const result = checkHanWriting(ink, tracks)
      const check = { result: result.status, wrong_stroke: result.status === 'stroke' ? result.stroke : null, expected_strokes: tracks.length }
      const { error: savedError } = await supabase.from('handwriting_checks').insert({
        id: checkId, session_id: sessionId, question_id: questionId, participant_id: participantId, character, ink, ...check,
      })
      if (savedError) {
        if (savedError.code !== '23505') throw savedError
        const { data: saved, error: retryError } = await supabase.from('handwriting_checks')
          .select('result,wrong_stroke,expected_strokes').eq('id', checkId).eq('session_id', sessionId)
          .eq('question_id', questionId).eq('participant_id', participantId).eq('character', character).single()
        if (retryError) throw retryError
        return jsonResponse({ check: saved })
      }
      return jsonResponse({ check })
    }

    if (action === 'submit_reading_evidence') {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: 'Participant authorization failed.' }, 403)
      const { questionId } = input
      const quote = typeof input.quote === 'string' ? input.quote : ''
      const explanation = typeof input.explanation === 'string' ? input.explanation.trim() : ''
      if (!validUuid(questionId) || !quote || quote.length > 8000 || !explanation || explanation.length > 500) {
        return jsonResponse({ message: '請選一句原文，並填寫 500 字以內的理由。' }, 400)
      }
      const [room, question, passage] = await Promise.all([
        supabase.from('sessions').select('status, current_question_id').eq('id', sessionId).maybeSingle(),
        supabase.from('questions').select('status, teaching_mode').eq('id', questionId).eq('session_id', sessionId).maybeSingle(),
        supabase.from('reading_passages').select('body').eq('question_id', questionId).eq('session_id', sessionId).maybeSingle(),
      ])
      if (room.error || question.error || passage.error) throw room.error || question.error || passage.error
      if (room.data?.status !== 'active' || room.data.current_question_id !== questionId ||
        question.data?.status !== 'active' || question.data.teaching_mode !== 'reading_evidence') {
        return jsonResponse({ message: 'This activity is closed.' }, 409)
      }
      if (!passage.data || !readingEvidenceSentences(passage.data.body).includes(quote)) {
        return jsonResponse({ message: 'Please choose a sentence from the displayed passage.' }, 400)
      }
      const { error } = await supabase.from('answers').insert({
        session_id: sessionId, question_id: questionId, participant_id: participant.id,
        participant_name: participant.name, answer_value: quote, answer_text: explanation,
      })
      if (error && error.code !== '23505') throw error
      const { data: answer, error: readError } = await supabase.from('answers').select('*')
        .eq('question_id', questionId).eq('participant_id', participant.id).single()
      if (readError) throw readError
      return jsonResponse({ answer })
    }

    if (action === 'get_reading_translation') {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: 'Participant authorization failed.' }, 403)
      const locale = typeof input.locale === 'string' ? input.locale : ''
      if (!demandTranslationLocales.has(locale)) return jsonResponse({ values: {} })
      if (!validUuid(input.questionId)) return jsonResponse({ message: 'Invalid question.' }, 400)
      const { data: readingQuestion, error: readingQuestionError } = await supabase.from('questions')
        .select('type, status').eq('id', input.questionId).eq('session_id', sessionId).maybeSingle()
      if (readingQuestionError) throw readingQuestionError
      if (!readingQuestion || readingQuestion.status === 'draft') return jsonResponse({ values: {} })
      if (readingQuestion.type === 'custom_quiz' && readingQuestion.status === 'active') {
        const { data: readingAttempt, error: readingAttemptError } = await supabase.from('quiz_attempts')
          .select('status').eq('question_id', input.questionId).eq('participant_id', participantId).maybeSingle()
        if (readingAttemptError) throw readingAttemptError
        if (!['graded', 'submitted', 'failed'].includes(readingAttempt?.status || '')) return jsonResponse({ values: {} })
      }
      const { data: passage, error } = await supabase.from('reading_passages')
        .select('vocabulary, grammar').eq('question_id', input.questionId).eq('session_id', sessionId).maybeSingle()
      if (error) throw error
      if (!passage) return jsonResponse({ values: {} })
      const sources: Record<string, TranslationSource> = {}
      const englishReferences: string[] = (passage.grammar || []).some((entry: { point: string }) => entry.point.startsWith('English: '))
        ? [...(passage.vocabulary || []).map((entry: { word: string }) => entry.word),
          ...(passage.grammar || []).map((entry: { span: string }) => entry.span)] : []
      for (const [index, entry] of (passage.vocabulary || []).entries()) {
        const source = explanationSource(entry.gloss)
        if (source && /^[A-Za-z]/.test(entry.word)) source.references = [...englishReferences, entry.word]
        if (source && !entry.gloss?.[locale]) sources[`word:${index}`] = source
      }
      for (const [index, entry] of (passage.grammar || []).entries()) {
        const source = explanationSource(entry.note)
        if (source && entry.point.startsWith('English: ')) source.references = englishReferences
        if (source && !entry.note?.[locale]) sources[`grammar:${index}`] = source
      }
      return jsonResponse(await cachedLearningTranslation(supabase, sessionId, locale, sources))
    }
    if (['teaching_context', 'teaching_pair_submit'].includes(action)) {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限驗證失敗。' }, 403)
      return await participantTeachingCycle(supabase, sessionId, participantId, input)
    }

    // Keeps last_seen_at meaningful — it was written once at join and never
    // again, so it always equalled joined_at — and accumulates the time the
    // page spent hidden, which tells the presenter who drifted away.
    if (action === 'heartbeat') {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限失效。' }, 403)
      const reported = Number(input.unfocusedMs)
      // A single report cannot exceed the interval by much; anything larger is a
      // clock jump rather than inattention.
      const unfocused = Number.isFinite(reported) ? Math.min(Math.max(Math.round(reported), 0), 30 * 60_000) : 0
      const streak = Number(input.focusStreakMs)
      const focusStreak = Number.isFinite(streak) ? Math.min(Math.max(Math.round(streak), 0), 12 * 60 * 60_000) : 0
      const { error } = await supabase.rpc('bump_participant_presence', {
        target_id: participantId,
        unfocused_delta: unfocused,
        focus_streak: focusStreak,
      })
      if (error) throw error

      const locale = guidanceLanguages.has(input.locale) ? input.locale as string : ''
      if (locale && locale !== participant.locale) {
        // Not fatal: a beat that fails to record the language costs a warm-up,
        // not the lesson, and the next beat will carry it again.
        const { error: localeError } = await supabase.from('participants')
          .update({ locale }).eq('id', participantId)
        if (localeError) console.warn('participant locale not stored', localeError.message)
      }
      return jsonResponse({ ok: true })
    }

    if (['get_flashcard_word_translations', 'get_custom_quiz', 'submit_custom_quiz', 'retry_custom_quiz_grading', 'submit_flashcard_try', 'ask_writing_coach'].includes(action)) {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限失效，請重新掃描 QR Code 加入場次。' }, 403)
      const questionId = typeof input.questionId === 'string' ? input.questionId : ''
      if (!validUuid(questionId)) return jsonResponse({ message: '測驗資料格式不正確。' }, 400)
      const { data: question, error: questionError } = await supabase.from('questions')
        .select('id, session_id, status, type, title, started_at, answer_seconds').eq('id', questionId).eq('session_id', sessionId).maybeSingle()
      if (questionError) throw questionError
      if (!question || question.type !== 'custom_quiz') return jsonResponse({ message: '找不到自訂測驗。' }, 404)
      const { data: quiz, error: quizError } = await supabase.from('quizzes').select('*')
        .eq('question_id', questionId).eq('session_id', sessionId).maybeSingle()
      if (quizError) throw quizError

      if (action === 'get_flashcard_word_translations') {
        if (quiz?.requested_type !== 'flashcard' || question.status === 'draft') return jsonResponse({ values: {} })
        const [{ data: cards, error: cardError }, { data: classroom, error: classError }] = await Promise.all([
          supabase.from('quiz_items').select('id, prompt_text, prompt_is_word').eq('quiz_id', quiz.id).order('position'),
          supabase.from('sessions').select('teaching_language, guidance_language').eq('id', sessionId).maybeSingle(),
        ])
        if (cardError || classError) throw cardError || classError
        if (!cards?.length) return jsonResponse({ values: {} })
        if (question.status === 'active') {
          const { data: attempt, error: attemptError } = await supabase.from('quiz_attempts').select('id')
            .eq('quiz_id', quiz.id).eq('participant_id', participantId).maybeSingle()
          if (attemptError) throw attemptError
          if (!attempt) return jsonResponse({ values: {} })
          const { count, error } = await supabase.from('quiz_item_answers').select('item_id', { count: 'exact', head: true })
            .eq('attempt_id', attempt.id).in('item_id', cards.map(card => card.id)).gt('score', 0)
          if (error) throw error
          if (count !== cards.length) return jsonResponse({ values: {} })
        }
        const { data: keys, error: keyError } = await supabase.from('quiz_item_keys').select('item_id, accepted_answers')
          .in('item_id', cards.map(card => card.id))
        if (keyError) throw keyError
        const answers = new Map((keys || []).map(key => [key.item_id, key.accepted_answers?.[0] as string | undefined]))
        const terms = cards.flatMap(card => {
          const answer = answers.get(card.id)
          return answer ? [flashcardReviewTerm(card, answer)] : []
        })
        const locale = guidanceLanguages.has(input.locale) ? String(input.locale) : 'en'
        return jsonResponse(await translateFlashcardReview(supabase, sessionId, locale, classroom?.teaching_language, terms, classroom?.guidance_language))
      }

      if (action === 'get_custom_quiz') {
        if (!quiz && quizGenerationFailed(question.title)) {
          return jsonResponse({ message: 'AI 出題暫時失敗，請等待教師重新派送。' }, 503)
        }
        if (!quiz) return jsonResponse({ generating: true })
        const [{ data: loadedItems, error: itemError }, { data: attempt, error: attemptError }] = await Promise.all([
          supabase.from('quiz_items').select('*').eq('quiz_id', quiz.id).order('position'),
          supabase.from('quiz_attempts').select('*').eq('quiz_id', quiz.id).eq('participant_id', participantId).maybeSingle(),
        ])
        if (itemError || attemptError) throw itemError || attemptError
        let items = loadedItems || []
        // The card and its answer are usable while TTS runs. The audio worker
        // claims each pending card once and nudges the parent when URLs arrive.
        if (quiz.requested_type === 'flashcard' && items.some(item => !item.audio_url && item.audio_status === 'pending')) {
          const audio = prepareFlashcardAudioInBackground(sessionId, quiz.id, questionId)
          if (question.status === 'active') {
            EdgeRuntime.waitUntil(audio)
          } else {
            // History has no live question refresh once the class ends.
            await audio
            const { data, error } = await supabase.from('quiz_items').select('*').eq('quiz_id', quiz.id).order('position')
            if (error) throw error
            items = data || []
          }
        }
        const requestedLocale = guidanceLanguages.has(input.locale) ? input.locale as string : ''
        const contentLocale = requestedLocale === 'zh-TW' ? 'zh_tw' : requestedLocale
        if (input.deferFlashcardTranslations !== true && quiz.requested_type === 'flashcard' && contentLocale && items.some((item) => !item.translations?.[contentLocale])) {
          try {
            const translated = await translateFlashcardItems(items.map((item) => ({
              id: item.id,
              prompt_text: item.prompt_text,
              options: item.options,
              prompt_is_word: item.prompt_is_word === true,
            })), guidanceLanguageName(requestedLocale))
            items = await Promise.all(items.map(async (item) => {
              const fields = translated.get(item.id)
              if (!fields || !Array.isArray(fields.options) || fields.options.length !== item.options.length) return item
              const translations = { ...(item.translations || {}), [contentLocale]: {
                prompt_text: fields.prompt_text || item.prompt_text,
                options: fields.options,
                pair_prompts: [],
              } }
              const { error } = await supabase.from('quiz_items').update({ translations }).eq('id', item.id)
              if (error) throw error
              return { ...item, translations }
            }))
          } catch (error) {
            // A translation outage must never make the original deck disappear.
            // The missing locale is retried on the next load and the student can
            // still study from the language the teacher dispatched meanwhile.
            console.warn('flashcard translation unavailable', errorDetail(error, 'translation failed'))
          }
        }
        let answers: unknown[] = []
        if (attempt) {
          const { data, error } = await supabase.from('quiz_item_answers').select('*').eq('attempt_id', attempt.id)
          if (error) throw error
          answers = data || []
        }
        // A learned card may be reviewed without exposing the rest of the key.
        // Once answering is stopped, the activity itself becomes the study
        // deck, so every card is deliberately revealed and remains available.
        const reviewAnswers = Object.fromEntries((answers as Array<{ item_id?: string; answer_values?: string[]; score?: number | null }>)
          .filter((answer) => Number(answer.score) > 0 && answer.item_id && answer.answer_values?.[0])
          .map((answer) => [answer.item_id as string, answer.answer_values![0]]))
        if (quiz.requested_type === 'flashcard' && question.status !== 'active' && (items || []).length) {
          const { data: keys, error: keyError } = await supabase.from('quiz_item_keys')
            .select('item_id, accepted_answers').in('item_id', (items || []).map((item) => item.id))
          if (keyError) throw keyError
          for (const key of keys || []) {
            const answer = (key.accepted_answers as string[])?.[0]
            if (answer) reviewAnswers[key.item_id] = answer
          }
        }
        // The student's own coaching rounds, so a reload does not lose the
        // conversation they are in the middle of. Only their own: the table is
        // granted to nobody, and this is read with the service role.
        let coachTurns: unknown[] = []
        if (quiz.coaching) {
          const { data, error } = await supabase.from('writing_coach_turns')
            .select('id, item_id, round, draft, reply, created_at')
            .eq('question_id', questionId).eq('participant_id', participantId)
            .order('created_at')
          if (error) throw error
          coachTurns = data || []
        }
        let missedWords: string[] = []
        if (quiz.requested_type === 'flashcard' && attempt) {
          const { data: tries, error } = await supabase.from('quiz_item_tries').select('item_id')
            .eq('attempt_id', attempt.id).eq('correct', false)
          if (error) throw error
          const missed = new Set((tries || []).map(tryRow => tryRow.item_id))
          const missedItems = items.filter(item => missed.has(item.id))
          const needKeys = missedItems.filter(item => !item.prompt_is_word && !reviewAnswers[item.id]).map(item => item.id)
          if (needKeys.length) {
            const { data: keys, error: keyError } = await supabase.from('quiz_item_keys')
              .select('item_id, accepted_answers').in('item_id', needKeys)
            if (keyError) throw keyError
            for (const key of keys || []) {
              const answer = (key.accepted_answers as string[])?.[0]
              if (answer) reviewAnswers[key.item_id] = answer
            }
          }
          missedWords = [...new Set<string>(missedItems.map(item => item.prompt_is_word ? item.prompt_text : reviewAnswers[item.id]).filter(Boolean))]
        }
        if (quiz.requested_type !== 'flashcard' && attempt?.status === 'graded') {
          const missed = new Set((answers as Array<{ item_id: string; score: number | null }>)
            .filter(answer => answer.score === 0).map(answer => answer.item_id))
          const missedItems = items.filter(item => missed.has(item.id) && item.type === 'multiple_choice')
          if (missedItems.length) {
            const { data: reading, error: readingError } = await supabase.from('reading_passages')
              .select('vocabulary, level_framework, level_code').eq('question_id', questionId).eq('session_id', sessionId).maybeSingle()
            if (readingError) throw readingError
            if (reading?.level_framework === 'guoyu108' && /^g[1-6]$/.test(reading.level_code || '') && reading.vocabulary?.length) {
              const words = new Set((reading.vocabulary as Array<{ word: string }>).map(entry => entry.word))
              const { data: keys, error: keyError } = await supabase.from('quiz_item_keys')
                .select('accepted_answers').in('item_id', missedItems.map(item => item.id))
              if (keyError) throw keyError
              missedWords = [...new Set((keys || []).flatMap(key => (key.accepted_answers as string[] || []).filter(word => words.has(word))))]
            }
          }
        }
        const translated = await translateQuizFeedback(supabase, sessionId, requestedLocale, attempt, answers)
        return jsonResponse({ quiz, items: items || [], ...translated, coachTurns, reviewAnswers, missedWords })
      }

      if (!quiz) return jsonResponse({ message: '自訂測驗仍在出題中，請稍候。' }, 409)

      // 寫作教練 with the scaffolding on. One round: the student shows what they
      // have, the coach asks about it, and the student writes the next draft.
      // The coach never writes it for them — see _shared/writing-coach.ts.
      if (action === 'ask_writing_coach') {
        if (!quiz.coaching) return jsonResponse({ message: '這份寫作沒有開啟教練。' }, 400)
        const { data: liveSession } = await supabase.from('sessions')
          .select('status, teaching_language, guidance_language, level_framework, level_code')
          .eq('id', sessionId).maybeSingle()
        if (liveSession?.status !== 'active' || question.status !== 'active') {
          return jsonResponse({ message: '教師已停止作答。' }, 409)
        }

        const itemId = typeof input.itemId === 'string' ? input.itemId : ''
        const draft = typeof input.draft === 'string' ? input.draft.trim().slice(0, 4000) : ''
        if (!validUuid(itemId) || !draft) return jsonResponse({ message: '請先寫一點東西再問教練。' }, 400)

        const { data: item } = await supabase.from('quiz_items')
          .select('id, prompt_text').eq('id', itemId).eq('quiz_id', quiz.id).maybeSingle()
        if (!item) return jsonResponse({ message: '找不到這個欄位。' }, 404)

        const { data: earlier, error: earlierError } = await supabase.from('writing_coach_turns')
          .select('round, draft, reply').eq('question_id', questionId)
          .eq('item_id', itemId).eq('participant_id', participantId).order('round')
        if (earlierError) throw earlierError
        const round = (earlier?.length || 0) + 1
        // A bounded loop, because an unbounded one is both a bill and a way to
        // avoid ever finishing the writing.
        if (round > COACH_ROUNDS) {
          return jsonResponse({ message: `這個欄位已經問過 ${COACH_ROUNDS} 次了，把它寫完送出吧。`, rounds: earlier }, 429)
        }

        let reply
        try {
          reply = await askWritingCoach({
            fieldPrompt: item.prompt_text,
            direction: quiz.direction || '',
            draft,
            round,
            previous: (earlier || []).map((turn) => ({
              draft: turn.draft as string,
              questions: ((turn.reply as { questions?: string[] })?.questions || []),
            })),
            trackId: liveSession.teaching_language ?? null,
            framework: liveSession.level_framework ?? null,
            levelCode: liveSession.level_code ?? null,
            feedbackSettings: await classFeedbackSettings(supabase, sessionId),
            guidanceLanguage: liveSession.guidance_language ?? 'zh-TW',
          })
        } catch (error) {
          return jsonResponse({ message: errorDetail(error, '教練暫時無法回覆，請再試一次。') }, 503)
        }

        const { data: saved, error: turnError } = await supabase.from('writing_coach_turns').insert({
          session_id: sessionId,
          question_id: questionId,
          item_id: itemId,
          participant_id: participantId,
          round,
          draft,
          reply,
        }).select('id, item_id, round, draft, reply, created_at').single()
        if (turnError) throw turnError
        return jsonResponse({ turn: saved, roundsLeft: COACH_ROUNDS - round })
      }

      // One card at a time, marked here rather than in the browser.
      //
      // The deck's answer key is granted to nobody, which is what stops a
      // student reading it — so the only way a drill can say "wrong, try again"
      // straight away is to ask the server, one card per round trip. That is
      // also what makes the re-serve honest: the queue in the browser decides
      // WHEN a card comes back, never whether it was right.
      if (action === 'submit_flashcard_try') {
        if (quiz.requested_type !== 'flashcard') {
          return jsonResponse({ message: '這不是單字卡練習。' }, 400)
        }
        const { data: liveSession } = await supabase.from('sessions').select('status').eq('id', sessionId).maybeSingle()
        if (liveSession?.status !== 'active' || question.status !== 'active') {
          return jsonResponse({ message: '本題已停止作答。' }, 409)
        }

        const itemId = typeof input.itemId === 'string' ? input.itemId : ''
        if (!validUuid(itemId)) return jsonResponse({ message: '卡片資料不正確。' }, 400)
        const { data: item, error: itemLookupError } = await supabase.from('quiz_items')
          .select('id, options, type').eq('id', itemId).eq('quiz_id', quiz.id).maybeSingle()
        if (itemLookupError) throw itemLookupError
        if (!item) return jsonResponse({ message: '找不到這張卡片。' }, 404)

        const chosen = typeof input.answerValue === 'string' ? input.answerValue.trim().slice(0, 500) : ''
        if (!chosen || !(item.options as string[]).includes(chosen)) {
          return jsonResponse({ message: '選項不正確。' }, 400)
        }

        const { data: key, error: keyLookupError } = await supabase.from('quiz_item_keys')
          .select('accepted_answers').eq('item_id', itemId).maybeSingle()
        if (keyLookupError) throw keyLookupError
        const accepted = (key?.accepted_answers as string[]) || []
        const correct = accepted.includes(chosen)

        // The attempt is opened by the first card rather than at submit time:
        // a drill has no submit, it just runs until the deck is clear.
        let attemptId = ''
        const { data: existing } = await supabase.from('quiz_attempts')
          .select('id').eq('question_id', questionId).eq('participant_id', participantId).maybeSingle()
        if (existing) {
          attemptId = existing.id
        } else {
          attemptId = crypto.randomUUID()
          const { error: attemptError } = await supabase.from('quiz_attempts').insert({
            id: attemptId,
            session_id: sessionId,
            question_id: questionId,
            quiz_id: quiz.id,
            participant_id: participantId,
            participant_name: participant.name,
            // A deck is never marked out of a hundred; what the teacher wants
            // from it is which cards were missed and how often.
            status: 'submitted',
            total_score: null,
            graded_at: new Date().toISOString(),
          })
          // Two cards answered at once would both try to open the attempt.
          if (attemptError && attemptError.code !== '23505') throw attemptError
          if (attemptError) {
            const { data: raced } = await supabase.from('quiz_attempts')
              .select('id').eq('question_id', questionId).eq('participant_id', participantId).single()
            if (!raced) throw new Error('找不到作答紀錄。')
            attemptId = raced.id
          }
        }

        const { error: tryError } = await supabase.from('quiz_item_tries').insert({
          attempt_id: attemptId,
          item_id: itemId,
          answer_values: [chosen],
          correct,
        })
        if (tryError) throw tryError

        // quiz_item_answers keeps its meaning: the answer that stands. A card
        // answered wrongly and then right ends up recorded as right, which is
        // what the student ended on; the struggle is in the tries.
        const { error: answerError } = await supabase.from('quiz_item_answers').upsert({
          attempt_id: attemptId,
          item_id: itemId,
          answer_values: [chosen],
          score: correct ? 1 : 0,
        }, { onConflict: 'attempt_id,item_id' })
        if (answerError) throw answerError

        // The private tries are not published to Realtime. Wake the presenter's
        // existing answer subscription after every saved try, including retries;
        // inserting this before the try made the first refresh read zero misses.
        const { error: progressError } = await supabase.from('answers').upsert({
          session_id: sessionId,
          question_id: questionId,
          participant_id: participantId,
          participant_name: participant.name,
          answer_text: '[單字卡練習中]',
        }, { onConflict: 'question_id,participant_id' })
        if (progressError) throw progressError

        // Showing the right answer after a wrong try is what a flashcard IS —
        // you turn it over. It reveals one card, to a student who has already
        // answered it, in an activity that carries no mark.
        return jsonResponse({ correct, correctAnswer: correct ? null : accepted[0] || null })
      }

      const { data: activeSession, error: sessionError } = await supabase.from('sessions')
        .select('status').eq('id', sessionId).maybeSingle()
      if (sessionError) throw sessionError

      if (action === 'retry_custom_quiz_grading') {
        const { data: attempt, error: attemptError } = await supabase.from('quiz_attempts')
          .update({ status: 'grading', error_message: null, graded_at: null })
          .eq('quiz_id', quiz.id).eq('participant_id', participantId).eq('status', 'failed')
          .select('*').maybeSingle()
        if (attemptError) throw attemptError
        if (!attempt) return jsonResponse({ message: '目前沒有可重新評分的作答。' }, 409)
        EdgeRuntime.waitUntil(gradeCustomQuizAttempt(attempt.id))
        return jsonResponse({ attempt })
      }

      if (activeSession?.status !== 'active' || question.status !== 'active') {
        return jsonResponse({ message: '測驗已停止作答。' }, 409)
      }
      if (isWrittenAssessment(quiz) && question.answer_seconds && question.started_at &&
        Date.now() > Date.parse(question.started_at) + (question.answer_seconds + 3) * 1000) {
        return jsonResponse({ message: '作答時間已到。' }, 409)
      }
      const submittedAnswers = Array.isArray(input.answers) ? input.answers : []
      const { data: items, error: itemError } = await supabase.from('quiz_items').select('*')
        .eq('quiz_id', quiz.id).order('position')
      if (itemError) throw itemError
      if (!items?.length || submittedAnswers.length !== items.length) {
        return jsonResponse({ message: '請完成所有題目後再送出。' }, 400)
      }
      // Three types answer with a list rather than a sentence. 排序 and 配對
      // answer positionally — the nth value is the answer to the nth fragment or
      // left-hand item — so their lists must not be deduplicated: a student who
      // matches two words to the same translation is wrong, not shorter, and
      // collapsing the duplicate would silently shift every later pair.
      const listAnswerTypes = new Set(['multiple_choice', 'ordering', 'matching'])
      const pictureWriting = quiz.requested_type === 'picture_writing'
      const submittedByItem = new Map<string, { itemId: string; answerText?: string; answerValues?: string[] }>()
      for (const raw of submittedAnswers) {
        if (!raw || typeof raw !== 'object') return jsonResponse({ message: '作答資料格式不正確。' }, 400)
        const answer = raw as Record<string, unknown>
        const itemId = typeof answer.itemId === 'string' ? answer.itemId : ''
        if (!validUuid(itemId) || submittedByItem.has(itemId)) return jsonResponse({ message: '作答題號不正確。' }, 400)
        const answerText = typeof answer.answerText === 'string' ? answer.answerText.trim().slice(0, pictureWriting ? 6000 : 4000) : ''
        const answerValues = Array.isArray(answer.answerValues)
          ? answer.answerValues
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim().slice(0, 500))
            .filter(Boolean)
            .slice(0, 8)
          : []
        submittedByItem.set(itemId, { itemId, answerText, answerValues })
      }
      for (const item of items) {
        const submitted = submittedByItem.get(item.id)
        if (!submitted) return jsonResponse({ message: '作答題目不完整。' }, 400)
        if (item.type === 'multiple_choice') {
          // One choice may not be picked twice here, whatever the client sent.
          const chosen = [...new Set(submitted.answerValues || [])]
          if (!chosen.length || chosen.some((value) => !item.options.includes(value))) {
            return jsonResponse({ message: `第 ${item.position} 題的選項不正確。` }, 400)
          }
          submitted.answerValues = chosen
        } else if (item.type === 'ordering') {
          // Every fragment used exactly once, or the sequence is not a sequence.
          const values = submitted.answerValues || []
          const expected = (item.options as string[]) || []
          if (values.length !== expected.length || [...values].sort().join('\u0000') !== [...expected].sort().join('\u0000')) {
            return jsonResponse({ message: `第 ${item.position} 題的排序不完整。` }, 400)
          }
          if (pictureWriting) {
            let segments: Array<{ panelId?: unknown; text?: unknown }> = []
            try { segments = JSON.parse(submitted.answerText || '') } catch { /* handled below */ }
            if (!Array.isArray(segments) || segments.length !== expected.length || segments.some((segment, index) => segment?.panelId !== values[index] || typeof segment?.text !== 'string' || !segment.text.trim())) {
              return jsonResponse({ message: '請在每張圖下完成一段文字。' }, 400)
            }
            submitted.answerText = JSON.stringify(segments.map((segment) => ({ panelId: segment.panelId, text: String(segment.text).trim().slice(0, 1000) })))
          }
        } else if (item.type === 'matching') {
          // One choice per left-hand item, each of them an offered option.
          const values = submitted.answerValues || []
          const pairPrompts = (item.pair_prompts as string[]) || []
          if (values.length !== pairPrompts.length || values.some((value) => !item.options.includes(value)) || (quiz.interaction_mode && new Set(values).size !== values.length)) {
            return jsonResponse({ message: `請完成第 ${item.position} 題的配對。` }, 400)
          }
        } else if (!submitted.answerText) {
          return jsonResponse({ message: `請完成第 ${item.position} 題。` }, 400)
        }
      }

      // 寫作教練: the fields were the working-out and this is the piece. It
      // is required wherever the exercise asked for it, because an exercise
      // whose point is the article cannot be finished without one.
      const composing = quiz.graded === false && !pictureWriting && items.length > 1
      const composition = typeof input.composition === 'string' ? input.composition.trim().slice(0, 12000) : ''
      if (composing && !composition) {
        return jsonResponse({ message: '請先把各段整合成一篇文章再送出。' }, 400)
      }

      const attemptId = crypto.randomUUID()
      const { data: attempt, error: attemptError } = await supabase.from('quiz_attempts').insert({
        id: attemptId,
        session_id: sessionId,
        question_id: questionId,
        quiz_id: quiz.id,
        participant_id: participantId,
        participant_name: participant.name,
        composition: composition || null,
        status: 'grading',
      }).select('*').single()
      if (attemptError) {
        if (attemptError.code === '23505') return jsonResponse({ message: '這份測驗已經送出，不能修改答案。' }, 409)
        throw attemptError
      }
      try {
        const { error: answerError } = await supabase.from('quiz_item_answers').insert(items.map((item) => {
          const submitted = submittedByItem.get(item.id)!
          return {
            attempt_id: attemptId,
            item_id: item.id,
            answer_text: pictureWriting && item.type === 'ordering' ? submitted.answerText : listAnswerTypes.has(item.type) ? null : submitted.answerText,
            answer_values: listAnswerTypes.has(item.type) ? submitted.answerValues : null,
          }
        }))
        if (answerError) throw answerError
        const { error: placeholderError } = await supabase.from('answers').insert({
          session_id: sessionId,
          question_id: questionId,
          participant_id: participantId,
          participant_name: participant.name,
          answer_text: pictureWriting ? '[排序寫作已送出]' : '[自訂測驗評分中]',
        })
        if (placeholderError) throw placeholderError
      } catch (error) {
        await supabase.from('quiz_attempts').delete().eq('id', attemptId)
        throw error
      }

      if (quiz.graded === false || (!pictureWriting && items.every((item) => ['multiple_choice', 'ordering', 'matching'].includes(item.type)))) {
        await gradeCustomQuizAttempt(attemptId)
        const { data: gradedAttempt, error: gradedAttemptError } = await supabase.from('quiz_attempts')
          .select('*').eq('id', attemptId).single()
        if (gradedAttemptError) throw gradedAttemptError
        return jsonResponse({ attempt: gradedAttempt })
      }

      EdgeRuntime.waitUntil(gradeCustomQuizAttempt(attemptId))
      return jsonResponse({ attempt })
    }


    // 拍照描述: the description that goes with one photo, written or spoken.
    // Keyed on the file response rather than the question, because a student who
    // sends two photos describes each of them.
    if (['prepare_caption_recording', 'submit_caption'].includes(action)) {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限驗證失敗，請重新掃描 QR Code 加入。' }, 403)
      const responseId = typeof input.responseId === 'string' ? input.responseId : ''
      if (!validUuid(responseId)) return jsonResponse({ message: '照片資料不正確。' }, 400)

      const { data: fileResponse, error: fileError } = await supabase.from('file_responses')
        .select('id, question_id, participant_id, caption_audio_path')
        .eq('id', responseId).eq('session_id', sessionId).maybeSingle()
      if (fileError) throw fileError
      // Only the student who sent the photo may describe it.
      if (!fileResponse || fileResponse.participant_id !== participantId) {
        return jsonResponse({ message: '找不到這張照片。' }, 404)
      }
      const { data: question } = await supabase.from('questions')
        .select('status').eq('id', fileResponse.question_id).maybeSingle()
      if (question?.status !== 'active') return jsonResponse({ message: '教師已停止收件。' }, 409)

      if (action === 'prepare_caption_recording') {
        const fileSize = Number(input.fileSize)
        if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > 10 * 1024 * 1024) {
          return jsonResponse({ message: '錄音檔不可超過 10 MB。' }, 400)
        }
        const clipId = crypto.randomUUID()
        // Under the recordings prefix on purpose: deleting the class sweeps
        // everything below it, so a caption clip is cleaned up with the rest.
        const storagePath = `sessions/${sessionId}/recordings/captions/${responseId}/${clipId}.wav`
        const { data, error } = await supabase.storage.from('lingoact-recordings').createSignedUploadUrl(storagePath)
        if (error) throw error
        return jsonResponse({ clipId, storagePath, uploadToken: data.token })
      }

      const caption = typeof input.caption === 'string' ? input.caption.trim().slice(0, 2000) : ''
      const audioPath = typeof input.storagePath === 'string' ? input.storagePath : ''
      const durationMs = input.durationMs === undefined || input.durationMs === null ? null : Math.round(Number(input.durationMs))
      const values: Record<string, unknown> = {}

      if (audioPath) {
        const expectedPrefix = `sessions/${sessionId}/recordings/captions/${responseId}/`
        if (!audioPath.startsWith(expectedPrefix) || !audioPath.endsWith('.wav')) {
          return jsonResponse({ message: '錄音路徑不正確。' }, 400)
        }
        if (durationMs === null || !Number.isInteger(durationMs) || durationMs < 250 || durationMs > 180_000) {
          return jsonResponse({ message: '錄音長度不正確。' }, 400)
        }
        const { data: clip, error: downloadError } = await supabase.storage.from('lingoact-recordings').download(audioPath)
        if (downloadError || !clip) return jsonResponse({ message: '找不到已上傳的錄音。' }, 400)
        // A re-recorded description replaces the take before it rather than
        // leaving the first one behind in the bucket.
        if (fileResponse.caption_audio_path && fileResponse.caption_audio_path !== audioPath) {
          await supabase.storage.from('lingoact-recordings').remove([fileResponse.caption_audio_path])
        }
        values.caption_audio_path = audioPath
        values.caption_audio_duration_ms = durationMs
      } else if (caption) {
        values.caption = caption
      } else {
        return jsonResponse({ message: '請寫下或錄下你的說明。' }, 400)
      }

      const { data: updated, error: updateError } = await supabase.from('file_responses')
        .update(values).eq('id', responseId).select('id, caption, caption_audio_duration_ms').single()
      if (updateError) throw updateError
      return jsonResponse({ response: updated })
    }

    // Asking to be called on. A toggle rather than a one-way set, because a
    // student who puts a hand up and thinks better of it should be able to take
    // it down without waiting for the presenter to notice.
    if (action === 'set_hand') {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限失效。' }, 403)
      const raised = input.raised !== false
      const { data: participantState, error } = await supabase.from('participants')
        .update({ hand_raised_at: raised ? new Date().toISOString() : null })
        .eq('id', participantId)
        .eq('session_id', sessionId)
        .select('id, session_id, hand_raised_at').single()
      if (error) throw error
      return jsonResponse({ ok: true, participantState })
    }
    if (['prepare_board_upload', 'get_my_board_posts', 'withdraw_board_post', 'edit_board_post', 'toggle_board_reaction'].includes(action)) {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限驗證失敗，請重新掃描 QR Code 加入。' }, 403)

      // Before the board is revealed the class cannot read the table at all, so
      // a student's own cards have to come back through here. After it is
      // revealed the page reads the wall directly and this still answers,
      // which is what lets the composer show "you have used 2 of 3" either way.
      if (action === 'get_my_board_posts') {
        const questionId = typeof input.questionId === 'string' ? input.questionId : ''
        if (!validUuid(questionId)) return jsonResponse({ message: '題目資料不正確。' }, 400)
        const { data, error } = await supabase.from('board_posts')
          .select('*')
          .eq('question_id', questionId)
          .eq('session_id', sessionId)
          .eq('participant_id', participantId)
          .order('created_at')
        if (error) throw error
        return jsonResponse({ posts: attachBoardUrls(supabase, data || []) })
      }

      if (action === 'prepare_board_upload') {
        const questionId = typeof input.questionId === 'string' ? input.questionId : ''
        if (!validUuid(questionId)) return jsonResponse({ message: '題目資料不正確。' }, 400)
        const { data: question, error: questionError } = await supabase.from('questions')
          .select('id, status, type, board_formats').eq('id', questionId).eq('session_id', sessionId).maybeSingle()
        if (questionError) throw questionError
        if (!question || question.type !== 'board') return jsonResponse({ message: '找不到這個討論板。' }, 404)
        if (question.status !== 'active') return jsonResponse({ message: '討論板已經結束。' }, 409)

        const kind = typeof input.kind === 'string' ? input.kind : ''
        if (!['image', 'file', 'audio', 'drawing'].includes(kind)) return jsonResponse({ message: '這個格式不需要上傳。' }, 400)
        if (!(question.board_formats as string[] || []).includes(kind)) {
          return jsonResponse({ message: '這個討論板沒有開放這種回覆方式。' }, 409)
        }
        const fileName = typeof input.fileName === 'string' ? input.fileName.trim().slice(0, 200) : ''
        const fileSize = Number(input.fileSize)
        if (!fileName || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_UPLOAD_BYTES) {
          return jsonResponse({ message: '檔案資料不正確，單檔上限 200 MB。' }, 400)
        }
        const fileId = crypto.randomUUID()
        const storagePath = `${boardStoragePrefix(sessionId, questionId, participantId)}${fileId}/${storageSafeName(fileName)}`
        const { data, error } = await supabase.storage.from(BOARD_BUCKET).createSignedUploadUrl(storagePath)
        if (error) throw error
        const { data: publicData } = supabase.storage.from(BOARD_BUCKET).getPublicUrl(storagePath)
        return jsonResponse({ storagePath, uploadToken: data.token, publicUrl: publicData.publicUrl })
      }

      if (action === 'withdraw_board_post') {
        const postId = typeof input.postId === 'string' ? input.postId : ''
        if (!validUuid(postId)) return jsonResponse({ message: '貼文資料不正確。' }, 400)
        // Marked rather than removed: the report still shows it was written,
        // and the per-student limit cannot be reset by deleting and reposting.
        const { data, error } = await supabase.from('board_posts')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', postId)
          .eq('session_id', sessionId)
          .eq('participant_id', participantId)
          .is('deleted_at', null)
          .select('id').maybeSingle()
        if (error) throw error
        if (!data) return jsonResponse({ message: '找不到這則貼文，或它已經收回了。' }, 404)
        return jsonResponse({ ok: true })
      }

      // Fixing a typo without losing the card. Withdrawing and reposting was
      // the only way before, and it costs the student one of their allotted
      // cards — the count deliberately does not come back — so a spelling
      // mistake was effectively permanent.
      if (action === 'edit_board_post') {
        const postId = typeof input.postId === 'string' ? input.postId : ''
        if (!validUuid(postId)) return jsonResponse({ message: '貼文資料不正確。' }, 400)

        const { data: existing, error: readError } = await supabase.from('board_posts')
          .select('id, kind')
          .eq('id', postId)
          .eq('session_id', sessionId)
          .eq('participant_id', participantId)
          .is('deleted_at', null)
          .maybeSingle()
        if (readError) throw readError
        if (!existing) return jsonResponse({ message: '找不到這則貼文，或它已經收回了。' }, 404)

        const text = typeof input.body === 'string' ? input.body.trim().slice(0, 1000) : ''
        if (!text) return jsonResponse({ message: '內容不能是空的。' }, 400)

        // A link card carries its address in url and nothing in body, so that
        // is the field the student is actually looking at. Same scheme repair
        // the compose box does, for the same reason.
        const patch = existing.kind === 'link'
          ? { url: /^https?:\/\//i.test(text) ? text : `https://${text}` }
          : { body: text }

        const { data, error } = await supabase.from('board_posts')
          .update({ ...patch, edited_at: new Date().toISOString() })
          .eq('id', postId)
          .eq('session_id', sessionId)
          .eq('participant_id', participantId)
          .is('deleted_at', null)
          .select('id').maybeSingle()
        if (error) throw error
        if (!data) return jsonResponse({ message: '找不到這則貼文，或它已經收回了。' }, 404)
        return jsonResponse({ ok: true })
      }

      // A second tap takes the reaction back, which is why this is a toggle
      // rather than an insert: the page does not have to know what it already
      // sent, and two taps in quick succession cannot leave a duplicate.
      const postId = typeof input.postId === 'string' ? input.postId : ''
      if (!validUuid(postId)) return jsonResponse({ message: '貼文資料不正確。' }, 400)
      const emoji = typeof input.emoji === 'string' ? input.emoji.trim().slice(0, 8) : ''
      if (!emoji) return jsonResponse({ message: '沒有指定反應。' }, 400)
      const { data: post, error: postError } = await supabase.from('board_posts')
        .select('id, question_id, participant_id').eq('id', postId).eq('session_id', sessionId).maybeSingle()
      if (postError) throw postError
      if (!post) return jsonResponse({ message: '找不到這則貼文。' }, 404)
      // Not your own. Hiding the button on the page is a courtesy; this is the
      // rule. The counts are what the class reads the wall by, so a vote for
      // yourself is worth refusing rather than merely discouraging.
      if (post.participant_id === participantId) {
        return jsonResponse({ message: '不能對自己的貼文按讚。' }, 409)
      }
      const { data: board } = await supabase.from('questions')
        .select('board_revealed_at').eq('id', post.question_id).maybeSingle()
      if (!board?.board_revealed_at) return jsonResponse({ message: '討論板還沒有開放瀏覽。' }, 409)

      const { data: existing } = await supabase.from('board_reactions')
        .select('post_id').eq('post_id', postId).eq('participant_id', participantId).eq('emoji', emoji).maybeSingle()
      if (existing) {
        const { error } = await supabase.from('board_reactions')
          .delete().eq('post_id', postId).eq('participant_id', participantId).eq('emoji', emoji)
        if (error) throw error
        return jsonResponse({ reacted: false })
      }
      const { error: insertError } = await supabase.from('board_reactions')
        .insert({ post_id: postId, participant_id: participantId, session_id: sessionId, emoji })
      if (insertError) throw insertError
      return jsonResponse({ reacted: true })
    }

    if (['prepare_file_upload', 'submit_file_response'].includes(action)) {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限驗證失敗，請重新掃描 QR Code 加入。' }, 403)
      const questionId = typeof input.questionId === 'string' ? input.questionId : ''
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料不正確。' }, 400)
      const { data: question, error: questionError } = await supabase.from('questions')
        .select('id, status, type').eq('id', questionId).eq('session_id', sessionId).maybeSingle()
      if (questionError) throw questionError
      if (!question || !['file_upload', 'drawing'].includes(question.type)) return jsonResponse({ message: '找不到檔案上傳題。' }, 404)
      if (question.status !== 'active') return jsonResponse({ message: '教師已停止收件。' }, 409)

      const fileName = typeof input.fileName === 'string' ? input.fileName.trim().slice(0, 200) : ''
      const fileSize = Number(input.fileSize)
      if (!fileName || !Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_UPLOAD_BYTES) {
        return jsonResponse({ message: '檔案資料不正確，單檔上限 200 MB。' }, 400)
      }

      if (action === 'prepare_file_upload') {
        const fileId = crypto.randomUUID()
        const storagePath = `sessions/${sessionId}/files/responses/${questionId}/${participantId}/${fileId}/${storageSafeName(fileName)}`
        const { data, error } = await supabase.storage.from('lingoact-files').createSignedUploadUrl(storagePath)
        if (error) throw error
        return jsonResponse({ fileId, storagePath, uploadToken: data.token })
      }

      const storagePath = typeof input.storagePath === 'string' ? input.storagePath : ''
      const expectedPrefix = `sessions/${sessionId}/files/responses/${questionId}/${participantId}/`
      if (!storagePath.startsWith(expectedPrefix)) {
        return jsonResponse({ message: '檔案路徑不正確。' }, 400)
      }
      const mimeType = typeof input.mimeType === 'string' && input.mimeType.trim()
        ? input.mimeType.trim().slice(0, 150)
        : 'application/octet-stream'

      // A 電寫題 is one page, and sending a second one means the student
      // redrew it. Kept side by side they would be marked as two pages of one
      // answer — the marker reads a multi-file submission as chapters of the
      // same argument — so the first attempt would be graded alongside the
      // correction that was meant to replace it. An upload is the opposite: a
      // second photograph is page two, and both belong.
      if (question.type === 'drawing') {
        const { data: earlier } = await supabase.from('file_responses')
          .select('id, storage_path')
          .eq('question_id', questionId)
          .eq('participant_id', participantId)
        if (earlier?.length) {
          await supabase.storage.from('lingoact-files').remove(earlier.map((row) => row.storage_path))
          await supabase.from('file_responses').delete().in('id', earlier.map((row) => row.id))
        }
      }

      const { data: saved, error: insertError } = await supabase.from('file_responses').insert({
        session_id: sessionId,
        question_id: questionId,
        participant_id: participantId,
        participant_name: participant.name,
        name: fileName,
        mime_type: mimeType,
        file_size: fileSize,
        storage_path: storagePath,
      }).select('*').single()
      if (insertError) throw insertError

      // One placeholder answer per student keeps response counts and the presenter's
      // realtime refresh working the same way they do for recordings.
      const { count } = await supabase.from('answers')
        .select('id', { count: 'exact', head: true })
        .eq('question_id', questionId).eq('participant_id', participantId)
      if (!count) {
        await supabase.from('answers').insert({
          session_id: sessionId,
          question_id: questionId,
          participant_id: participantId,
          participant_name: participant.name,
          answer_text: '[已上傳檔案]',
        })
      }
      return jsonResponse({ response: saved })
    }

    // What the teacher's AI made of this student's own upload.
    //
    // 上傳作答 and 拍照描述 were marked and the marking stopped at the teacher's
    // panel: the student had no route to it at all, so pressing AI 批改 changed
    // nothing they could see. Their own rows only — the question and the
    // participant are both pinned, and the service role is what reads them.
    //
    // Shown as soon as it exists rather than waiting for the question to close:
    // there is no answer key to leak, the feedback is on their own photograph
    // and their own description, and a teacher who marks mid-activity means the
    // class to read it and go again.
    if (action === 'get_my_file_responses') {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限失效，請重新掃描 QR Code 加入場次。' }, 403)
      const questionId = typeof input.questionId === 'string' ? input.questionId : ''
      if (!validUuid(questionId)) return jsonResponse({ message: '題目資料不正確。' }, 400)
      const { data: question, error: questionError } = await supabase.from('questions')
        .select('id, type').eq('id', questionId).eq('session_id', sessionId).maybeSingle()
      if (questionError) throw questionError
      if (!question || !['file_upload', 'drawing'].includes(question.type)) return jsonResponse({ message: '找不到上傳題目。' }, 404)

      const { data: rows, error } = await supabase.from('file_responses')
        .select('id, question_id, name, mime_type, file_size, caption, analysis_status, analysis_json, error_message, submitted_at, analyzed_at, storage_path')
        .eq('question_id', questionId).eq('participant_id', participantId)
        .order('submitted_at')
      if (error) throw error
      // storage_path travels so the student can be shown the picture they
      // sent rather than the name it was stored under, which is a UUID and
      // says nothing about which photograph it was. The URL is built on the
      // page, against the backend that page actually joined — see fileLinks.ts
      // — and the bucket is public, so there is no token to go stale.
      return jsonResponse(await translateFileFeedback(supabase, sessionId, typeof input.locale === 'string' ? input.locale : '', rows || []))
    }
    if (['prepare_recording_upload', 'submit_recording', 'get_recording_result', 'discard_recording'].includes(action)) {
      const participant = await verifyParticipant(supabase, sessionId, participantId, participantToken)
      if (!participant) return jsonResponse({ message: '學員權限驗證失敗，請重新掃描 QR Code 加入。' }, 403)
      const questionId = typeof input.questionId === 'string' ? input.questionId : ''
      if (!validUuid(questionId)) return jsonResponse({ message: '錄音題目資料不正確。' }, 400)

      const { data: question, error: questionError } = await supabase
        .from('questions')
        .select('id, session_id, screenshot_id, listening_clip_id, type, status, prompt_text, learning_focus, answer_seconds')
        .eq('id', questionId)
        .eq('session_id', sessionId)
        .maybeSingle()
      if (questionError) throw questionError
      if (!question || !['pronunciation', 'oral_response'].includes(question.type)) {
        return jsonResponse({ message: '找不到錄音題目。' }, 404)
      }

      if (action === 'get_recording_result') {
        const { data: response, error } = await supabase
          .from('audio_responses')
          .select('id, session_id, question_id, participant_id, participant_name, mime_type, duration_ms, analysis_status, detected_language, transcript, score, analysis_json, error_message, submitted_at, analyzed_at, storage_path, attempt_number, previous_attempt')
          .eq('question_id', questionId)
          .eq('participant_id', participantId)
          .maybeSingle()
        if (error) throw error
        if (!response) return jsonResponse({ response: null })
        const safeResponse = await recordingForClient(supabase, response)
        const selected = typeof input.responseId === 'string' && input.responseId === (safeResponse.previous_attempt as { id?: string } | undefined)?.id
          ? safeResponse.previous_attempt : safeResponse
        return jsonResponse({ response: selected === safeResponse
          ? await translateAudioFeedback(supabase, sessionId, typeof input.locale === 'string' ? input.locale : '', safeResponse as never)
          : selected })
      }

      // What the teacher's AI made of this student's own upload.
      //
      // 上傳作答 and 拍照描述 were marked and the marking stopped at the teacher's
      // panel: the student had no route to it at all, so pressing AI 批改 改
      // nothing they could see. Their own rows only — the question and the
      // participant are both pinned, and the service role is what reads them.
      if (question.status !== 'active') return jsonResponse({ message: '本題已停止作答。' }, 409)

      const { data: activeSession, error: activeSessionError } = await supabase
        .from('sessions')
        .select('status,teaching_language,level_framework')
        .eq('id', sessionId)
        .maybeSingle()
      if (activeSessionError) throw activeSessionError
      if (activeSession?.status !== 'active') return jsonResponse({ message: '課程已經結束，無法送出錄音。' }, 409)

      const { data: existingTake, error: takeError } = await supabase.from('audio_responses')
        .select('id,attempt_number,analysis_status,previous_attempt').eq('question_id', questionId).eq('participant_id', participantId).maybeSingle()
      if (takeError) throw takeError
      const canRetry = question.type === 'pronunciation' && existingTake && existingTake.attempt_number < 2 && existingTake.analysis_status !== 'pending'
      const simplifiedRecording = activeSession?.teaching_language === 'putonghua' || activeSession?.level_framework === 'hsk'
      const retryMessage = activeSession?.teaching_language === 'en' ? 'You cannot submit another recording yet. Read-aloud practice allows two attempts.'
        : activeSession?.teaching_language === 'ja' ? '今は再提出できません。音読は2回まで提出できます。'
        : simplifiedRecording ? '暂时无法再次提交。朗读练习每题最多提交两次，请先等待当前录音评测完成。' : '暫時無法再次提交。朗讀練習每題最多提交兩次，請先等待目前錄音評測完成。'
      if (question.type === 'pronunciation' && action === 'discard_recording') return jsonResponse({ message: 'Read-aloud takes are retained for comparison.' }, 409)
      if (action === 'discard_recording') {
        if (question.status !== 'active') {
          return jsonResponse({ message: '本題已停止作答，無法重錄。' }, 409)
        }
        const { data: existing, error: existingError } = await supabase
          .from('audio_responses')
          .select('id, storage_path')
          .eq('question_id', questionId)
          .eq('participant_id', participantId)
          .maybeSingle()
        if (existingError) throw existingError
        if (existing) {
          await removeRecording(existing.storage_path)
          const { error: deleteError } = await supabase.from('audio_responses').delete().eq('id', existing.id)
          if (deleteError) throw deleteError
        }
        // The placeholder in answers is what blocks a second upload, so it goes
        // too — otherwise the student is told they have already submitted.
        const { error: answerError } = await supabase.from('answers').delete()
          .eq('question_id', questionId).eq('participant_id', participantId)
        if (answerError) throw answerError
        return jsonResponse({ discarded: true })
      }

      if (action === 'prepare_recording_upload') {
        const fileSize = Number(input.fileSize)
        if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > 10 * 1024 * 1024) {
          return jsonResponse({ message: '錄音檔不可超過 10 MB。' }, 400)
        }
        if (existingTake && !canRetry) return jsonResponse({ message: retryMessage }, 409)
        const recordingId = crypto.randomUUID()
        const storagePath = `sessions/${sessionId}/recordings/${questionId}/${participantId}/${recordingId}.wav`
        const { data, error } = await supabase.storage.from('lingoact-recordings').createSignedUploadUrl(storagePath)
        if (error) throw error
        return jsonResponse({ recordingId, storagePath, uploadToken: data.token })
      }

      const recordingId = typeof input.recordingId === 'string' ? input.recordingId : ''
      const storagePath = typeof input.storagePath === 'string' ? input.storagePath : ''
      const durationMs = Math.round(Number(input.durationMs))
      const expectedPath = `sessions/${sessionId}/recordings/${questionId}/${participantId}/${recordingId}.wav`
      const maxDurationMs = Math.min(MAX_RECORDING_SECONDS * 1000, recordingLimitMs(question.answer_seconds) + 1_000)
      if (!Number.isFinite(durationMs) || !validUuid(recordingId) || storagePath !== expectedPath || durationMs < 250 || durationMs > maxDurationMs) {
        return jsonResponse({ message: '錄音資料格式不正確。' }, 400)
      }
      const { data: audioBlob, error: downloadError } = await supabase.storage.from('lingoact-recordings').download(storagePath)
      if (downloadError || !audioBlob) return jsonResponse({ message: '找不到已上傳的錄音。' }, 400)
      if (audioBlob.size < 1 || audioBlob.size > 10 * 1024 * 1024) {
        await removeRecording(storagePath)
        return jsonResponse({ message: '錄音檔大小不符合限制。' }, 400)
      }

      const audioBuffer = await audioBlob.arrayBuffer()
      const audio = inspectRecording(audioBuffer)
      if (audio && audio.durationMs > maxDurationMs) {
        if (existingTake?.id !== recordingId && existingTake?.previous_attempt?.id !== recordingId) await removeRecording(storagePath)
        return jsonResponse({ message: simplifiedRecording ? '录音超过本题的作答时间。' : '錄音超過本題的作答時間。' }, 422)
      }
      if (!audio?.audible) {
        if (existingTake?.id !== recordingId && existingTake?.previous_attempt?.id !== recordingId) await removeRecording(storagePath)
        return jsonResponse({ message: simplifiedRecording
          ? '录音中没有可听见的声音，或文件不完整。请检查麦克风后重新录制。'
          : '錄音中沒有可聽見的聲音，或檔案不完整。請檢查麥克風後重新錄製。' }, 422)
      }

      const { data: saved, error: responseError } = await supabase.rpc('submit_recording_take', { p_take: {
        id: recordingId, session_id: sessionId, question_id: questionId, participant_id: participantId,
        participant_name: participant.name, storage_path: storagePath, duration_ms: audio.durationMs, file_size: audioBlob.size,
      } })
      if (responseError) {
        if (existingTake?.id !== recordingId && existingTake?.previous_attempt?.id !== recordingId) await removeRecording(storagePath)
        if (responseError.code === '23505' || /RECORDING_/.test(responseError.message || '')) return jsonResponse({ message: /RECORDING_CLOSED/.test(responseError.message || '') ? (simplifiedRecording ? '本题已停止作答，无法提交新录音。' : '本題已停止作答，無法提交新錄音。') : retryMessage }, 409)
        throw responseError
      }
      const response = { id: saved.id, analysis_status: saved.analysis_status, submitted_at: saved.submitted_at }
      if (saved.already_saved) return jsonResponse({ response })

      try {
        // A 朗讀發音 from 截圖派題 carries the screenshot the class was reading
        // from; one from 聽力播音室 carries no screenshot at all, because the
        // words are on the question itself. Demanding one failed every single
        // studio read-aloud with 「找不到錄音題目的截圖。」 while the recording sat
        // there perfectly playable.
        let screenshotUrl: string | null = null
        if (question.screenshot_id) {
          const { data: screenshot, error: screenshotError } = await supabase
            .from('screenshots')
            .select('public_url')
            .eq('id', question.screenshot_id)
            .single()
          if (screenshotError || !screenshot?.public_url) throw new Error('找不到錄音題目的截圖。')
          screenshotUrl = screenshot.public_url
        }
        const request = {
          mode: question.type as 'pronunciation' | 'oral_response',
          promptText: question.prompt_text,
          learningFocus: question.learning_focus,
          screenshotUrl,
          audioBytes: new Uint8Array(audioBuffer),
          audioMimeType: 'audio/wav',
        }
        let classInstruction = await classLevelInstruction(supabase, sessionId)
        if (question.listening_clip_id) {
          const { data: modelClip } = await supabase.from('listening_clips')
            .select('language, voices').eq('id', question.listening_clip_id).eq('session_id', sessionId).maybeSingle()
          if (modelClip?.language === 'en') {
            const accent = modelClip.voices?.accent === 'british' ? 'British English' : 'American English'
            classInstruction += `\nThe supplied model recording uses ${accent}. Discuss word stress, connected speech and intelligibility against that model. An intelligible accepted American or British variant is not a pronunciation error; describe a difference constructively rather than deducting marks for accent identity.`
          }
        }
        const feedbackSettings = await classFeedbackSettings(supabase, sessionId)
        let analysis = null
        let lastError: unknown = null
        for (let attempt = 0; attempt < 2 && !analysis; attempt += 1) {
          try {
            analysis = await analyzeAudioResponse({ ...request, classInstruction, feedbackSettings })
          } catch (error) {
            lastError = error
          }
        }
        if (!analysis) throw lastError || new Error('Audio analysis failed.')
        if (!hasRecordingTranscript(analysis.transcript)) throw new Error('NO_RECOGNIZABLE_SPEECH')
        await supabase.from('audio_responses').update({
          analysis_status: 'success',
          detected_language: analysis.detected_language,
          transcript: analysis.transcript,
          score: analysis.score,
          analysis_json: analysis,
          analyzed_at: new Date().toISOString(),
        }).eq('id', recordingId)
        await supabase.from('answers').update({ answer_text: '[錄音分析完成]' })
          .eq('question_id', questionId)
          .eq('participant_id', participantId)
      } catch (error) {
        const detail = errorDetail(error, 'Audio analysis failed.')
        console.error('audio analysis failed', detail)
        await supabase.from('audio_responses').update({
          analysis_status: 'failed',
          error_message: detail.slice(0, 1000),
          analyzed_at: new Date().toISOString(),
        }).eq('id', recordingId)
        await supabase.from('answers').update({ answer_text: '[錄音分析失敗]' })
          .eq('question_id', questionId)
          .eq('participant_id', participantId)
      }
      return jsonResponse({ response })
    }

    if (action !== 'claim_buzzer' || !sessionId || !participantId) {
      return jsonResponse({ message: '不支援的學員操作。' }, 400)
    }

    const eventId = typeof input.eventId === 'string' ? input.eventId : ''
    if (!eventId) return jsonResponse({ message: '找不到這次搶答。' }, 400)

    const [{ data: session, error: sessionError }, { data: participant, error: participantError }] = await Promise.all([
      supabase
        .from('sessions')
        .select('status')
        .eq('id', sessionId)
        .maybeSingle(),
      supabase
        .from('participants')
        .select('id')
        .eq('id', participantId)
        .eq('session_id', sessionId)
        .maybeSingle(),
    ])
    if (sessionError) throw sessionError
    if (participantError) throw participantError
    if (!session) return jsonResponse({ message: '找不到場次。' }, 404)
    if (session.status !== 'active') return jsonResponse({ message: '課程已經結束，無法再搶答。' }, 409)
    if (!participant) return jsonResponse({ message: '找不到這位學員。' }, 404)

    const { data, error } = await supabase.rpc('claim_buzzer', {
      p_event_id: eventId,
      p_session_id: sessionId,
      p_participant_id: participantId,
    })
    if (error) throw error

    const event = Array.isArray(data) ? data[0] : data
    if (!event) return jsonResponse({ message: '這次搶答已失效。' }, 404)
    if (!event.payload?.finalized && !event.payload?.winner_id) {
      return jsonResponse({ message: '主講者尚未開始搶答，或這次搶答已失效。', event }, 409)
    }
    return jsonResponse({ event, won: event.payload?.winner_id === participantId })
  } catch (error) {
    const detail = errorDetail(error, 'Participant action failed.')
    console.error('participant-action failed', detail)
    return jsonResponse({
      message: action === 'claim_buzzer'
        ? '搶答失敗，請稍後再試。'
        : action === 'join_session'
          ? '加入場次失敗，請稍後再試。'
          : '錄音處理失敗，請稍後再試。',
    }, 500)
  }
})
