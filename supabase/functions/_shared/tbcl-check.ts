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
import { chineseVocabularySegments } from './chinese-word-matching.ts'
import { characterLevel, wordLevel } from './tbcl-levels.generated.ts'

export type OverLevelWord = {
  word: string
  // An unlisted word can still contain above-level characters. Keep that
  // evidence separate from the official level assigned to a listed word.
  level: number
  characterBased?: true
}

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
  const worst = new Map<string, OverLevelWord>()

  for (const { word, level: listed } of chineseVocabularySegments(text, 'zh-TW', wordLevel)) {
    if (listed) {
      if (listed > ceiling) worst.set(word, { word, level: listed })
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
    if (hardest > ceiling) worst.set(word, { word, level: hardest === 8 ? 0 : hardest, characterBased: true })
  }

  return [...worst.values()]
    // Unlisted (0) first, then the furthest above the class.
    .sort((a, b) => (b.level || 8) - (a.level || 8))
}

/** What to say to the model about words it used above the level. */
export function overLevelComplaint(offenders: OverLevelWord[], levelLabel: string, ceiling: number) {
  const named = offenders.slice(0, 24).map((entry) => (
    entry.characterBased
      ? `${entry.word}（詞表未收錄，${entry.level ? `有第${entry.level}級漢字` : '含字表未收錄的字'}）`
      : `${entry.word}（TBCL 第${entry.level}級）`
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
