// Isolated NCACLS classroom: guidance may change, assessed material may not.
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { fixtureSql } from './live-test-db.mjs'
const project = process.env.LINGOACT_TEST_PROJECT
if (!project) throw new Error('Set LINGOACT_TEST_PROJECT and sign in to Supabase CLI.')
const sessionId = randomUUID(), questionId = randomUUID(), participantId = randomUUID()
const participantToken = randomUUID() + randomUUID()
const tokenHash = createHash('sha256').update(participantToken).digest('hex')
const vocabulary = [{word:'學校',gloss:{en:'A place where students learn.'}}]
const grammar = [{point:'因為……所以……',span:'因為今天下雨，所以我在家讀書。',note:{en:'Use 因為……所以…… to connect a reason with its result. Example: 因為今天下雨，所以我在家讀書。'}}]
const sql = query => fixtureSql(project,query)
let created = false
try {
 await sql(`
 insert into sessions(id,title,code,teaching_language,system_language,guidance_language,level_framework,level_code) values('${sessionId}','NCACLS translation QA','${sessionId}','huayu','zh-TW','zh-TW','tbcl','2');
 insert into participants(id,session_id,name,device_id) values('${participantId}','${sessionId}','QA learner','${participantId}');
 insert into participant_session_keys(participant_id,token_hash) values('${participantId}','${tokenHash}');
 insert into questions(id,session_id,type,status,title,prompt_text) values('${questionId}','${sessionId}','custom_quiz','stopped','閱讀練習','請閱讀文章並作答。');
 insert into reading_passages(session_id,question_id,body,vocabulary,grammar) values('${sessionId}','${questionId}','因為今天下雨，所以我在家讀書。','${JSON.stringify(vocabulary)}','${JSON.stringify(grammar)}');
 `)
 created = true
 async function invoke(locale) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/participant-action`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'get_reading_translation',sessionId,questionId,participantId,participantToken,locale}),signal:AbortSignal.timeout(120000)})
  const data = await response.json()
  assert.equal(response.status,200,JSON.stringify(data))
  return data
 }
 for (const locale of ['my','vi']) {
  let data = await invoke(locale)
  const deadline = Date.now()+120000
  while (data.status==='pending' && Date.now()<deadline) {
   await new Promise(resolve=>setTimeout(resolve,1500))
   data=await invoke(locale)
  }
  assert.ok(data.values?.['word:0'],`${locale} missing vocabulary explanation`)
  assert.ok(data.values?.['grammar:0'],`${locale} missing grammar explanation`)
  assert.match(data.values['grammar:0'],/因為……所以……/)
  assert.match(data.values['grammar:0'],/因為今天下雨，所以我在家讀書/)
  if(locale==='my') assert.match(data.values['grammar:0'],/[\u1000-\u109f]/)
  assert.deepEqual((await invoke(locale)).values,data.values,'Cached explanation changed')
  console.log(`${locale}: vocabulary and grammar translated, Chinese references retained, cache verified`)
 }
 const rows=await sql(`select body,vocabulary,grammar from reading_passages where question_id='${questionId}';`)
 assert.equal(rows[0].body,'因為今天下雨，所以我在家讀書。')
 assert.deepEqual(rows[0].vocabulary,vocabulary)
 assert.deepEqual(rows[0].grammar,grammar)
 console.log('Original assessed material unchanged')
} finally {
 if(created) {await sql(`delete from sessions where id='${sessionId}';`);console.log('QA classroom removed')}
}
