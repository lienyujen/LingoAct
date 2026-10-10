// Opt-in real AI smoke test. Uses only an isolated classroom; cleans database
// and generated audio through the same deletion endpoint as a real classroom.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { fixtureSql } from './live-test-db.mjs'
const project = process.env.LINGOACT_TEST_PROJECT
if (!project) throw new Error('Set LINGOACT_TEST_PROJECT and sign in to the Supabase CLI.')
const sessionId = randomUUID(), clipId = randomUUID(), participantId = randomUUID()
const presenterToken = randomUUID() + randomUUID(), participantToken = randomUUID() + randomUUID()
const hash = value => createHash('sha256').update(value).digest('hex')
const transcript = 'Emma and Leo visit a library on Tuesday. Emma borrows a book about animals. Leo wants to learn about birds. They read together and talk about their favorite animals.'
async function invoke(name, body, statuses = [200]) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, ...body }), signal: AbortSignal.timeout(120000) })
  const data = await response.json()
  assert.ok(statuses.includes(response.status), `${name}/${body.action || ''}: ${response.status} ${JSON.stringify(data)}`)
  return data
}
const teacher = (body, statuses) => invoke('presenter-action', { presenterToken, ...body }, statuses)
const student = body => invoke('participant-action', { participantId, participantToken, ...body })
const english = text => assert.doesNotMatch(text, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u)
let created = false
try {
  await fixtureSql(project, `
    insert into sessions(id,title,code,teaching_language,guidance_language,system_language,level_framework,level_code) values('${sessionId}','English QA fixture','${sessionId}','en','en','en','cefr','A2');
    insert into presenter_session_keys(session_id,token_hash) values('${sessionId}','${hash(presenterToken)}');
    insert into participants(id,session_id,name,device_id) values('${participantId}','${sessionId}','QA learner','${participantId}');
    insert into participant_session_keys(participant_id,token_hash) values('${participantId}','${hash(participantToken)}');
    insert into listening_clips(id,session_id,source,kind,language,script,transcript,storage_path,public_url,duration_ms,content_hash) values('${clipId}','${sessionId}','text','passage','en',null,'${transcript}','fixtures/${clipId}.wav','https://example.com/fixture.wav',1000,'${clipId}');
  `)
  created = true
  const scope = process.env.LINGOACT_TEST_SCOPE
  const quizModes = scope === 'reading-audio' ? [] : scope === 'quiz-grading' ? ['multiple_choice', 'short_answer'] : ['multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching', 'writing', 'flashcard']
  for (const requestedType of quizModes) {
    const sent = await teacher({ action: 'create_custom_quiz', listeningClipId: clipId, direction: 'Use CEFR A2. Practice everyday library vocabulary and understanding the story.', requestedCount: 1, requestedType }, [202])
    let ready
    const deadline = Date.now() + 120000
    while (Date.now() < deadline) {
      const data = await teacher({ action: 'get_custom_quiz_results', questionId: sent.question.id }, [200, 202])
      if (data.quiz && data.items?.length) { ready = data; break }
      await new Promise(resolve => setTimeout(resolve, 1800))
    }
    assert.ok(ready, `${requestedType} did not finish generating`)
    assert.equal(ready.items.length, 1)
    english(ready.quiz.title)
    for (const item of ready.items) english([item.prompt_text, ...item.options, ...item.pair_prompts].join(' '))
    const received = await student({ action: 'get_custom_quiz', questionId: sent.question.id, locale: 'en' })
    assert.equal(received.items[0].id, ready.items[0].id, `${requestedType}: student cannot receive dispatched item`)
    assert.equal(received.quiz.requested_type, requestedType)
    console.log(`PASS: real English ${requestedType} generation and student delivery.`)
    if (['multiple_choice', 'short_answer'].includes(requestedType)) {
      const item = ready.items[0], key = ready.keys.find(key => key.item_id === item.id)
      assert.ok(key?.accepted_answers?.[0], 'Reference answer missing')
      await student({ action: 'submit_custom_quiz', questionId: sent.question.id, answers: [{ itemId: item.id, answerValues: requestedType === 'multiple_choice' ? key.accepted_answers : [], answerText: key.accepted_answers[0] }] })
      let marked
      const gradingDeadline = Date.now() + 90000
      while (Date.now() < gradingDeadline) {
        const data = await student({ action: 'get_custom_quiz', questionId: sent.question.id, locale: 'en' })
        if (data.attempt?.status === 'graded') { marked = data; break }
        assert.notEqual(data.attempt?.status, 'failed', 'AI grading failed')
        await new Promise(resolve => setTimeout(resolve, 1800))
      }
      assert.ok(marked, 'Grading did not complete')
      assert.ok(marked.attempt.total_score >= 0 && marked.attempt.total_score <= 100)
      english(marked.attempt.feedback.en)
      const localized = await student({ action: 'get_custom_quiz', questionId: sent.question.id, locale: 'zh-TW' })
      assert.match(localized.attempt.feedback.zh_tw, /\p{Script=Han}/u)
      assert.equal(localized.items[0].prompt_text, item.prompt_text, 'Guidance translated an exam question')
      assert.deepEqual(localized.items[0].options, item.options, 'Guidance translated exam options')
      console.log(`PASS: real ${requestedType} grading and optional TC feedback; assessment remains English.`)
    }
  }
  if (scope !== 'quiz-grading') {
  const reading = await teacher({ action: 'dispatch_reading', sourceText: transcript, direction: 'Use CEFR A2. Read about a visit to the library.', levelStretch: 1, withQuiz: false, accent: 'american' })
  assert.ok(reading.passage?.body)
  english(reading.passage.body)
  assert.equal(reading.passage.level_framework, 'cefr')
  assert.equal(reading.passage.level_code, 'A2')
  assert.equal(reading.question.level_stretch, 1)
  for (const entry of reading.passage.vocabulary) { english(entry.word); assert.ok(!entry.pinyin) }
  console.log('PASS: real English reading with vocabulary, grammar and i+1 metadata.')
  const audioText = 'Leo: Emma, do you know Alex?\nEmma: Yes, Alex is my friend. We study English together.'
  for (const accent of ['american', 'british']) {
    const audio = await invoke('synthesize-listening', { presenterToken, transcript: audioText, kind: 'dialogue', language: 'en', accent, speakers: ['Leo', 'Emma'] })
    assert.ok(audio.clip?.public_url)
    assert.ok(audio.clip.duration_ms > 0)
    assert.ok(audio.clip.karaoke_cues.length > 0)
    const file = await fetch(audio.clip.public_url)
    assert.equal(file.status, 200)
    assert.ok((await file.arrayBuffer()).byteLength > 1000)
    console.log(`PASS: real ${accent} dialogue audio, inline names, download and KTV cues.`)
  }
  }
} finally {
  if (created) {
    await teacher({ action: 'delete_session' })
    const rows = await fixtureSql(project, `select id from sessions where id='${sessionId}'`)
    assert.equal(rows.length, 0)
    console.log('Removed isolated English fixture and its generated audio.')
  }
}
