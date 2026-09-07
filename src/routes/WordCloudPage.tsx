import { ChatText, Cloud } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { WordCloudCanvas } from '../components/WordCloudCanvas'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import type { Message, Session } from '../types'
import { PresenterLocaleContext, presenterLocaleFor, presenterLookup } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'

type CloudRange = 'all' | '3m' | '10m' | '1h'

const rangeOptions: Array<{ value: CloudRange; label: PresenterMessageKey; milliseconds: number | null }> = [
  { value: 'all', label: 'rangeAll', milliseconds: null },
  { value: '3m', label: 'range3m', milliseconds: 3 * 60 * 1000 },
  { value: '10m', label: 'range10m', milliseconds: 10 * 60 * 1000 },
  { value: '1h', label: 'range1h', milliseconds: 60 * 60 * 1000 },
]

function cutoffFor(range: CloudRange) {
  const milliseconds = rangeOptions.find((option) => option.value === range)?.milliseconds
  return milliseconds ? new Date(Date.now() - milliseconds).toISOString() : null
}

export function WordCloudPage() {
  const { sessionId = '' } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  // Its own window, so it reads the class's teaching language itself rather
  // than inheriting a provider from the presenter page.
  const locale = presenterLocaleFor(session?.teaching_language)
  const t = presenterLookup(locale)
  const [messages, setMessages] = useState<Message[]>([])
  const [range, setRange] = useState<CloudRange>('all')
  const [now, setNow] = useState(Date.now())
  const [loadError, setLoadError] = useState('')
  const loadingRef = useRef(false)
  const loadSequenceRef = useRef(0)
  const latestMessageAtRef = useRef('')

  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]))
      for (const message of incoming) byId.set(message.id, message)
      const merged = [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at))
      latestMessageAtRef.current = merged.at(-1)?.created_at || ''
      return merged
    })
  }, [])

  const loadCloud = useCallback(async () => {
    if (!isSupabaseConfigured || !sessionId) return
    const sequence = ++loadSequenceRef.current
    loadingRef.current = true
    const supabase = requireSupabase()
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (sessionError) throw sessionError
      setSession(sessionData as Session)

      const loaded: Message[] = []
      const cutoff = cutoffFor(range)
      for (let from = 0; ; from += 1000) {
        let query = supabase.from('messages').select('*').eq('session_id', sessionId)
        if (cutoff) query = query.gte('created_at', cutoff)
        const { data, error } = await query.order('created_at').range(from, from + 999)
        if (error) throw error
        const page = (data || []) as Message[]
        loaded.push(...page)
        if (page.length < 1000) break
      }
      if (sequence === loadSequenceRef.current) {
        setMessages(loaded)
        latestMessageAtRef.current = loaded.at(-1)?.created_at || ''
        setLoadError('')
      }
    } catch (error) {
      if (sequence === loadSequenceRef.current) {
        setLoadError(error instanceof Error ? error.message : t('danmakuLoadFailed'))
      }
    } finally {
      if (sequence === loadSequenceRef.current) loadingRef.current = false
    }
  }, [range, sessionId, t])

  const refreshCloud = useCallback(async () => {
    if (!isSupabaseConfigured || !sessionId || loadingRef.current) return
    if (!latestMessageAtRef.current) {
      await loadCloud()
      return
    }

    loadingRef.current = true
    const supabase = requireSupabase()
    try {
      const incoming: Message[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('session_id', sessionId)
          .gte('created_at', latestMessageAtRef.current)
          .order('created_at')
          .range(from, from + 999)
        if (error) throw error
        const page = (data || []) as Message[]
        incoming.push(...page)
        if (page.length < 1000) break
      }
      mergeMessages(incoming)
      setLoadError('')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('danmakuUpdateFailed'))
    } finally {
      loadingRef.current = false
    }
  }, [loadCloud, mergeMessages, sessionId, t])

  useEffect(() => {
    void loadCloud()
  }, [loadCloud])

  useEffect(() => {
    if (!isSupabaseConfigured || !sessionId) return
    const supabase = requireSupabase()
    const channel = supabase
      .channel(`word-cloud:${sessionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${sessionId}` }, (payload) => {
        mergeMessages([payload.new as Message])
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [mergeMessages, sessionId])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now())
      void refreshCloud()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [refreshCloud])

  const visibleMessages = useMemo(() => {
    const milliseconds = rangeOptions.find((option) => option.value === range)?.milliseconds
    if (!milliseconds) return messages
    const cutoff = now - milliseconds
    return messages.filter((message) => new Date(message.created_at).getTime() >= cutoff)
  }, [messages, now, range])

  return (
    <PresenterLocaleContext.Provider value={locale}>
    <main className="word-cloud-page">
      <header className="word-cloud-header">
        <div>
          <p><Cloud size={20} />{t('wordCloudTitle')}</p>
          <h1>{session?.title || t('loadingSession')}</h1>
        </div>
        <div className="word-cloud-tools">
          <span><ChatText size={16} />{t('messageCount', { n: visibleMessages.length })}</span>
          <div className="segmented-control" aria-label={t('cloudRangeLabel')}>
            {rangeOptions.map((option) => (
              <button
                aria-pressed={range === option.value}
                className={range === option.value ? 'selected' : ''}
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>
      </header>
      {loadError && <p className="word-cloud-error" role="alert">{t('cloudUpdateFailed', { message: loadError })}</p>}
      <WordCloudCanvas messages={visibleMessages} />
    </main>
    </PresenterLocaleContext.Provider>
  )
}
