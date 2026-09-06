// A budget in two currencies: writing systems where one character carries a
// syllable or a morpheme, and alphabetic ones where a word does.
export const MESSAGE_MAX_DENSE_CHARACTERS = 36
export const MESSAGE_MAX_ALPHABETIC_WORDS = 24
export const MESSAGE_MAX_RAW_CHARACTERS = 180

// Hangul and Thai were absent while the only languages on offer were Chinese
// and English. Without them a Korean message counted as punctuation at half a
// unit per character, so the same limit let a Korean learner write roughly
// twice as much as a Japanese one.
const densePattern = /[\u0e00-\u0e7f\u2e80-\u2fff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/
// Vietnamese, German, French and Spanish are counted in words rather than
// characters, so this has to cover accented Latin and not just ASCII.
const alphabeticWordCharacterPattern = /[0-9A-Za-z\u00c0-\u024f\u1e00-\u1eff]/
const wordJoinerPattern = /['’-]/

export function messageUsage(value: string) {
  let denseCharacters = 0
  let alphabeticWords = 0
  let symbols = 0
  let insideWord = false

  for (const character of Array.from(value.trim())) {
    if (densePattern.test(character)) {
      denseCharacters += 1
      insideWord = false
    } else if (alphabeticWordCharacterPattern.test(character)) {
      if (!insideWord) alphabeticWords += 1
      insideWord = true
    } else if (insideWord && wordJoinerPattern.test(character)) {
      // Apostrophes and hyphens keep a word together.
    } else {
      insideWord = false
      if (!/\s/.test(character)) symbols += 1
    }
  }

  const units = denseCharacters
    + alphabeticWords * (MESSAGE_MAX_DENSE_CHARACTERS / MESSAGE_MAX_ALPHABETIC_WORDS)
    + symbols * 0.5

  return {
    denseCharacters,
    alphabeticWords,
    rawCharacters: Array.from(value).length,
    symbols,
    units,
  }
}

export function messageFitsLimit(value: string) {
  const usage = messageUsage(value)
  return usage.rawCharacters <= MESSAGE_MAX_RAW_CHARACTERS
    && usage.units <= MESSAGE_MAX_DENSE_CHARACTERS
}
