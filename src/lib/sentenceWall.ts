import { presenterLookup } from './presenterI18n'
import type { PresenterT } from './presenterI18n'
import { requireSupabase } from './supabase'
import type { Question, Session } from '../types'

// What the AI made of the class's sentences. The passage quotes them as they
// wrote them, so this is their work read back to them rather than a model
// answer written over the top of it.
export type SentenceWallComposition = {
  title: string
  passage: string
  highlights: Array<{ sentence: string; why: string }>
  watchOut: Array<{ point: string; fix: string }>
}

export async function openSentenceWall(input: {
  sessionId: string
  presenterToken: string
  promptText: string
  answerSeconds: number | null
}, t: PresenterT = presenterLookup('zh-TW')) {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'open_sentence_wall', ...input },
  })
  if (error) throw error
  if (!data?.question) throw new Error(data?.message || t('wallOpenFailed'))
  return data as { question: Question; session: Session | null }
}

export async function composeSentenceWall(input: {
  sessionId: string
  presenterToken: string
  questionId: string
}, t: PresenterT = presenterLookup('zh-TW')) {
  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: { action: 'compose_sentence_wall', ...input },
  })
  if (error) throw error
  if (!data?.composition) throw new Error(data?.message || t('composeFailed'))
  return data.composition as SentenceWallComposition
}

// The text the teacher sends back through 文字派送. Pre-filled rather than sent
// for them: it is the class's own writing, and the teacher is the one who
// decides what of it goes out.
export function dispatchTextFor(composition: SentenceWallComposition, t: PresenterT = presenterLookup('zh-TW')) {
  const lines = [composition.title, '', composition.passage]
  if (composition.highlights.length) {
    lines.push('', `── ${t('worthLearning')} ──`)
    for (const highlight of composition.highlights) {
      lines.push(`「${highlight.sentence}」`, `　${highlight.why}`)
    }
  }
  if (composition.watchOut.length) {
    lines.push('', `── ${t('watchOutFor')} ──`)
    for (const item of composition.watchOut) {
      lines.push(`${item.point}`, `　${item.fix}`)
    }
  }
  return lines.join('\n')
}
