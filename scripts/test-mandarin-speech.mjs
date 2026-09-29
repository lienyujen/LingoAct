// Exercises the deployed speech path, not merely the annotation prompt. The
// disposable session is removed through the product endpoint so its WAV leaves
// Storage together with its database rows.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

const project = process.env.LINGOACT_TEST_PROJECT
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!project || !token) throw new Error('Set LINGOACT_TEST_PROJECT and SUPABASE_ACCESS_TOKEN.')

const sessionId = randomUUID()
const presenterToken = randomUUID() + randomUUID()
const hash = (value) => createHash('sha256').update(value).digest('hex')
const text = '我和你一起去。'

async function sql(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Fixture SQL failed (${response.status}): ${await response.text()}`)
  return response.json()
}

async function invoke(name, body) {
  const response = await fetch(`https://${project}.supabase.co/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json()
  assert.equal(response.status, 200, JSON.stringify(result))
  return result
}

let removed = false
try {
  await sql(`
    insert into sessions(id,title,code) values('${sessionId}','Mandarin speech integration fixture','${sessionId}');
    insert into presenter_session_keys(session_id,token_hash) values('${sessionId}','${hash(presenterToken)}');
  `)
  const standard = await invoke('synthesize-listening', {
    sessionId, presenterToken, transcript: text, kind: 'passage', language: 'zh-tw', accent: 'standard_guoyu',
  })
  assert.equal(standard.reused, false)
  assert.match(standard.clip.voices.instruction, /hàn/)
  assert.ok(standard.clip.public_url)
  assert.ok(standard.clip.duration_ms > 0)

  const repeated = await invoke('synthesize-listening', {
    sessionId, presenterToken, transcript: text, kind: 'passage', language: 'zh-tw', accent: 'standard_guoyu',
  })
  assert.equal(repeated.reused, true)
  assert.equal(repeated.clip.id, standard.clip.id)

  await invoke('presenter-action', { action: 'delete_session', sessionId, presenterToken })
  removed = true
  console.log('Mandarin speech live fixture passed with a fresh stored WAV and the new cache key.')
} finally {
  if (!removed) await sql(`delete from sessions where id='${sessionId}'`)
}
