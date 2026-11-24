import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('npm:@supabase/supabase-js@') ? '@supabase/supabase-js' : specifier, context)
  },
})

const body = '用中文回覆。日本語の例もあります。ภาษาไทย · 한글 · English'
const sessionId = crypto.randomUUID()
const participantId = crypto.randomUUID()
const postId = crypto.randomUUID()

test('student discussion posts and replies preserve mixed-language text', async () => {
  const source = readFileSync(new URL('../src/components/ParticipantBoard.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('  const post = useCallback(')
  const end = source.indexOf('  async function submitLink()', start)
  const replyStart = source.indexOf('  async function submitReply(')
  const replyEnd = source.indexOf('\n  }', replyStart) + 4
  const operations = []
  const noOp = () => {}
  const check = ts.transpile(`${source.slice(start, end)}\n${source.slice(replyStart, replyEnd)}\n(async () => { await submitText(); await submitReply(parentId) })()`)
  const context = {
    useCallback: fn => fn, session: { id: sessionId, anonymous_enabled: false }, question: { id: 'board' },
    participant: { id: participantId, name: 'Learner' }, draft: body, replyDraft: body, parentId: postId,
    requireSupabase: () => ({ from(table) {
      assert.equal(table, 'board_posts')
      return { insert: async row => { operations.push(row); return { error: null } } }
    } }),
    loadMine: noOp, loadWall: noOp, setBusy: noOp, setDraft: noOp, setComposing: noOp,
    setReplyDraft: noOp, setReplyTo: noOp, setError: error => assert.equal(error, ''),
  }
  await vm.runInNewContext(check, context)
  assert.equal(operations.length, 2)
  assert.equal(operations[0].body, body)
  assert.equal(operations[1].body, body)
  assert.equal(operations[1].reply_to, postId)
})

test('editing a discussion post saves mixed-language text through participant-action', async () => {
  const originalFetch = globalThis.fetch
  const originalDeno = globalThis.Deno
  let handler, saved
  globalThis.Deno = {
    env: { get: key => ({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service' })[key] },
    serve: callback => { handler = callback },
  }
  globalThis.fetch = async (url, options) => {
    const target = new URL(url)
    assert.equal(target.hostname, 'example.supabase.co')
    if (target.pathname.endsWith('/participant_session_keys')) return Response.json({
      participant_id: participantId, participants: { id: participantId, session_id: sessionId, name: 'Learner', locale: 'en' },
    })
    assert.ok(target.pathname.endsWith('/board_posts'))
    if (options.method === 'PATCH') saved = JSON.parse(options.body)
    return Response.json({ id: postId, kind: 'text' })
  }
  try {
    await import('../supabase/functions/participant-action/index.ts')
    const response = await handler(new Request('https://example.supabase.co/functions/v1/participant-action', {
      method: 'POST', body: JSON.stringify({
        action: 'edit_board_post', sessionId, participantId, participantToken: 'x'.repeat(32), postId, body,
      }),
    }))
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal(saved.body, body)
  } finally {
    globalThis.fetch = originalFetch
    globalThis.Deno = originalDeno
  }
})
