import type { ReadingWord } from '../types'
// Reuse readings only when they cover the exact teacher-approved passage.
export function reusableReadingWords(body: string, words: ReadingWord[] | undefined) {
  return Boolean(words?.length && words.map(word => word.text).join('') === body
    && words.every(word => !/\p{Script=Han}/u.test(word.text) || word.pinyin.trim().length > 0))
}
