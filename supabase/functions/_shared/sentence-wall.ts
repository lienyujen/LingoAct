import { callAiJson, errorDetail } from './ai.ts'
import { levelInstruction } from './proficiency.ts'
import { trackInstruction } from './teaching.ts'

// 即時造句牆: what to do with thirty sentences once the class has written them.
//
// The point of the activity is that everyone sees thirty real samples at once —
// so the write-up must be made OF those sentences, not a lesson written beside
// them. It reads back to the class as their own work, which is why the passage
// quotes them as written and the corrections are generalised: a class reading a
// tidied-up version of its own writing learns that its writing was already fine.
export type SentenceWallComposition = {
  title: string
  passage: string
  highlights: Array<{ sentence: string; why: string }>
  watchOut: Array<{ point: string; fix: string }>
}

const compositionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    passage: { type: 'string' },
    highlights: {
      type: 'array',
      minItems: 1,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { sentence: { type: 'string' }, why: { type: 'string' } },
        required: ['sentence', 'why'],
      },
    },
    watch_out: {
      type: 'array',
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { point: { type: 'string' }, fix: { type: 'string' } },
        required: ['point', 'fix'],
      },
    },
  },
  required: ['title', 'passage', 'highlights', 'watch_out'],
}

const RULES = [
  'A class has just written one sentence each to the same prompt, and you are writing the class\'s work up into something worth reading back to them.',
  '`passage` arranges their sentences into ONE connected short text. This is writing, not collating: open with a line of your own that sets the scene, group the sentences that belong together, carry the reader between them with transitions of your own — 有人…、也有人…、不過、另一方面、說到這裡 — break it into two or three paragraphs, and close with a line of your own. Sentences printed one after another with nothing between them is a list, and the class can already see the list on the wall.',
  'Inside that text every sentence they wrote stays EXACTLY as they wrote it, word for word, mistakes included. Everything you add goes between their sentences, never inside one. A passage in which the errors have quietly disappeared teaches the class nothing and misrepresents what they wrote; the corrections belong in `watch_out`, where they can be seen.',
  'Leave out a sentence rather than repair it if it cannot be joined to anything — a blank answer, a joke, something off the topic. Never invent a sentence nobody wrote.',
  'Repeated sentences are worth keeping only once, but note nothing about who repeated whom.',
  '`highlights` picks two to four of their sentences worth learning from, each with one line saying what it does well — a pattern used precisely, a vivid word, a clause that carries the meaning. Quote the sentence exactly as written.',
  '`watch_out` names the language points the class as a whole should fix, at most four, most common first. Describe the pattern rather than the person, and write `fix` as a wrong → right pair that is NOT any one student\'s sentence verbatim, so nobody can be identified by it. Leave the list empty if the writing does not need it; an invented problem is worse than none.',
  'Every word of your output is read by the class, so write it to them, in the language they are learning.',
].join('\n')

export async function composeSentenceWall(input: {
  prompt: string
  sentences: string[]
  trackId: string | null
  framework: string | null
  levelCode: string | null
}): Promise<SentenceWallComposition> {
  const systemPrompt = [
    RULES,
    trackInstruction(input.trackId),
    levelInstruction(input.framework, input.levelCode),
  ].join('\n\n')

  const result = await callAiJson(
    systemPrompt,
    { prompt: input.prompt || null, sentences: input.sentences },
    compositionSchema,
  )
  if (result.status !== 'success') {
    throw new Error(errorDetail((result.output as { message?: string })?.message, '無法集成這面造句牆。'))
  }

  const output = result.output as Record<string, unknown>
  const passage = typeof output.passage === 'string' ? output.passage.trim().slice(0, 4000) : ''
  if (!passage) throw new Error('AI 沒有寫出短文。')

  const pairs = (value: unknown, first: string, second: string, limit: number) =>
    (Array.isArray(value) ? value : []).map((raw) => {
      const entry = raw as Record<string, unknown>
      return {
        [first]: typeof entry[first] === 'string' ? entry[first].trim().slice(0, 500) : '',
        [second]: typeof entry[second] === 'string' ? entry[second].trim().slice(0, 500) : '',
      }
    }).filter((entry) => entry[first] && entry[second]).slice(0, limit)

  return {
    title: typeof output.title === 'string' ? output.title.trim().slice(0, 80) || '造句牆' : '造句牆',
    passage,
    highlights: pairs(output.highlights, 'sentence', 'why', 4) as SentenceWallComposition['highlights'],
    watchOut: pairs(output.watch_out, 'point', 'fix', 4) as SentenceWallComposition['watchOut'],
  }
}
