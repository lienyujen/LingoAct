import { callAiJson, errorDetail } from './ai.ts'
import { levelInstruction } from './proficiency.ts'
import { trackInstruction } from './teaching.ts'

// AI 批改 for 寫作教練, on the teacher's request and one student at a time.
//
// Feedback, not a mark. 寫作教練 was built unscored on purpose — the teacher
// reads the writing — and putting a number on a class's free writing would
// change what the activity is. What was missing is that reading thirty pieces
// takes thirty minutes, so this offers the teacher a first pass they can skim,
// correct and ignore. The score stays null.
//
// All of one student's fields go in one call: they are one piece of writing,
// and feedback on paragraph three that ignores paragraph one is the kind of
// thing a teacher notices immediately.
export type WritingReview = {
  fields: Array<{ itemId: string; zhTw: string; en: string }>
  overall: { zhTw: string; en: string }
}

const reviewSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item_id: { type: 'string' },
          feedback_zh_tw: { type: 'string' },
          feedback_en: { type: 'string' },
        },
        required: ['item_id', 'feedback_zh_tw', 'feedback_en'],
      },
    },
    overall_zh_tw: { type: 'string' },
    overall_en: { type: 'string' },
  },
  required: ['fields', 'overall_zh_tw', 'overall_en'],
}

const RULES = [
  'You are reading one learner\'s finished writing so their teacher does not have to read all thirty from cold. Write what the teacher would want to know at a glance.',
  'This is not marked and carries no score. Do not award one, do not grade it out of anything, and do not rank the learner.',
  'For each field: say in one or two sentences what the writing does, then name the language points worth raising — the ones that actually get in the way of meaning or that this class is currently practising. Quote the learner\'s own words when you point at something.',
  'Do not rewrite their sentences. The teacher may hand this feedback straight to the learner, and a corrected version handed over is a correction the learner never made.',
  'A field left empty or answered in a single word is worth saying so plainly and briefly; do not invent substance that is not there.',
  '`overall` is one short paragraph for the teacher: what this learner can do, and the one thing to work on next.',
  'Write the Traditional Chinese version first and make the English a faithful translation of it, not a second opinion.',
].join('\n')

export async function reviewWriting(input: {
  direction: string
  fields: Array<{ itemId: string; prompt: string; text: string }>
  trackId: string | null
  framework: string | null
  levelCode: string | null
}): Promise<WritingReview> {
  const systemPrompt = [
    RULES,
    trackInstruction(input.trackId),
    levelInstruction(input.framework, input.levelCode),
  ].join('\n\n')

  const result = await callAiJson(
    systemPrompt,
    {
      task: input.direction || null,
      fields: input.fields.map((field) => ({ item_id: field.itemId, prompt: field.prompt, written: field.text })),
    },
    reviewSchema,
  )
  if (result.status !== 'success') {
    throw new Error(errorDetail((result.output as { message?: string })?.message, '無法批改這份寫作。'))
  }

  const output = result.output as Record<string, unknown>
  const line = (value: unknown, limit: number) =>
    typeof value === 'string' ? value.trim().slice(0, limit) : ''
  const known = new Set(input.fields.map((field) => field.itemId))
  const fields = (Array.isArray(output.fields) ? output.fields : [])
    .map((raw) => {
      const entry = raw as Record<string, unknown>
      return {
        itemId: typeof entry.item_id === 'string' ? entry.item_id : '',
        zhTw: line(entry.feedback_zh_tw, 2000),
        en: line(entry.feedback_en, 2000),
      }
    })
    // A field id the model invented would write feedback onto nothing.
    .filter((field) => known.has(field.itemId) && field.zhTw)
  if (!fields.length) throw new Error('AI 沒有給出可用的回饋。')

  return {
    fields,
    overall: { zhTw: line(output.overall_zh_tw, 2000), en: line(output.overall_en, 2000) },
  }
}
