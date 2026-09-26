import { ChatText, Cloud } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { WordCloudCanvas } from '../components/WordCloudCanvas'
import { BUILT_IN_TERMS, parseTermInput, readCustomTerms, writeCustomTerms } from '../lib/wordCloudTerms'
import { DanmakuTimeline } from '../components/DanmakuTimeline'
import { currentBurst } from '../lib/danmakuBursts'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import type { Message, Session } from '../types'
import { PresenterLocaleContext, presenterLocaleFor, presenterLookup } from '../lib/presenterI18n'


export function WordCloudPage() {
  const { sessionId = '' } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  // Its own window, so it reads the class's teaching language itself rather
  // than inheriting a provider from the presenter page.
  const locale = presenterLocaleFor(session?.teaching_language)
  const t = presenterLookup(locale)
  const [messages, setMessages] = useState<Message[]>([])
  // The presenter's own words, kept on this computer beside the class lists. A
  // subject always has vocabulary no general list anticipated, and the moment
  // to add it is when the cloud gets it wrong in front of the class.
  const [customTerms, setCustomTerms] = useState<string[]>(readCustomTerms)
  const [termsOpen, setTermsOpen] = useState(false)
  const [termText, setTermText] = useState('')
  // Where the teacher has dragged the timeline, or null to follow the class.
  const [pinned, setPinned] = useState<{ from: number; to: number } | null>(null)
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
      // The whole session, always. The timeline draws every message as a bar
      // and lets the teacher pick a stretch, so pruning the query by time
      // would leave gaps in the track itself.
      for (let from = 0; ; from += 1000) {
        const query = supabase.from('messages').select('*').eq('session_id', sessionId)
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
  }, [sessionId, t])

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

  const times = useMemo(
    () => messages.map((message) => new Date(message.created_at).getTime()).sort((a, b) => a - b),
    [messages],
  )

  // The session runs from its first message to now, so the track keeps growing
  // while the class does. Half a minute of padding stops the newest bar sitting
  // exactly on the right edge where the handle is.
  const bounds = useMemo(() => {
    const first = times[0] ?? now - 60_000
    return { start: first, end: Math.max(now, (times.at(-1) ?? now)) + 30_000 }
  }, [times, now])

  // Left alone, the cloud follows the burst the class is in — which is what a
  // teacher glancing up wants — rather than a fixed three or sixty minutes
  // that has no relationship to when anybody actually said anything.
  const selection = useMemo(() => {
    if (pinned) return pinned
    const burst = currentBurst(times)
    if (!burst) return { from: bounds.start, to: bounds.end }
    return { from: burst.start - 1000, to: bounds.end }
  }, [pinned, times, bounds])

  const visibleMessages = useMemo(
    () => messages.filter((message) => {
      const at = new Date(message.created_at).getTime()
      return at >= selection.from && at <= selection.to
    }),
    [messages, selection],
  )

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
          {/* Two named ranges, because those are the two questions a teacher
              actually asks — what are they saying right now, and what has this
              class been about. The timeline below is still there for anything
              in between. */}
          <div className="segmented-control" aria-label={t('cloudRange')}>
            <button
              aria-pressed={!pinned}
              className={!pinned ? 'selected' : ''}
              type="button"
              onClick={() => setPinned(null)}
            >
              {t('cloudThisWave')}
            </button>
            <button
              aria-pressed={Boolean(pinned) && selection.from <= bounds.start}
              className={pinned && selection.from <= bounds.start ? 'selected' : ''}
              type="button"
              onClick={() => setPinned({ from: bounds.start, to: bounds.end })}
            >
              {t('cloudWholeSession')}
            </button>
          </div>
          <button
            className="ghost-button word-cloud-terms-toggle"
            type="button"
            onClick={() => { setTermText(customTerms.join('\n')); setTermsOpen((open) => !open) }}
          >
            {t('cloudTerms')}
          </button>
        </div>
      </header>
      {times.length > 0 && (
        <DanmakuTimeline
          selection={selection}
          sessionEnd={bounds.end}
          sessionStart={bounds.start}
          times={times}
          onChange={setPinned}
        />
      )}
      {loadError && <p className="word-cloud-error" role="alert">{t('cloudUpdateFailed', { message: loadError })}</p>}
      {termsOpen && (
        <section className="word-cloud-terms" aria-label={t('cloudTerms')}>
          <p className="muted">{t('cloudTermsHint', { n: BUILT_IN_TERMS.length })}</p>
          <textarea
            aria-label={t('cloudTerms')}
            placeholder={t('cloudTermsPlaceholder')}
            rows={5}
            value={termText}
            onChange={(event) => setTermText(event.target.value)}
          />
          <div className="word-cloud-terms-actions">
            <button
              type="button"
              onClick={() => {
                const saved = writeCustomTerms(parseTermInput(termText))
                setTermText(saved.join('\n'))
                setCustomTerms(saved)
                setTermsOpen(false)
              }}
            >
              {t('cloudTermsSave')}
            </button>
            <button className="ghost-button" type="button" onClick={() => setTermsOpen(false)}>{t('cancel')}</button>
          </div>
        </section>
      )}
      <WordCloudCanvas customTerms={customTerms} messages={visibleMessages} />
    </main>
    </PresenterLocaleContext.Provider>
  )
}
