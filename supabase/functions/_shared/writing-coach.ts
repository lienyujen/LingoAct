import { callAiJson, errorDetail } from './ai.ts'
import { guidanceLanguageName } from './languages.ts'
import { levelInstruction } from './proficiency.ts'
import { resolveTrack, trackInstruction } from './teaching.ts'

// AI寫作教練 with the scaffolding on: 提問、指出問題、要求學生修改.
//
// The whole activity turns on one restraint. A model asked to help with writing
// will, left to itself, hand back the improved sentence — and a student who
// pastes that sentence has learned nothing and produced work that is not
// theirs. So the coach may say what is missing, ask about it, and name what to
// change; it may not write the change. That is the difference between a coach
// and a ghostwriter, and it is enforced in the rules below rather than hoped
// for.
export type CoachReply = {
  noticed: string
  questions: string[]
  fix: { point: string; why: string } | null
  ready: boolean
}

const replySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    noticed: { type: 'string' },
    questions: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
    fix: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: { point: { type: 'string' }, why: { type: 'string' } },
      required: ['point', 'why'],
    },
    ready: { type: 'boolean' },
  },
  required: ['noticed', 'questions', 'fix', 'ready'],
}

const RULES = [
  'You are a writing coach sitting beside one learner, looking at the draft they have written so far. You are not marking it and you are not finishing it.',
  'NEVER write the learner\'s sentence for them. Do not supply a corrected version, a rewritten clause, a model answer, or a phrase they could paste in. Naming what is missing is your job; producing it is theirs. If you catch yourself about to write the words they should use, ask a question that would make them write those words instead.',
  '`noticed` is one specific thing this draft actually does — a word chosen well, an idea worth keeping, a pattern used correctly. Point at what is there, not at effort in general. A learner who is told "good job" twice stops reading.',
  '`questions` are one to three questions that would make the next draft better, addressed to the learner. Ask about what the writing does not yet say: who, when, why, what happened next, how they felt about it. A question they can answer with yes or no moves nothing.',
  '`fix` is the single most worthwhile thing to change, or null if the draft does not need one yet. `point` says WHERE and WHAT — the sentence or the word, and what is wrong with it. `why` says what goes wrong for a reader because of it. Neither may contain the corrected text.',
  'A language mistake is worth naming when it stops the meaning getting through or when it is the pattern this exercise is practising. Otherwise leave it: a draft covered in corrections stops being a draft the learner wants to work on.',
  '`ready` is true when the draft answers the task and is worth sending, even if it could still be better. Say so when it is true — a coaching loop with no end is not scaffolding.',
  'Pitch every question at what this learner can actually do next. Asking a beginner for a subordinate clause they have not met is not a scaffold, it is a wall.',
].join('\n')

export async function askWritingCoach(input: {
  fieldPrompt: string
  direction: string
  draft: string
  round: number
  previous: Array<{ draft: string; questions: string[] }>
  trackId: string | null
  framework: string | null
  levelCode: string | null
  guidanceLanguage: string
}): Promise<CoachReply> {
  const track = resolveTrack(input.trackId)
  const systemPrompt = [
    RULES,
    trackInstruction(input.trackId),
    levelInstruction(input.framework, input.levelCode),
    `The learner is writing in ${track.promptLanguage}. Write everything you say to them in ${guidanceLanguageName(input.guidanceLanguage)}, quoting their own words where you need to point at something. Talking about their writing is explaining, and explaining happens in the language they understand best.`,
    input.previous.length
      ? 'You have spoken to this learner before about this same piece. Their earlier drafts and what you asked are below. Do not ask again for something they have now put in — notice it instead — and do not repeat a question they have already answered.'
      : '',
  ].filter(Boolean).join('\n\n')

  const result = await callAiJson(
    systemPrompt,
    {
      task: input.direction || null,
      field: input.fieldPrompt,
      round: input.round,
      earlier_rounds: input.previous,
      draft: input.draft,
    },
    replySchema,
  )
  if (result.status !== 'success') {
    throw new Error(errorDetail((result.output as { message?: string })?.message, '教練暫時無法回覆。'))
  }

  const output = result.output as Record<string, unknown>
  const line = (value: unknown, limit: number) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''
  const questions = (Array.isArray(output.questions) ? output.questions : [])
    .map((question) => line(question, 300)).filter(Boolean).slice(0, 3)
  if (!questions.length) throw new Error('教練沒有提出問題。')

  const rawFix = output.fix as Record<string, unknown> | null
  const fixPoint = line(rawFix?.point, 400)
  const fixWhy = line(rawFix?.why, 400)

  return {
    noticed: line(output.noticed, 400),
    questions,
    fix: fixPoint && fixWhy ? { point: fixPoint, why: fixWhy } : null,
    ready: output.ready === true,
  }
}
