import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { fixtureSql } from './live-test-db.mjs'
const project = process.env.LINGOACT_TEST_PROJECT
if (!project) throw new Error('Set LINGOACT_TEST_PROJECT and sign in to the Supabase CLI.')
const sessionId = randomUUID(), presenterToken = randomUUID() + randomUUID()
const hash = createHash('sha256').update(presenterToken).digest('hex')
async function call(body) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/presenter-action`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,presenterToken,...body}) })
  const data = await response.json()
  assert.equal(response.status,200,JSON.stringify(data))
  return data
}
let created = false
try {
  await fixtureSql(project, `insert into sessions(id,title,code,teaching_language,guidance_language,system_language,level_framework,level_code) values('${sessionId}','School grade QA','${sessionId}','en','en','en','en108','j'); insert into presenter_session_keys(session_id,token_hash) values('${sessionId}','${hash}');`)
  created = true
  for (const grade of ['j7','j8','j9','h1','h2','h3']) for (const suffix of ['','-foundation','-advanced']) {
    const code = grade + suffix
    const saved = await call({action:'update_session',teachingLanguage:'en',levelFramework:'en108',levelCode:code})
    assert.equal(saved.session.level_code,code)
    assert.equal(saved.session.teaching_language,'en','System interface language changed the subject to Chinese')
    assert.equal(saved.session.level_framework,'en108')
    assert.equal(saved.session.reading_annotation,'none')
  }
  const reading = await call({action:'dispatch_reading',sourceText:'We study English at school.',direction:'Use Grade 8.',verbatim:true,levelStretch:2})
  assert.equal(reading.passage.level_code,'j8')
  assert.equal(reading.question.level_stretch,2)
  const rows = await fixtureSql(project, `select level_code from sessions where id='${sessionId}'`)
  assert.equal(rows[0].level_code,'h3-advanced','Dispatch override changed the stored class default')
  console.log('PASS: all 18 school-grade/difficulty combinations save online; Grade 8 override and i+2 stay independent of the class default.')
} finally {
  if (created) { await call({action:'delete_session'}); console.log('Removed the isolated grade QA classroom.') }
}
