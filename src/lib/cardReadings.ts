import { presenterLookup } from './presenterI18n'
import type { PresenterT } from './presenterI18n'
import { requireSupabase } from './supabase'
import { annotateReading } from './listening'
import type { QuizItem } from '../types'

// 標音 on a 單字卡 deck.
//
// The words are annotated in ONE call, not one per card: they are joined with
// newlines, marked up together and split back. A newline has no reading in
// either mode, so it survives both — 注音 inserts variation selectors after Han
// characters and leaves everything else alone, and 拼音 returns an empty slot
// for anything that is not a Han character.
//
// The two modes end up in the same column as a string per option, which is what
// keeps the card renderer simple: 注音 is the word with its readings built into
// the glyphs, 拼音 is the syllables to print under the word. Which one it is,
// the question says — a deck with a font is 注音.
const SEPARATOR = '\n'

export async function annotateCardDeck(input: {
  sessionId: string
  presenterToken: string
  questionId: string
  items: QuizItem[]
  mode: 'zhuyin' | 'pinyin'
}, t: PresenterT = presenterLookup('zh-TW')) {
  // One entry per option of every card, flattened, so the whole deck is one
  // request and the font subset is cut from every character at once.
  const words: string[] = []
  const shape: number[] = []
  for (const item of input.items) {
    shape.push(item.options.length)
    words.push(...item.options)
  }
  if (!words.length) return null

  const joined = words.join(SEPARATOR)
  const marked = await annotateReading({
    sessionId: input.sessionId,
    presenterToken: input.presenterToken,
    text: joined,
    mode: input.mode,
  })

  let perWord: string[]
  if (input.mode === 'zhuyin') {
    perWord = marked.annotationText.split(SEPARATOR)
  } else {
    // A syllable per character of the joined text; walk it back into words.
    const syllables = JSON.parse(marked.annotationText) as string[]
    const characters = [...joined]
    perWord = []
    let buffer: string[] = []
    for (let index = 0; index < characters.length; index += 1) {
      if (characters[index] === SEPARATOR) { perWord.push(buffer.join(' ').trim()); buffer = []; continue }
      if (syllables[index]) buffer.push(syllables[index])
    }
    perWord.push(buffer.join(' ').trim())
  }
  // A split that does not line up would put one word's reading on another.
  if (perWord.length !== words.length) throw new Error(t('readingCountMismatch'))

  const items: Array<{ itemId: string; readings: string[] }> = []
  let at = 0
  for (const [index, item] of input.items.entries()) {
    items.push({ itemId: item.id, readings: perWord.slice(at, at + shape[index]) })
    at += shape[index]
  }

  // 注音 needs a font the student's browser can load, cut here because the
  // source face is 17 MB and already on this machine. 拼音 needs none.
  let fontBase64 = ''
  if (input.mode === 'zhuyin') {
    const subset = window.lingoActDesktop?.subsetBopomofoFont
    if (!subset) throw new Error(t('desktopOnlySubset'))
    const result = await subset(marked.annotationText)
    if (!result.ok) throw new Error(result.message)
    fontBase64 = result.woff2
  }

  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: {
      action: 'set_quiz_annotation',
      sessionId: input.sessionId,
      presenterToken: input.presenterToken,
      questionId: input.questionId,
      items,
      fontBase64,
    },
  })
  if (error) throw error
  return data as { cardFontUrl: string | null }
}

export async function editQuizItems(input: {
  sessionId: string
  presenterToken: string
  questionId: string
  removeItemId?: string
  addCount?: number
}, t: PresenterT = presenterLookup('zh-TW')) {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'edit_quiz_items', ...input },
  })
  if (error) throw error
  if (typeof data?.count !== 'number') throw new Error(data?.message || t('deckEditFailed'))
  return data.count as number
}
