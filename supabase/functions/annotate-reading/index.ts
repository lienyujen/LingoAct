import { callAiJson, corsHeaders, errorDetail, jsonResponse } from '../_shared/ai.ts'
import { getAdminClient, hashPresenterToken } from '../_shared/supabase.ts'

// Deciding how each character should be read, and saying so in a way the font
// understands.
//
// Only polyphonic characters are put to the model. A character with one reading
// has nothing to decide, and asking anyway would invite the model to invent a
// reading the font cannot render. Even for the ambiguous ones the answer is an
// index into the font's own list, never free text: the worst case is the wrong
// reading, never a reading that does not exist.

// The base character alone already shows reading 0, so index n needs this.
const VS_BASE = 0xE01E0

const zhuyinSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    choices: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { at: { type: 'integer' }, index: { type: 'integer' } },
        required: ['at', 'index'],
      },
    },
  },
  required: ['choices'],
}

const pinyinSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    syllables: { type: 'array', items: { type: 'string' } },
  },
  required: ['syllables'],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ message: 'Method not allowed.' }, 405)

  try {
    const input = await req.json()
    const sessionId = typeof input.sessionId === 'string' ? input.sessionId : ''
    const presenterToken = typeof input.presenterToken === 'string' ? input.presenterToken : ''
    const text = typeof input.text === 'string' ? input.text.trim() : ''
    const mode = input.mode === 'pinyin' ? 'pinyin' : 'zhuyin'
    if (!sessionId || !presenterToken || !text) return jsonResponse({ message: '缺少標音所需資料。' }, 400)
    if (text.length > 4000) return jsonResponse({ message: '文字過長，請分段標音。' }, 400)

    const supabase = getAdminClient()
    const tokenHash = await hashPresenterToken(presenterToken)
    const { data: keyRecord } = await supabase
      .from('presenter_session_keys')
      .select('session_id')
      .eq('session_id', sessionId)
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (!keyRecord) return jsonResponse({ message: '講者權限驗證失敗。' }, 403)

    const characters = [...text]

    if (mode === 'pinyin') {
      // Pinyin needs no font, so there is no fixed list to choose from and the
      // model writes the syllables itself. Alignment is what matters: one entry
      // per character, blank for anything that is not a Han character.
      const result = await callAiJson(
        [
          'Give the Hanyu Pinyin reading of every character in the text, in order, one array entry per character.',
          'Use tone marks (nǐ hǎo), not tone numbers. Choose the reading the character takes in THIS context.',
          'For anything that is not a Han character — punctuation, spaces, Latin letters, digits, newlines — return an empty string in its slot.',
          'The array must contain exactly as many entries as the character count given.',
        ].join('\n'),
        { text, character_count: characters.length },
        pinyinSchema,
        null,
        'realtime',
      )
      if (result.status !== 'success') throw new Error('AI 標音沒有回應。')

      const syllables = (result.output as { syllables?: unknown })?.syllables
      const list = Array.isArray(syllables) ? syllables : []
      // A misaligned array would put every reading over the wrong character, so
      // it is padded or trimmed rather than trusted.
      const aligned = characters.map((_, index) => (typeof list[index] === 'string' ? list[index] : ''))
      return jsonResponse({ mode, annotationText: JSON.stringify(aligned) })
    }

    const codepoints = [...new Set(characters.map((character) => character.codePointAt(0) as number))]
    const { data: rows, error: readingsError } = await supabase
      .from('bopomofo_readings')
      .select('codepoint, readings')
      .in('codepoint', codepoints)
    if (readingsError) throw readingsError

    const readingsBy = new Map<number, string[]>()
    for (const row of rows || []) readingsBy.set(row.codepoint, row.readings)

    // Only the ambiguous ones are worth a question.
    const ambiguous: { at: number; character: string; candidates: string[] }[] = []
    characters.forEach((character, at) => {
      const readings = readingsBy.get(character.codePointAt(0) as number)
      if (readings && readings.length > 1) ambiguous.push({ at, character, candidates: readings })
    })

    let chosen = new Map<number, number>()
    if (ambiguous.length) {
      const result = await callAiJson(
        [
          'This is a passage for a Chinese language class in Taiwan. Some characters have more than one reading.',
          'For each position listed in "positions", choose which of its candidate readings is correct IN THAT SENTENCE.',
          'Answer with the candidate index, counting from 0. You may only choose an index that is listed — never invent a reading.',
          'Judge from the word the character belongs to and the sense of the sentence, the way a Taiwanese teacher would read it aloud.',
          'Return one entry per listed position, echoing its "at" value.',
        ].join('\n'),
        {
          passage: text,
          positions: ambiguous.map((item) => ({
            at: item.at,
            character: item.character,
            candidates: item.candidates.map((reading, index) => ({ index, reading })),
          })),
        },
        zhuyinSchema,
        null,
        'realtime',
      )
      if (result.status !== 'success') throw new Error('AI 讀音判定沒有回應。')
      const choices = (result.output as { choices?: unknown })?.choices
      const list = Array.isArray(choices) ? choices as { at: number; index: number }[] : []

      const byPosition = new Map(ambiguous.map((item) => [item.at, item.candidates.length]))
      chosen = new Map(
        list
          .filter((choice) => {
            const count = byPosition.get(choice.at)
            // An index outside the font's list would select a glyph that is not
            // there; falling back to the first reading is wrong less often than
            // rendering nothing.
            return typeof count === 'number' && Number.isInteger(choice.index) && choice.index >= 0 && choice.index < count
          })
          .map((choice) => [choice.at, choice.index]),
      )
    }

    const annotated = characters
      .map((character, at) => {
        const index = chosen.get(at) ?? 0
        return index > 0 ? character + String.fromCodePoint(VS_BASE + index) : character
      })
      .join('')

    return jsonResponse({
      mode,
      annotationText: annotated,
      polyphonic: ambiguous.length,
      decided: chosen.size,
    })
  } catch (error) {
    console.error('annotate-reading failed', error)
    return jsonResponse({ message: errorDetail(error, '標音失敗。') }, 502)
  }
})
