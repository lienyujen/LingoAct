// What the AI changed in a learner's writing, worked out here rather than asked
// for.
//
// The reviewer returns the corrected article as plain text. Comparing it with
// what the learner actually wrote is what makes the display trustworthy: every
// run marked `kept` is a substring of their own text, so a model that drifted
// while retyping their sentence shows up as a change to look at rather than as
// a quiet rewrite of their words.

export type DiffRun = {
  kind: 'kept' | 'added' | 'removed'
  text: string
}

// Chinese and Japanese are not word-spaced, so a word diff would mark a whole
// sentence changed for one particle. Splitting on characters there and on words
// elsewhere keeps a run as small as the thing that actually changed.
//
// Punctuation and spaces are their own tokens in both modes: a missing comma is
// a correction worth showing on its own, not one that drags a word with it.
const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿＀-￯]/

export function tokenize(text: string): string[] {
  const tokens: string[] = []
  // Word runs for alphabetic scripts, single characters for CJK, and every
  // other character — punctuation, whitespace, digits — on its own.
  const pattern = /[\p{Letter}\p{Mark}\p{Number}'’-]+|\s+|[^\s]/gu
  for (const match of text.matchAll(pattern)) {
    const chunk = match[0]
    if (chunk.length > 1 && CJK.test(chunk)) tokens.push(...chunk)
    else tokens.push(chunk)
  }
  return tokens
}

// The longest common subsequence, which is what a diff is. Quadratic in the
// token counts, and bounded by the 12,000-character ceiling on a composition:
// a few thousand tokens each way is milliseconds, and the alternative — an
// approximate diff — would mark unchanged sentences as changed.
function commonSubsequence(a: string[], b: string[]) {
  const rows = a.length + 1
  const columns = b.length + 1
  // One flat Int32Array rather than nested arrays: at a few thousand tokens
  // each way this is several million cells, and the allocation dominates.
  const table = new Int32Array(rows * columns)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * columns + j] = a[i] === b[j]
        ? table[(i + 1) * columns + (j + 1)] + 1
        : Math.max(table[(i + 1) * columns + j], table[i * columns + (j + 1)])
    }
  }
  return { table, columns }
}

// A safety valve rather than a limit anyone should meet: the composition check
// caps a piece at 12,000 characters, and two of those tokenise to well inside
// this. Past it the whole revision is shown as one replacement, which is honest
// and cheap, instead of the tab freezing.
const MAX_TOKENS = 6000

export function diffWriting(original: string, revised: string): DiffRun[] {
  if (!original) return revised ? [{ kind: 'added', text: revised }] : []
  if (!revised || original === revised) return [{ kind: 'kept', text: original }]

  const a = tokenize(original)
  const b = tokenize(revised)
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [{ kind: 'removed', text: original }, { kind: 'added', text: revised }]
  }

  const { table, columns } = commonSubsequence(a, b)
  const runs: DiffRun[] = []
  // Adjacent tokens of the same kind are one run, so a changed phrase reads as
  // a phrase rather than as a row of separately highlighted characters.
  const push = (kind: DiffRun['kind'], text: string) => {
    const last = runs.at(-1)
    if (last && last.kind === kind) last.text += text
    else runs.push({ kind, text })
  }

  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('kept', a[i])
      i += 1
      j += 1
    } else if (table[(i + 1) * columns + j] >= table[i * columns + (j + 1)]) {
      push('removed', a[i])
      i += 1
    } else {
      push('added', b[j])
      j += 1
    }
  }
  while (i < a.length) { push('removed', a[i]); i += 1 }
  while (j < b.length) { push('added', b[j]); j += 1 }

  // Whitespace-only churn is noise: the model reflowing a line break reads as a
  // correction the learner did not make. Dropped only where it changes nothing
  // that is visible — a run of spaces added or removed between two kept runs.
  return runs.filter((run) => run.kind === 'kept' || run.text.trim().length > 0)
}

export function hasChanges(runs: DiffRun[]) {
  return runs.some((run) => run.kind !== 'kept')
}
