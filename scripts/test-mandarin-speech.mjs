import { fixtureSql } from './live-test-db.mjs'
// Exercises the deployed speech path, not merely the annotation prompt. The
// disposable session is removed through the product endpoint so its WAV leaves
// Storage together with its database rows.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'

const project = process.env.LINGOACT_TEST_PROJECT
if (!project) throw new Error('Set LINGOACT_TEST_PROJECT; sign in to the Supabase CLI or set SUPABASE_ACCESS_TOKEN.')

const sessionId = randomUUID()
const presenterToken = randomUUID() + randomUUID()
const hash = (value) => createHash('sha256').update(value).digest('hex')
const text = '中和的得和路得和永和的福和路接著，我和你暫時不會走錯路。'

const sql = query => fixtureSql(project, query)

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
  const clips = new Map()
  for (const accent of ['standard_guoyu', 'putonghua', 'taiwanese']) {
    const result = await invoke('synthesize-listening', {
      sessionId, presenterToken, transcript: text, kind: 'passage', language: 'zh-tw', accent,
    })
    assert.equal(result.reused, false)
    assert.ok(result.clip.public_url)
    assert.ok(result.clip.duration_ms > 0)
    assert.ok(result.clip.karaoke_cues.length >= 25, `${accent} returned too few spoken-character cues`)
    clips.set(accent, result.clip)
  }
  assert.match(clips.get('standard_guoyu').voices.instruction, /hàn/)
  assert.match(clips.get('standard_guoyu').voices.instruction, /zhàn/)
  assert.match(clips.get('putonghua').voices.instruction, /hé/)
  assert.match(clips.get('putonghua').voices.instruction, /zàn/)
  assert.match(clips.get('taiwanese').voices.instruction, /unmistakably Taiwanese cadence/)

  const repeated = await invoke('synthesize-listening', {
    sessionId, presenterToken, transcript: text, kind: 'passage', language: 'zh-tw', accent: 'standard_guoyu',
  })
  assert.equal(repeated.reused, true)
  assert.equal(repeated.clip.id, clips.get('standard_guoyu').id)

  await invoke('presenter-action', { action: 'delete_session', sessionId, presenterToken })
  removed = true
  console.log('All three Mandarin speech plans passed with complete audio, KTV cues and the new cache key.')
} finally {
  if (!removed) await sql(`delete from sessions where id='${sessionId}'`)
}
