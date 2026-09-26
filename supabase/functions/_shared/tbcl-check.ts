// Does this text stay inside the level the class is working at?
//
// The prompt has always described the level, in detail, and the only thing ever
// checked afterwards was how long a stem was. So the description was a request
// and the vocabulary drifted: a class three hundred words into Chinese got
// 都市化 and 經濟成長 because the material the teacher screenshotted had them.
//
// A word is either on 國教院's list for a level or it is not. That is checkable,
// it is checkable in a few milliseconds, and it can be handed back to the model
// as the actual words to replace rather than another paragraph of instruction.
import { characterLevel, wordLevel } from './tbcl-levels.generated.ts'

export type OverLevelWord = {
  word: string
  // The TBCL level the word is learned at, or 0 when it is on no list at all —
  // a name, a loanword, a technical term the benchmarks never covered.
  level: number
}

// Names, numbers, punctuation and Latin script are not vocabulary the benchmark
// governs, and flagging them would bury the words that matter.
const HAN = /^[一-鿿]+$/

/**
 * Words in `text` above `ceiling`, most severe first.
 *
 * A word absent from the list is judged by its characters: 臺北 is not a listed
 * word but both characters are level 1, so a beginner can read it. That keeps
 * place names and compounds out of the report while still catching 都市化,
 * whose 化 is level 5.
 */
export function overLevelWords(text: string, ceiling: number): OverLevelWord[] {
  if (!text || ceiling <= 0) return []
  const segmenter = new Intl.Segmenter('zh-TW', { granularity: 'word' })
  const worst = new Map<string, number>()

  for (const segment of segmenter.segment(text)) {
    if (!segment.isWordLike) continue
    const word = segment.segment.trim()
    if (!word || !HAN.test(word)) continue

    const listed = wordLevel(word)
    if (listed) {
      if (listed > ceiling) worst.set(word, listed)
      continue
    }
    // Not a listed word. Judge it by the hardest character in it; an unlisted
    // character counts as beyond the benchmark entirely.
    let hardest = 0
    for (const character of word) {
      const level = characterLevel(character)
      hardest = level === 0 ? 8 : Math.max(hardest, level)
      if (hardest === 8) break
    }
    if (hardest > ceiling) worst.set(word, hardest === 8 ? 0 : hardest)
  }

  return [...worst.entries()]
    .map(([word, level]) => ({ word, level }))
    // Unlisted (0) first, then the furthest above the class.
    .sort((a, b) => (a.level === 0 ? -1 : b.level === 0 ? 1 : b.level - a.level))
}

/** What to say to the model about words it used above the level. */
export function overLevelComplaint(offenders: OverLevelWord[], levelLabel: string, ceiling: number) {
  const named = offenders.slice(0, 24).map((entry) => (
    entry.level ? `${entry.word}（TBCL 第${entry.level}級）` : `${entry.word}（不在基準詞表內）`
  )).join('、')
  return [
    `These words are above ${levelLabel}, which is the level this class is working at: ${named}.`,
    `Rewrite so that every one of them is gone. Replace each with something a learner at TBCL level ${ceiling} or below actually knows, or drop the idea it belongs to and say something simpler that the material still supports.`,
    'Do not keep a word by putting it in quotation marks, glossing it, or explaining it — at this level it cannot be read at all, and an explanation of a word they cannot read is one more thing they cannot read.',
    'Keep the same number of items and the same JSON shape.',
  ].join('\n')
}

/**
 * The level a check should hold text to.
 *
 * i+1 and i+2 are the teacher's decision, not the generator's: a class being
 * stretched on purpose is not the same as one being handed the textbook's own
 * difficulty by accident. `stretch` of 0 means stay inside the level.
 */
export function ceilingFor(level: number, stretch: number) {
  if (!level) return 0
  return Math.min(7, level + Math.max(0, Math.min(2, stretch)))
}
