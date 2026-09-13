// Isolated fixture: no real class rows are edited and no AI calls are made.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
const project = process.env.LINGOACT_TEST_PROJECT, token = process.env.SUPABASE_ACCESS_TOKEN
if (!project || !token) throw new Error('Set LINGOACT_TEST_PROJECT and SUPABASE_ACCESS_TOKEN.')
const session = randomUUID(), teacher = randomUUID() + randomUUID()
const students = Array.from({ length: 2 }, () => ({ id: randomUUID(), token: randomUUID() + randomUUID() }))
const hash = v => createHash('sha256').update(v).digest('hex')
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) })
  if (!r.ok) throw new Error(await r.text())
  return r.json()
}
async function call(endpoint, body, expected = 200) {
  const r = await fetch(`https://${project}.supabase.co/functions/v1/${endpoint}-action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session, ...body }) })
  const data = await r.json(); assert.equal(r.status, expected, JSON.stringify(data)); return data
}
const presenter = (body, status) => call('presenter', { presenterToken: teacher, ...body }, status)
const student = (i, body, status) => call('participant', { participantId: students[i].id, participantToken: students[i].token, ...body }, status)
const items = ['起床', '刷牙', '吃早餐', '上學']
try {
  await sql(`insert into sessions(id,title,code) values('${session}','Screenshot interaction fixture','${session}');
    insert into presenter_session_keys(session_id,token_hash) values('${session}','${hash(teacher)}');
    ${students.map((s,i) => `insert into participants(id,session_id,name,device_id) values('${s.id}','${session}','Fixture ${i}','${s.id}'); insert into participant_session_keys(participant_id,token_hash) values('${s.id}','${hash(s.token)}');`).join('\n')}`)
  const { question } = await presenter({ action: 'interaction_dispatch', kind: 'ordering', items, hasAnswer: false, sentenceMode: true })
  const data = await student(0, { action: 'get_custom_quiz', questionId: question.id })
  assert.equal(data.quiz.interaction_mode, true); assert.equal(data.items[0].sentence_mode, true)
  assert.equal(data.keys, undefined); assert.equal(data.items[0].accepted_answers, undefined)
  assert.equal(question.screenshot_id, null)
  const answer = (values) => ({ action: 'submit_custom_quiz', questionId: question.id, answers: [{ itemId: data.items[0].id, answerValues: values }] })
  await student(0, answer([items[0], items[0], items[2], items[3]]), 400)
  const a = await student(0, answer(items)), b = await student(1, answer([...items].reverse()))
  assert.equal(a.attempt.status, 'submitted'); assert.equal(a.attempt.total_score, null)
  assert.equal(b.attempt.status, 'submitted')
  await presenter({ action: 'interaction_key', questionId: question.id, values: items })
  const marked = await student(0, { action: 'get_custom_quiz', questionId: question.id })
  const wrong = await student(1, { action: 'get_custom_quiz', questionId: question.id })
  assert.equal(marked.attempt.total_score, 100); assert.equal(wrong.attempt.total_score, 0)
  assert.ok(!JSON.stringify(wrong.answers).includes(items.join(' → ')))
  await presenter({ action: 'interaction_key', questionId: question.id, values: [] })
  const unmarked = await student(0, { action: 'get_custom_quiz', questionId: question.id })
  assert.equal(unmarked.attempt.total_score, null); assert.equal(unmarked.answers[0].score, null)
  const repeated = await presenter({ action: 'teaching_repeat', questionId: question.id })
  const fresh = await student(0, { action: 'get_custom_quiz', questionId: repeated.question.id })
  assert.equal(fresh.quiz.interaction_mode, true); assert.equal(fresh.attempt, null)
  assert.equal((await student(0, { action: 'get_custom_quiz', questionId: question.id })).attempt.id, a.attempt.id)
  // Exercise matching validation/marking without paying for fixture generation.
  await sql(`update quizzes set requested_type='matching',graded=true where id='${fresh.quiz.id}'; update quiz_items set type='matching',pair_prompts='["A","B","C","D"]'::jsonb where id='${fresh.items[0].id}'; update quiz_item_keys set accepted_answers=array['起床','刷牙','吃早餐','上學'] where item_id='${fresh.items[0].id}';`)
  const match = values => ({ action: 'submit_custom_quiz', questionId: repeated.question.id, answers: [{ itemId: fresh.items[0].id, answerValues: values }] })
  await student(0, match([items[0],items[0],items[2],items[3]]), 400)
  assert.equal((await student(0, match(items))).attempt.total_score, 100)
  await presenter({ action: 'stop_question', questionId: repeated.question.id })
  await student(1, match(items), 409)
  if (process.env.LINGOACT_TEST_IMAGE) {
    const image = `data:image/png;base64,${(await readFile(process.env.LINGOACT_TEST_IMAGE)).toString('base64')}`
    const generated = await presenter({ action: 'interaction_dispatch', kind: 'matching', image, shareScreenshot: false, direction: '從截圖裡挑 3 個常用中文詞，配對簡短而不重複的中文解釋。' })
    const quiz = await student(0, { action: 'get_custom_quiz', questionId: generated.question.id })
    assert.equal(quiz.items[0].type, 'matching')
    assert.ok(quiz.items[0].options.length >= 3)
    assert.equal(quiz.items[0].options.length, quiz.items[0].pair_prompts.length)
    assert.equal(generated.question.screenshot_id, null)
    console.log('PASS: actual screenshot-to-AI matching dispatch, original image not shared.')
  }
  console.log('PASS: dispatch, hidden key, incomplete rejection, ungraded submit, deterministic regrading, key removal, new round, retained history, matching, stop enforcement.')
} finally {
  await sql(`delete from sessions where id='${session}' and title='Screenshot interaction fixture'`)
  console.log('Removed only the isolated fixture session.')
}
