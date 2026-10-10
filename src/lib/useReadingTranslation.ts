import { useEffect, useState } from 'react'
import { requireSupabase } from './supabase'
import type { ParticipantLocale } from './participantI18n'
import type { ReadingPassage } from '../types'

export type LearningCredentials = { sessionId: string; participantId: string; participantToken: string }
const targetLocales = new Set(['vi', 'th', 'ja', 'ko', 'id', 'es', 'fr', 'de', 'my'])

export function useReadingTranslation(passage: ReadingPassage, locale: ParticipantLocale, credentials?: LearningCredentials, locked = false) {
  const [result, setResult] = useState<{ key: string; values: Record<string, string>; status?: 'pending' | 'failed' } | null>(null)
  const source = JSON.stringify([passage.vocabulary, passage.grammar])
  const key = JSON.stringify([passage.question_id, locale, source])
  const needed = targetLocales.has(locale) && !locked && Boolean(credentials)
    && (passage.vocabulary.some(entry => !entry.gloss?.[locale]) || passage.grammar.some(entry => !entry.note?.[locale]))
  const sessionId = credentials?.sessionId, participantId = credentials?.participantId, participantToken = credentials?.participantToken
  useEffect(() => {
    if (!needed) return
    let cancelled = false
    let timer: number | undefined
    async function load() {
      try {
        const { data, error } = await requireSupabase().functions.invoke('participant-action', {
          body: { action: 'get_reading_translation', sessionId, participantId, participantToken, questionId: passage.question_id, locale },
        })
        if (cancelled) return
        if (error) throw error
        setResult({ key, values: data?.values || {}, status: data?.status })
        if (data?.status === 'pending') timer = window.setTimeout(() => void load(), 1800)
      } catch {
        if (!cancelled) setResult({ key, values: {}, status: 'failed' })
      }
    }
    void load()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [key, needed, sessionId, participantId, participantToken, passage.question_id, locale])
  const values = result?.key === key ? result.values : {}
  return {
    status: needed ? result?.key === key ? result.status : 'pending' : undefined,
    passage: Object.keys(values).length ? {
      ...passage,
      vocabulary: passage.vocabulary.map((entry, index) => values[`word:${index}`] ? { ...entry, gloss: { ...entry.gloss, [locale]: values[`word:${index}`] } } : entry),
      grammar: passage.grammar.map((entry, index) => values[`grammar:${index}`] ? { ...entry, note: { ...entry.note, [locale]: values[`grammar:${index}`] } } : entry),
    } : passage,
  }
}
