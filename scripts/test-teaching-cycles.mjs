// An isolated live fixture exercises the deployed authentication boundary.
// No AI is invoked and the exact fixture session is removed in finally.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'

const project = process.env.LINGOACT_TEST_PROJECT
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!project || !token) throw new Error('Set LINGOACT_TEST_PROJECT and SUPABASE_ACCESS_TOKEN.')
const session = randomUUID(), original = randomUUID(), quizQuestion = randomUUID(), quiz = randomUUID(), item = randomUUID()
const teacher = randomUUID() + randomUUID()
const students = Array.from({ length: 3 }, () => ({ id: randomUUID(), token: randomUUID() + randomUUID() }))
const hash = value => createHash('sha256').update(value).digest('hex')
async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Fixture SQL failed (${response.status}): ${await response.text()}`)
  return response.json()
}
async function call(endpoint, body, status = 200) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/${endpoint}-action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session, ...body }),
  })
  const data = await response.json()
  assert.equal(response.status, status, JSON.stringify(data))
  return data
}
const presenter = (body, status) => call('presenter', { presenterToken: teacher, ...body }, status)
const learner = (index, body, status) => call('participant', { participantId: students[index].id, participantToken: students[index].token, ...body }, status)
try {
  await sql(`insert into sessions(id,title,code) values('${session}','Teaching cycle integration fixture','${session}');
    insert into presenter_session_keys(session_id,token_hash) values('${session}','${hash(teacher)}');
    ${students.map((s, i) => `insert into participants(id,session_id,name,device_id,joined_at) values('${s.id}','${session}','Fixture ${i}','${s.id}',now()+interval '${i} seconds');
      insert into participant_session_keys(participant_id,token_hash) values('${s.id}','${hash(s.token)}');`).join('\n')}
    insert into questions(id,session_id,type,status,title,prompt_text) values('${original}','${session}','short_answer','active','Original','Describe your choice.');
    update sessions set current_question_id='${original}' where id='${session}';
    insert into answers(session_id,question_id,participant_id,participant_name,answer_text) values('${session}','${original}','${students[0].id}','Fixture 0','My original words.');`)
  const repeated = await presenter({ action: 'teaching_repeat', questionId: original, focus: 'Add a reason.' })
  assert.notEqual(repeated.question.id, original)
  assert.equal(repeated.question.source_question_id, original)
  const own = await learner(0, { action: 'teaching_context', questionId: repeated.question.id })
  assert.equal(own.previous.text, 'My original words.')
  const other = await learner(1, { action: 'teaching_context', questionId: repeated.question.id })
  assert.equal(other.previous.text, '')
  await learner(0, { action: 'teaching_context', questionId: repeated.question.id, participantToken: 'x'.repeat(64) }, 403)
  const samples = await presenter({ action: 'teaching_samples', questionId: original })
  const discussion = await presenter({ action: 'teaching_discuss', questionId: original, focus: 'Which reason is missing?', sampleIds: [samples.samples[0].id] })
  assert.deepEqual(discussion.question.discussion_samples, [{ label: 'A', text: 'My original words.', images: [] }])

  await sql(`insert into questions(id,session_id,type,status,title,prompt_text) values('${quizQuestion}','${session}','custom_quiz','stopped','Writing','Write.');
    insert into quizzes(id,session_id,question_id,title,direction,requested_type,graded) values('${quiz}','${session}','${quizQuestion}','Writing','Use your own words.','writing',false);
    insert into quiz_items(id,quiz_id,position,type,prompt_text,points) values('${item}','${quiz}',1,'short_answer','Explain your choice.',100);
    insert into quiz_item_keys(item_id,rubric) values('${item}','Explain clearly.');`)
  const copied = await presenter({ action: 'teaching_repeat', questionId: quizQuestion, focus: 'Give one example.' })
  const rows = await sql(`select i.id,k.rubric from quiz_items i join quizzes z on z.id=i.quiz_id join quiz_item_keys k on k.item_id=i.id where z.question_id='${copied.question.id}'`)
  assert.equal(rows.length, 1)
  assert.notEqual(rows[0].id, item)
  assert.ok(rows[0].rubric.includes('Give one example.'))
  const followup = await presenter({ action: 'teaching_repeat', questionId: quizQuestion, focus: 'Write a question using homework.', responseType: 'short_answer' })
  assert.equal(followup.question.type, 'short_answer')
  assert.equal(followup.question.prompt_text, 'Write a question using homework.')
  assert.equal(followup.question.answer_seconds, null)
  assert.equal(followup.question.status, 'active')
  assert.equal((await sql(`select id from quizzes where question_id='${followup.question.id}'`)).length, 0)

  const paired = await presenter({ action: 'teaching_pair', questionId: original, focus: 'Agree on a time.', materialA: 'A secret: Monday', materialB: 'B secret: Tuesday', participantIds: students.slice(0, 2).map(s => s.id) })
  const pairId = paired.question.id
  const [a, b, outsider] = await Promise.all(students.map((_, i) => learner(i, { action: 'teaching_context', questionId: pairId })))
  assert.equal(a.material, 'A secret: Monday'); assert.equal(b.material, 'B secret: Tuesday')
  assert.ok(!JSON.stringify(a).includes('Tuesday')); assert.ok(!JSON.stringify(b).includes('Monday'))
  assert.equal(outsider.waiting, true)
  const concurrent = await Promise.all(students.slice(0, 2).map(s => fetch(`https://${project}.supabase.co/functions/v1/participant-action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'teaching_pair_submit', sessionId: session, questionId: pairId, participantId: s.id, participantToken: s.token, result: 'Wednesday' }),
  })))
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409])
  const saved = await sql(`select answer_text from answers where question_id='${pairId}'`)
  assert.equal(saved.length, 2); assert.ok(saved.every(r => r.answer_text === 'Wednesday'))
  await sql(`update questions set status='stopped' where id='${pairId}'; update sessions set status='ended' where id='${session}';`)
  assert.equal((await learner(1, { action: 'teaching_context', questionId: pairId })).result, 'Wednesday')
  await learner(0, { action: 'teaching_pair_submit', questionId: pairId, result: 'Thursday' }, 409)
  assert.equal((await sql(`select answer_text from answers where question_id='${original}'`))[0].answer_text, 'My original words.')
  console.log('PASS: repeat, quiz cloning, own-history isolation, anonymous discussion, private A/B materials, concurrent submission, post-class review.')
} finally {
  await sql(`delete from sessions where id='${session}' and title='Teaching cycle integration fixture'`)
  console.log('Removed isolated fixture session.')
}
