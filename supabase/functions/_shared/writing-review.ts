import { callAiJson, errorDetail } from './ai.ts'
import { levelInstruction } from './proficiency.ts'
import { trackInstruction } from './teaching.ts'

// AI 批改 for 寫作教練, on the teacher's request and one student at a time.
//
// Feedback and a mark, both of which the teacher can change before the class
// sees either. This was built unscored on purpose — a number on free writing
// changes what the activity is — but the piece is being read and corrected
// anyway, so withholding the mark only meant the teacher wrote one out by
// hand. It is a first pass to skim, adjust and send, never the last word:
// nothing reaches a learner until the teacher releases it.
//
// Written to the learner, in the second person. The same text is what they
// read on their own phone, and 這位學生能… is not something you say to
// someone about themselves.
//
// All of one student's fields go in one call: they are one piece of writing,
// and feedback on paragraph three that ignores paragraph one is the kind of
// thing a teacher notices immediately.
export type WritingReview = {
  fields: Array<{ itemId: string; zhTw: string; en: string }>
  overall: { zhTw: string; en: string }
  // Out of a hundred, judged against the level the class is set to rather than
  // against writing in general: the same piece is strong at one level and thin
  // at the next, and the teacher already told us which level this class is.
  score: number
  // The learner's own article with the corrections applied, plus what each one
  // was for. Only produced when there is an article to correct.
  //
  // The corrected TEXT rather than a diff: asked for a diff the model has to
  // reproduce the learner's sentences exactly to mark what it kept, and where
  // it slips the learner is shown a mangled version of their own writing. The
  // diff is computed from this and the original instead, so everything shown as
  // theirs is theirs.
  revision: { zhTw: string; notes: Array<{ before: string; after: string; why: string }> } | null
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
    score: { type: 'integer', minimum: 0, maximum: 100 },
    revised_composition: { type: 'string' },
    revision_notes: {
      type: 'array',
      // Ten is the schema ceiling Gemini accepts for maxItems, and ten marked
      // corrections is already more than a learner reads in one sitting.
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          before: { type: 'string' },
          after: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['before', 'after', 'why'],
      },
    },
  },
  required: ['fields', 'overall_zh_tw', 'overall_en', 'score', 'revised_composition', 'revision_notes'],
}

const RULES = [
  'You are reading one learner\'s finished writing. The teacher checks what you write and may change it, and then the learner reads it. Write it to the learner, briefly enough that the teacher can check it at a glance.',
  'Write to the LEARNER, not about them: 你, not 這位學生 — this is what they read on their own phone. The teacher reads the same text under the learner\'s name and needs no third person to follow it.',
  '`score` is a mark out of 100 for this piece, judged against the level this class is set to and the task it was given, not against writing in general. A piece that does what was asked at this level earns a strong mark; do not hold a beginner to a standard nobody set them.',
  'Do not mention the number anywhere in the feedback. The teacher may change it before the class sees it, and text arguing for a mark they have adjusted reads as a mistake.',
  'For each field: say in one or two sentences what the writing does, then name the language points worth raising — the ones that actually get in the way of meaning or that this class is currently practising. Quote the learner\'s own words when you point at something.',
  'In the per-field feedback, do not rewrite their sentences: name what is wrong and let them fix it.',
  'A field left empty or answered in a single word is worth saying so plainly and briefly; do not invent substance that is not there.',
  '`overall` is one short paragraph to the learner: what they managed here, and the one thing to work on next.',
  'Write the Traditional Chinese version first and make the English a faithful translation of it, not a second opinion.',
  '',
  // The coach withholds the correction on purpose, because the learner is still
  // writing. Here the writing is in and the learner is reading it back, so the
  // correction laid over their own sentence is the lesson rather than a
  // shortcut past it.
  '`revised_composition` is the learner\'s ARTICLE with your corrections applied, and it is what they will see laid over what they wrote, so it has to be their piece and not yours:',
  'Keep every sentence they got right EXACTLY as they wrote it — same words, same order, same punctuation. The learner is shown the difference between the two texts, so anything you touch is presented to them as a mistake they made. Rewriting a correct sentence into a better one tells them they were wrong when they were not.',
  'Correct what is actually wrong: grammar, word choice, particles, tense, agreement, word order, and punctuation that changes the meaning. Add the smallest word or phrase that a sentence is genuinely missing.',
  'Do not raise the register, do not lengthen it, and do not add ideas of your own. Stay inside the vocabulary and structures of the class\'s level: a correction they cannot read teaches nothing.',
  'If the article needs nothing, return it unchanged and leave revision_notes empty. That is a real answer and a good one.',
  '`revision_notes` names at most a handful of the corrections that are worth understanding — `before` quoted from their text, `after` as you wrote it, `why` in one short sentence to the learner in Traditional Chinese. Skip the trivial ones; a list of every comma helps nobody.',
  'If there is no article — only the separate fields — return an empty revised_composition and empty revision_notes.',
].join('\n')

export async function reviewWriting(input: {
  direction: string
  fields: Array<{ itemId: string; prompt: string; text: string }>
  // The article the learner made out of those fields, where they wrote one.
  composition: string
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
      composition: input.composition || null,
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

  // Only kept when there was something to correct and the model returned
  // something to compare against. An empty revision is not a failure — a piece
  // that needs nothing is a legitimate outcome, and the diff of a text against
  // itself is simply all theirs.
  const revisedText = line(output.revised_composition, 12000)
  const notes = (Array.isArray(output.revision_notes) ? output.revision_notes : [])
    .map((raw) => {
      const entry = raw as Record<string, unknown>
      return { before: line(entry.before, 400), after: line(entry.after, 400), why: line(entry.why, 400) }
    })
    .filter((note) => note.why && (note.before || note.after))
    // A note whose corrected form is not in the corrected text describes a
    // change that was not made. The learner reads the two side by side, so a
    // note pointing at nothing is worse than one note fewer.
    .filter((note) => !note.after || revisedText.includes(note.after))
    .slice(0, 10)

  // Clamped rather than trusted. A model that answers 105 or -3 would put a
  // number on the teacher's panel that the marking UI cannot represent, and a
  // missing one becomes 0 rather than silently null — the teacher can see a
  // zero and change it, where a blank looks like the marking never ran.
  const raw = Number((output as { score?: unknown }).score)
  const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0

  return {
    fields,
    overall: { zhTw: line(output.overall_zh_tw, 2000), en: line(output.overall_en, 2000) },
    score,
    revision: input.composition && revisedText ? { zhTw: revisedText, notes } : null,
  }
}
