import { useEffect, useState } from 'react'
import type { LearningCredentials } from './useReadingTranslation'
import type { ParticipantLocale } from './participantI18n'
import { requireSupabase } from './supabase'

export function useFlashcardReviewTranslations(questionId: string, itemIds: string, locale: ParticipantLocale, credentials: LearningCredentials | undefined, review: boolean) {
  const { sessionId, participantId, participantToken } = credentials || {}
  const key = JSON.stringify([sessionId, participantId, questionId, itemIds, locale])
  const [result, setResult] = useState<{ key: string; values: Record<string, string> } | null>(null)

  useEffect(() => {
    if (!review || !questionId || !itemIds || !sessionId || !participantId || !participantToken) return
    let cancelled = false
    let timer: number | undefined
    async function load() {
      try {
        const { data, error } = await requireSupabase().functions.invoke('participant-action', {
          body: { action: 'get_flashcard_word_translations', sessionId, participantId, participantToken, questionId, locale },
        })
        if (cancelled || error) return
        if (data?.status === 'pending') {
          timer = window.setTimeout(() => void load(), 1800)
          return
        }
        setResult({ key, values: data?.values || {} })
      } catch {
        // The original explanation stays useful without the optional gloss.
      }
    }
    void load()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [key, itemIds, locale, participantId, participantToken, questionId, review, sessionId])

  return review && result?.key === key ? result.values : undefined
}
