import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'

registerHooks({
  resolve(specifier, context, next) {
    return next(specifier.startsWith('npm:@supabase/supabase-js@') ? '@supabase/supabase-js' : specifier, context)
  },
})

const classId = crypto.randomUUID()

test('dispatch uses stored class level for same-language and multilingual instructions', async () => {
  const previousFetch = globalThis.fetch
  const previousDeno = globalThis.Deno
  let handler, classroom, model, stored
  let calls = 0, writes = 0
  globalThis.Deno = {
    env: { get: key => ({
      SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service',
      LINGOACT_OWNER_KEY: 'test-owner', GEMINI_API_KEY: 'test-key',
    })[key] },
    serve: callback => { handler = callback },
  }
  globalThis.fetch = async (url, options) => {
    const endpoint = new URL(url)
    if (endpoint.hostname === 'generativelanguage.googleapis.com') {
      calls++
      const request = JSON.parse(options.body)
      const input = JSON.parse(request.contents[0].parts[0].text)
      const instructions = request.systemInstruction.parts[0].text
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(model(input, instructions)) }] } }] })
    }
    const table = endpoint.pathname.split('/').at(-1)
    if (table === 'sessions' && options.method === 'GET') return Response.json(classroom)
    if (table === 'questions' && options.method === 'POST') {
      stored = { ...JSON.parse(options.body), id: crypto.randomUUID() }
      writes++
      return Response.json(stored, { status: 201 })
    }
    return Response.json([])
  }
  const send = fields => handler(new Request('https://example.supabase.co/functions/v1/presenter-action', {
    method: 'POST',
    body: JSON.stringify({ action: 'create_question', sessionId: classId, ownerKey: 'test-owner', questionType: 'short_answer', ...fields }),
  }))
  try {
    await import('../supabase/functions/presenter-action/index.ts')
    classroom = { teaching_language: 'huayu', level_framework: 'tbcl', level_code: '2' }
    model = ({ prompt }, instruction) => {
      assert.match(instruction, /TBCL/)
      assert.match(instruction, /Traditional Chinese/)
      assert.match(prompt, /描述此處正在進行的活動/)
      if (calls === 1) return { prompt: '請分析他們的活動。請說兩句話。', choices: [] }
      assert.match(instruction, /Replace these above-level words.*分析/)
      return { prompt: '他們在做什麼？請說兩句話。', choices: [] }
    }
    const chinese = await send({ promptText: '描述此處正在進行的活動，請講述兩句話。' })
    assert.equal(chinese.status, 200, await chinese.clone().text())
    assert.equal((await chinese.json()).question.prompt_text, stored.prompt_text)
    assert.equal(stored.prompt_text, '他們在做什麼？請說兩句話。')

    classroom = { teaching_language: 'en', level_framework: 'cefr', level_code: 'A2' }
    model = ({ prompt, choices }, instruction) => {
      assert.match(instruction, /A2/)
      assert.doesNotMatch(instruction, /working at C2/)
      assert.match(prompt, /⟦KEEP_0⟧/)
      assert.deepEqual(choices.map(choice => choice.index), [0, 1])
      return { prompt: 'Read ⟦KEEP_0⟧. Where is she going?', choices: [
        { index: 0, text: 'To the library' }, { index: 1, text: 'To school' },
      ] }
    }
    const english = await send({
      questionType: 'multiple_choice', levelCode: 'C2',
      promptText: '請讀「她去圖書館。」。她要去哪裡？', options: ['去圖書館', '去學校'],
    })
    assert.equal(english.status, 200, await english.clone().text())
    assert.equal(stored.prompt_text, 'Read 「她去圖書館。」. Where is she going?')
    assert.deepEqual(stored.options, ['To the library', 'To school'])

    classroom = { teaching_language: 'ja', level_framework: 'jlpt', level_code: 'N5' }
    model = (_, instruction) => {
      assert.match(instruction, /N5/)
      assert.match(instruction, /Japanese/)
      return { prompt: '毎朝、何をしますか。', choices: [] }
    }
    const japanese = await send({ action: 'open_photo_task', promptText: '每天早上做什麼？' })
    assert.equal(japanese.status, 200, await japanese.clone().text())
    assert.equal(stored.prompt_text, '毎朝、何をしますか。')

    classroom = { teaching_language: 'putonghua', level_framework: 'hsk', level_code: '2' }
    model = ({ prompt }, instruction) => {
      assert.match(instruction, /HSK/)
      assert.match(instruction, /Simplified Chinese/)
      assert.match(prompt, /What can you see here/)
      return { prompt: instruction.includes('Replace these above-level words') ? '这里有什么？' : '这里有哪些事物？', choices: [] }
    }
    const simplified = await send({ promptText: 'What can you see here?' })
    assert.equal(simplified.status, 200, await simplified.clone().text())
    assert.equal(stored.prompt_text, '这里有什么？')

    const beforeLiteral = calls
    await send({ questionType: 'pronunciation', promptText: '朗読する原文' })
    assert.equal(stored.prompt_text, '朗読する原文')
    await send({ useOriginalPrompt: true, promptText: '中文指示' })
    assert.equal(stored.prompt_text, '中文指示')
    assert.equal(calls, beforeLiteral)

    const beforeFailure = writes
    model = () => ({ prompt: 'Dropped the quotation.', choices: [] })
    const rejected = await send({ promptText: '讀「這段原文」。' })
    assert.ok(rejected.status >= 400)
    assert.match((await rejected.json()).message, /請重試/)
    assert.equal(writes, beforeFailure)

    const beforeOtherTracks = calls
    const original = '請析論人物在此段文字的處境與抉擇。'
    for (const [track, framework, level] of [['guoyu', 'guoyu108', 'g6'], ['ko', 'topik', '1']]) {
      classroom = { teaching_language: track, level_framework: framework, level_code: level }
      const kept = await send({ promptText: original })
      assert.equal(kept.status, 200, await kept.clone().text())
      assert.equal(stored.prompt_text, original)
    }
    assert.equal(calls, beforeOtherTracks)
  } finally {
    globalThis.fetch = previousFetch
    globalThis.Deno = previousDeno
  }
})
