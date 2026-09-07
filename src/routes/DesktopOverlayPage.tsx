import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { resolvedCaptionLanguage } from '../lib/captionLanguages'
import { DanmakuLayer } from '../components/DanmakuLayer'
import { BuzzerOverlay } from '../components/BuzzerOverlay'
import { LotteryOverlay } from '../components/LotteryOverlay'
import { LiveCaptionOverlay } from '../components/LiveCaptionOverlay'
import { SentenceWallOverlay } from '../components/SentenceWallOverlay'
import { isBuzzerAccepting, isBuzzerPending } from '../lib/buzzer'
import { finalizeLottery } from '../lib/lottery'
import { getPresenterToken } from '../lib/presenterAuth'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import type { Answer, BuzzerSessionEvent, CaptionSegment, LotterySessionEvent, Message, Question, Session, SessionEvent } from '../types'
import { PresenterLocaleContext, presenterLocaleFor, presenterLookup } from '../lib/presenterI18n'

export function DesktopOverlayPage() {
  const { sessionId = '' } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  // The overlay is its own transparent window, so it resolves the class's
  // teaching language itself and provides it to the overlays it renders.
  const locale = presenterLocaleFor(session?.teaching_language)
  const t = presenterLookup(locale)
  const [messages, setMessages] = useState<Message[]>([])
  const [lotteryEvent, setLotteryEvent] = useState<LotterySessionEvent | null>(null)
  const [buzzerEvent, setBuzzerEvent] = useState<BuzzerSessionEvent | null>(null)
  const [liveCaptions, setLiveCaptions] = useState<Record<string, string>>({})
  // 即時造句牆: only fetched while the wall is up, so an overlay showing nothing
  // but captions is not polling for answers nobody is looking at.
  const [wallQuestion, setWallQuestion] = useState<Question | null>(null)
  const [wallAnswers, setWallAnswers] = useState<Answer[]>([])
  const messageCutoffRef = useRef(new Date().toISOString())
  const loadingRef = useRef(false)
  const captionHideTimersRef = useRef<Map<string, number>>(new Map())

  const showCaption = useCallback((language: string, text: string) => {
    setLiveCaptions((current) => ({ ...current, [language]: text }))
    window.clearTimeout(captionHideTimersRef.current.get(language))
    captionHideTimersRef.current.set(language, window.setTimeout(() => {
      setLiveCaptions((current) => current[language] === text ? { ...current, [language]: '' } : current)
      captionHideTimersRef.current.delete(language)
    }, 2000))
  }, [])

  const clearCaptions = useCallback(() => {
    for (const timer of captionHideTimersRef.current.values()) window.clearTimeout(timer)
    captionHideTimersRef.current.clear()
    setLiveCaptions({})
  }, [])

  const mergeMessages = useCallback((incoming: Message[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]))
      for (const message of incoming) byId.set(message.id, message)
      return [...byId.values()].sort((left, right) => left.created_at.localeCompare(right.created_at))
    })
  }, [])

  const showActivityEvent = useCallback((event: SessionEvent) => {
    if (event.event_type === 'buzzer') {
      setBuzzerEvent((current) => {
        if (
          current?.id === event.id
          && current.payload.accepting === event.payload.accepting
          && current.payload.finalized === event.payload.finalized
          && current.payload.cancelled === event.payload.cancelled
          && current.payload.expires_at === event.payload.expires_at
          && current.payload.winner_id === event.payload.winner_id
        ) return current
        return event
      })
      setLotteryEvent(null)
    } else if (event.event_type === 'lottery' || event.event_type === 'lottery_result') {
      setLotteryEvent((current) => (
        current?.id === event.id
        && current.payload.finalized === event.payload.finalized
        && current.payload.winner_id === event.payload.winner_id
          ? current
          : event
      ))
      setBuzzerEvent(null)
    }
  }, [])

  const loadOverlay = useCallback(async () => {
    if (!isSupabaseConfigured || !sessionId || loadingRef.current) return
    loadingRef.current = true
    const supabase = requireSupabase()
    try {
      const [{ data: sessionData }, { data: messageData }] = await Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).single(),
        supabase
          .from('messages')
          .select('*')
          .eq('session_id', sessionId)
          .gte('created_at', messageCutoffRef.current)
          .order('created_at', { ascending: false })
          .limit(100),
      ])
      const nextSession = sessionData as Session | null
      setSession(nextSession)
      mergeMessages((messageData || []) as Message[])
    } catch {
      // Realtime remains primary; the next poll retries missed updates.
    } finally {
      loadingRef.current = false
    }
  }, [mergeMessages, sessionId])

  const wallQuestionId = session?.sentence_wall_enabled ? session.current_question_id : null

  const loadWall = useCallback(async () => {
    if (!isSupabaseConfigured || !wallQuestionId) return
    const supabase = requireSupabase()
    const [{ data: questionData }, { data: answerData }] = await Promise.all([
      supabase.from('questions').select('*').eq('id', wallQuestionId).maybeSingle(),
      supabase.from('answers').select('*').eq('question_id', wallQuestionId).order('submitted_at'),
    ])
    setWallQuestion(questionData as Question | null)
    setWallAnswers((answerData || []) as Answer[])
  }, [wallQuestionId])

  useEffect(() => {
    if (!wallQuestionId) {
      setWallQuestion(null)
      setWallAnswers([])
      return
    }
    void loadWall()
    if (!isSupabaseConfigured) return
    const supabase = requireSupabase()
    const channel = supabase
      .channel(`sentence-wall:${wallQuestionId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'answers', filter: `question_id=eq.${wallQuestionId}` }, (payload) => {
        // Appended rather than refetched: a sentence landing while thirty
        // students type should cost one row, not thirty.
        setWallAnswers((current) => (
          current.some((answer) => answer.id === (payload.new as Answer).id)
            ? current
            : [...current, payload.new as Answer]
        ))
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadWall, wallQuestionId])

  useEffect(() => {
    loadOverlay()
  }, [loadOverlay])

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadOverlay()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [loadOverlay])

  useEffect(() => window.lingoActDesktop?.onLottery(showActivityEvent), [showActivityEvent])

  useEffect(() => {
    const loadLatestActivity = async () => {
      const event = await window.lingoActDesktop?.getLatestLottery()
      if (!event) return
      showActivityEvent(event)
    }
    void loadLatestActivity()
  }, [showActivityEvent])

  useEffect(() => {
    if (!isSupabaseConfigured || !sessionId) return
    const supabase = requireSupabase()
    const channel = supabase
      .channel(`desktop-overlay:${sessionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` }, loadOverlay)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `session_id=eq.${sessionId}` }, (payload) => {
        mergeMessages([payload.new as Message])
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'caption_segments', filter: `session_id=eq.${sessionId}` }, (payload) => {
        const segment = payload.new as CaptionSegment
        showCaption(segment.language, segment.text)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_events', filter: `session_id=eq.${sessionId}` }, (payload) => {
        const event = payload.new as SessionEvent
        showActivityEvent(event)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadOverlay, mergeMessages, sessionId, showActivityEvent, showCaption])

  useEffect(() => {
    if (!isSupabaseConfigured || !sessionId) return
    const supabase = requireSupabase()
    const channel = supabase
      .channel(`captions:${sessionId}`)
      .on('broadcast', { event: 'caption' }, ({ payload }) => {
        if (payload?.cleared) {
          clearCaptions()
          return
        }
        if (typeof payload?.language === 'string' && typeof payload?.text === 'string') {
          showCaption(payload.language, payload.text)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clearCaptions, sessionId, showCaption])

  useEffect(() => () => {
    for (const timer of captionHideTimersRef.current.values()) window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const interactive = Boolean(
      (lotteryEvent && lotteryEvent.payload.finalized === false)
      || (isBuzzerPending(buzzerEvent) && !isBuzzerAccepting(buzzerEvent)),
    )
    void window.lingoActDesktop?.setLotteryInteraction(interactive)
    return () => {
      if (interactive) void window.lingoActDesktop?.setLotteryInteraction(false)
    }
  }, [buzzerEvent, lotteryEvent])

  useEffect(() => {
    if (!buzzerEvent || buzzerEvent.payload.finalized || buzzerEvent.payload.cancelled) return
    const remaining = Date.parse(buzzerEvent.payload.expires_at) - Date.now()
    if (!Number.isFinite(remaining)) return
    const expire = () => setBuzzerEvent((current) => (
      current?.id === buzzerEvent.id
        ? { ...current, payload: { ...current.payload, accepting: false, cancelled: true } }
        : current
    ))
    if (remaining <= 0) {
      expire()
      return
    }
    const timer = window.setTimeout(expire, remaining)
    return () => window.clearTimeout(timer)
  }, [buzzerEvent])

  async function selectLotteryCandidate(winnerId: string) {
    if (!lotteryEvent) return
    setLotteryEvent(await finalizeLottery(sessionId, lotteryEvent.id, winnerId, t))
  }

  async function activateBuzzer() {
    if (!buzzerEvent || !isBuzzerPending(buzzerEvent) || isBuzzerAccepting(buzzerEvent)) return
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) throw new Error(t('noControlRights'))
    const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
      body: { action: 'activate_buzzer', sessionId, presenterToken, eventId: buzzerEvent.id },
    })
    if (error) throw error
    if (!data?.event) throw new Error(data?.message || t('buzzerNotStarted'))
    const nextEvent = data.event as BuzzerSessionEvent
    setBuzzerEvent(nextEvent)
    await window.lingoActDesktop?.showLottery(nextEvent)
  }

  if (!session) return null
  return (
    <PresenterLocaleContext.Provider value={locale}>
    <div className="desktop-overlay-root">
      <DanmakuLayer messages={messages} session={session} />
      {session.captions_enabled && (
        <LiveCaptionOverlay
          fontBold={session.caption_font_bold}
          fontSize={session.caption_font_size}
          position={session.caption_position}
          status={session.caption_status}
          text={liveCaptions[resolvedCaptionLanguage(session.caption_display_language, session.caption_source_language)] || ''}
        />
      )}
      {session.sentence_wall_enabled && (
        <SentenceWallOverlay
          anonymousEnabled={session.anonymous_enabled}
          answers={wallAnswers}
          question={wallQuestion}
        />
      )}
      <LotteryOverlay event={lotteryEvent} onSelect={selectLotteryCandidate} />
      <BuzzerOverlay event={buzzerEvent} onStart={activateBuzzer} />
    </div>
    </PresenterLocaleContext.Provider>
  )
}
