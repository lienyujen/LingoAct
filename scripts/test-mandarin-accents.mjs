// Confirms the deployed annotation function uses the same regional standard as
// speech. The fixture is one short sentence and its session is always removed.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

const project = process.env.LINGOACT_TEST_PROJECT
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!project || !token) throw new Error('Set LINGOACT_TEST_PROJECT and SUPABASE_ACCESS_TOKEN.')

const sessionId = randomUUID()
const presenterToken = randomUUID() + randomUUID()
const hash = (value) => createHash('sha256').update(value).digest('hex')
const text = '他希望每天都能和家人朋友在一起玩。'

async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Fixture SQL failed (${response.status}): ${await response.text()}`)
  return response.json()
}

async function annotate(accent) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/annotate-reading`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, presenterToken, text, mode: 'pinyin', granularity: 'words', accent }),
  })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  return result.words.find((word) => word.text === '和')?.pinyin
}

try {
  await sql(`
    insert into sessions(id,title,code) values('${sessionId}','Mandarin accent integration fixture','${sessionId}');
    insert into presenter_session_keys(session_id,token_hash) values('${sessionId}','${hash(presenterToken)}');
  `)
  assert.equal(await annotate('standard_guoyu'), 'hàn')
  assert.equal(await annotate('taiwanese'), 'hàn')
  assert.equal(await annotate('putonghua'), 'hé')
  console.log('Mandarin accent live fixture passed.')
} finally {
  await sql(`delete from sessions where id='${sessionId}'`)
}
