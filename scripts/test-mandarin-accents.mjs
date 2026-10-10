import { fixtureSql } from './live-test-db.mjs'
// Confirms the deployed annotation function uses the same regional standard as
// speech. The fixture is one short sentence and its session is always removed.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

const project = process.env.LINGOACT_TEST_PROJECT
if (!project) throw new Error('Set LINGOACT_TEST_PROJECT; sign in to the Supabase CLI or set SUPABASE_ACCESS_TOKEN.')

const sessionId = randomUUID()
const presenterToken = randomUUID() + randomUUID()
const hash = (value) => createHash('sha256').update(value).digest('hex')
const text = '中和的得和路得和永和的福和路接著，我和你暫時不會走錯路。'

const sql = query => fixtureSql(project, query)

async function annotate(accent) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/annotate-reading`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, presenterToken, text, mode: 'pinyin', granularity: 'characters', accent }),
  })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  return JSON.parse(result.annotationText)
}

try {
  await sql(`
    insert into sessions(id,title,code) values('${sessionId}','Mandarin accent integration fixture','${sessionId}');
    insert into presenter_session_keys(session_id,token_hash) values('${sessionId}','${hash(presenterToken)}');
  `)
  const characters = [...text]
  const positions = (character) => characters.flatMap((item, index) => item === character ? [index] : [])
  const he = positions('和')
  const zan = characters.indexOf('暫')
  const bu = characters.indexOf('不')
  const standard = await annotate('standard_guoyu')
  const taiwanese = await annotate('taiwanese')
  const mainland = await annotate('putonghua')

  // Place and road names keep hé; only the two conjunctions change by region.
  assert.deepEqual(he.map((at) => standard[at]), ['hé', 'hé', 'hàn', 'hé', 'hé', 'hàn'])
  assert.deepEqual(he.map((at) => taiwanese[at]), ['hé', 'hé', 'hàn', 'hé', 'hé', 'hàn'])
  assert.deepEqual(he.map((at) => mainland[at]), ['hé', 'hé', 'hé', 'hé', 'hé', 'hé'])
  assert.equal(standard[zan], 'zhàn')
  assert.equal(taiwanese[zan], 'zhàn')
  assert.equal(mainland[zan], 'zàn')
  assert.equal(standard[bu], 'bú')
  assert.equal(taiwanese[bu], 'bú')
  assert.equal(mainland[bu], 'bú')
  console.log('All three Mandarin annotation plans passed the full road-name and sandhi fixture.')
} finally {
  await sql(`delete from sessions where id='${sessionId}'`)
}
