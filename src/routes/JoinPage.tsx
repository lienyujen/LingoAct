import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, User, Waves } from '@phosphor-icons/react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { SetupNotice } from '../components/SetupNotice'
import { StudentSocialLinks } from '../components/StudentSocialLinks'
import { ParticipantLanguageSwitcher } from '../components/ParticipantLanguageSwitcher'
import { getDeviceId } from '../lib/device'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { participantLocaleFromStorage, participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'
import type { Participant, Session } from '../types'

export function JoinPage() {
  const { sessionId: sessionReference = '' } = useParams()
  const [session, setSession] = useState<Session | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sessionChecked, setSessionChecked] = useState(false)
  const [sessionLookupError, setSessionLookupError] = useState('')
  const [returning, setReturning] = useState(false)
  const [locale, setLocale] = useState<ParticipantLocale>(participantLocaleFromStorage)
  // The teacher's 導引語 is the starting point, not a lock: a student who has
  // chosen for themselves keeps their choice, which is why the stored value wins
  // inside participantLocaleFromStorage.
  useEffect(() => {
    if (session?.guidance_language) setLocale(participantLocaleFromStorage(session.guidance_language))
  }, [session?.guidance_language])
  const navigate = useNavigate()
  const location = useLocation()

  function changeLocale(nextLocale: ParticipantLocale) {
    localStorage.setItem('lingoact_participant_locale', nextLocale)
    setLocale(nextLocale)
  }

  // Students commonly scan, join, wander off, then scan again to come back. The
  // name box was asked a second time but ignored — the server keys a participant
  // to the device, so whatever they typed they returned as their first name.
  // Recognising the device instead skips a step that never did anything.
  useEffect(() => {
    if (!isSupabaseConfigured || !session?.id) return
    const participantId = localStorage.getItem(`lingoact_participant_${session.id}`)
    const participantToken = localStorage.getItem(`lingoact_participant_token_${session.id}`)
    if (!participantId || !participantToken) return

    let cancelled = false
    void (async () => {
      try {
        // A stored token can outlive the participant it belonged to, so it is
        // checked before the form is skipped rather than after.
        const { data, error: checkError } = await requireSupabase().functions.invoke('participant-action', {
          body: { action: 'heartbeat', sessionId: session.id, participantId, participantToken, unfocusedMs: 0 },
        })
        if (cancelled) return
        if (checkError || !data?.ok) {
          localStorage.removeItem(`lingoact_participant_${session.id}`)
          localStorage.removeItem(`lingoact_participant_token_${session.id}`)
          return
        }
        setReturning(true)
        navigate(`/participant/${session.id}${location.search}`, { replace: true })
      } catch {
        // Offline or the function is missing: fall through to the name form,
        // which still works.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [location.search, navigate, session?.id])

  useEffect(() => {
    if (!isSupabaseConfigured || !sessionReference) return

    let cancelled = false
    setSessionChecked(false)
    setSessionLookupError('')
    const isSessionId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionReference)
    requireSupabase()
      .from('sessions')
      .select('*')
      .eq(isSessionId ? 'id' : 'code', sessionReference)
      .maybeSingle()
      .then(({ data, error: lookupError }) => {
        if (cancelled) return
        setSession((data as Session | null) || null)
        setSessionLookupError(lookupError ? participantText(locale, 'sessionLoadFailed') : '')
        setSessionChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [locale, sessionReference])

  async function joinErrorMessage(joinError: unknown) {
    const response = (joinError as { context?: Response } | null)?.context
    if (response) {
      try {
        const payload = await response.clone().json() as { message?: unknown }
        if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim()
      } catch {
        // Fall through to the normal error message.
      }
    }
    return joinError instanceof Error ? joinError.message : participantText(locale, 'joinFailed')
  }

  async function join(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError(participantText(locale, 'nameRequired'))
      return
    }

    setBusy(true)
    setError('')
    try {
      if (!session) throw new Error(participantText(locale, 'sessionNotFound'))
      const supabase = requireSupabase()
      const deviceId = getDeviceId()
      const { data, error: joinError } = await supabase.functions.invoke('participant-action', {
        body: { action: 'join_session', sessionReference, name: trimmed, deviceId },
      })
      if (joinError) throw new Error(await joinErrorMessage(joinError))
      if (!data?.participant || !data?.participantToken) throw new Error(data?.message || '加入失敗。')
      const participant = data.participant as Participant
      const sessionId = participant.session_id

      localStorage.setItem(`lingoact_participant_${sessionId}`, participant.id)
      localStorage.setItem(`lingoact_participant_token_${sessionId}`, data.participantToken)
      localStorage.setItem(`lingoact_name_${sessionId}`, participant.name)
      navigate(`/participant/${sessionId}${location.search}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : '加入失敗'
      if (message.includes('找不到這個場次') || message.includes('Session not found')) {
        setSession(null)
        setSessionChecked(true)
      } else {
        setError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  if (sessionChecked && !session && !sessionLookupError) {
    return (
      <main className="participant-page participant-ended-page">
        <ParticipantLanguageSwitcher locale={locale} onChange={changeLocale} />
        <SetupNotice />
        <StudentSocialLinks />
        <section className="participant-ended-hero">
          <span className="participant-ended-icon"><Waves size={34} /></span>
          <h1>{participantText(locale, 'sessionGoneTitle')}</h1>
          <p>{participantText(locale, 'sessionGoneMessage')}</p>
        </section>
      </main>
    )
  }

  // Shown for the moment between recognising the device and the class page
  // appearing, so the name form does not flash up and vanish.
  if (returning) {
    return (
      <main className="center-page">
        <section className="panel form-panel">
          <span className="form-heading-icon"><User size={24} /></span>
          <h1>{participantText(locale, 'welcomeBack')}</h1>
          <p className="muted">
            {participantText(locale, 'signingBackIn', { name: localStorage.getItem(`lingoact_name_${session?.id}`) || '' })}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="center-page">
      <ParticipantLanguageSwitcher locale={locale} onChange={changeLocale} />
      <SetupNotice />
      <StudentSocialLinks />
      <form autoComplete="off" className="panel form-panel" onSubmit={join}>
        <span className="form-heading-icon"><User size={24} /></span>
        <h1>{participantText(locale, 'joinTitle', { title: session?.title || participantText(locale, 'untitledSession') })}</h1>
        <p className="muted">{participantText(locale, session?.status === 'ended' ? 'enterNameToView' : 'enterNameToJoin')}</p>
        <label>
          {participantText(locale, 'yourName')}
          <input
            autoComplete="name"
            autoFocus
            inputMode="text"
            name="participant-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={participantText(locale, 'namePlaceholder')}
          />
        </label>
        {(error || sessionLookupError) && <p className="error">{error || sessionLookupError}</p>}
        <button disabled={busy || !session || Boolean(sessionLookupError)} type="submit">
          {participantText(locale, busy ? 'joining' : session?.status === 'ended' ? 'viewClass' : 'joinAction')}
          {!busy && <ArrowRight size={18} />}
        </button>
      </form>
    </main>
  )
}
