import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle, ClipboardText, Hand, HandPointing, Plus, SortDescending, UserMinus, Users, X } from '@phosphor-icons/react'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { RosterManager } from '../components/RosterManager'
import { getPresenterToken } from '../lib/presenterAuth'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { useSessionPresence } from '../lib/useSessionPresence'
import { buzzerWinsFrom, participationRows } from '../lib/participation'
import { getRoster, getSessionRosterId, matchRoster } from '../lib/classRoster'
import type { ClassRoster } from '../lib/classRoster'
import type { ParticipationRow } from '../lib/participation'
import type {
  Answer,
  BoardPost,
  FileResponse,
  Message,
  Participant,
  ParticipantPoint,
  Question,
  Session,
  SessionCustomQuizResults,
  SessionEvent,
} from '../types'
import {
  PresenterLocaleContext,
  presenterLocaleFor,
  presenterLookup,
  storedPresenterLocale,
} from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'

type SortMode = 'engagement' | 'name' | 'joined'

const sortLabels: Record<SortMode, PresenterMessageKey> = {
  engagement: 'sortEngagement',
  name: 'sortName',
  joined: 'sortJoined',
}

function minutes(ms: number) {
  return Math.round(ms / 60_000)
}

// One line of the window. A class list adds a second kind of line to what used
// to be a straight rendering of the participants table: someone who is on the
// list and has not turned up has no participant row at all, so everything that
// hangs off one has to be optional here.
type RosterRow = {
  key: string
  name: string
  studentNo: string
  unit: string
  // Null for a name on the list that nobody has joined under.
  participation: ParticipationRow | null
  online: boolean
  onRoster: boolean
  points: number
}

// Its own window so the presenter can keep the roster in view while working,
// rather than a panel that covers the controls it sits on.
export function RosterPage() {
  const { sessionId = '' } = useParams()
  const [participants, setParticipants] = useState<Participant[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [points, setPoints] = useState<ParticipantPoint[]>([])
  const [quiz, setQuiz] = useState<SessionCustomQuizResults | null>(null)
  const [boardPosts, setBoardPosts] = useState<BoardPost[]>([])
  // The session row carries two things this window needs and nothing else
  // knows: which question the class is actually on, and which language it is
  // being taught in.
  const [session, setSession] = useState<Session | null>(null)
  const [uploadMarks, setUploadMarks] = useState<FileResponse[]>([])
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [sort, setSort] = useState<SortMode>('engagement')
  const [roster, setRoster] = useState<ClassRoster | null>(null)
  const [managerOpen, setManagerOpen] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [calling, setCalling] = useState('')
  const [pendingRemoval, setPendingRemoval] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState('')
  const { onlineParticipantIds } = useSessionPresence(sessionId, { role: 'presenter' })

  // Its own window, so it resolves the class's teaching language itself. The
  // presenter's window already wrote it down when it opened this one, which
  // saves the first paint from arriving in the wrong language and then
  // switching once the session row lands.
  const locale = session
    ? presenterLocaleFor(session.teaching_language)
    : storedPresenterLocale(sessionId)
  const t = presenterLookup(locale)

  // Read from this computer rather than the database; see lib/classRoster.ts.
  const readRoster = useCallback(() => {
    const rosterId = getSessionRosterId(sessionId)
    setRoster(rosterId ? getRoster(rosterId) : null)
  }, [sessionId])

  useEffect(() => { readRoster() }, [readRoster])

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !sessionId) return
    const supabase = requireSupabase()
    const [p, q, a, m, e, pt, s] = await Promise.all([
      supabase.from('participants').select('*').eq('session_id', sessionId).order('joined_at').limit(5000),
      supabase.from('questions').select('*').eq('session_id', sessionId).order('created_at').limit(500),
      supabase.from('answers').select('*').eq('session_id', sessionId).limit(10000),
      supabase.from('messages').select('*').eq('session_id', sessionId).limit(5000),
      supabase.from('session_events').select('*').eq('session_id', sessionId).eq('event_type', 'buzzer').limit(2000),
      supabase.from('participant_points').select('*').eq('session_id', sessionId).limit(5000),
      supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle(),
    ])
    // Someone the presenter removed keeps their row, because everything they
    // answered hangs off it, but they are no longer in the class.
    setParticipants(((p.data || []) as Participant[]).filter((entry) => !entry.removed_at))
    setQuestions((q.data || []) as Question[])
    setAnswers((a.data || []) as Answer[])
    setMessages((m.data || []) as Message[])
    setEvents((e.data || []) as SessionEvent[])
    setPoints((pt.data || []) as ParticipantPoint[])
    setSession((s.data || null) as Session | null)
    // Say so rather than showing a zero. A missing grant on this table comes back
    // as an error here and an empty array, so the + button appeared to do nothing
    // while every tap was in fact being recorded — the failure looked like a
    // broken button instead of a database that had not been brought up to date.
    if (pt.error) {
      setError(presenterLookup(presenterLocaleFor((s.data as Session | null)?.teaching_language))('pointsUnavailable'))
      return
    }

    // Quiz attempts, marked uploads and board cards only come back through the
    // presenter action — file_responses is private to the presenter — and the
    // score would be wrong without them.
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) return
    const [quizResult, uploadResult, boardResult] = await Promise.all([
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_session_custom_quiz_results', sessionId, presenterToken },
      }),
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_file_responses', sessionId, presenterToken },
      }),
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_session_board_posts', sessionId, presenterToken },
      }),
    ])
    if (quizResult.data) setQuiz(quizResult.data as SessionCustomQuizResults)
    setUploadMarks((uploadResult.data?.responses || []) as FileResponse[])
    setBoardPosts((boardResult.data?.posts || []) as BoardPost[])
  }, [sessionId])

  // A class of 145 writes last_seen_at 4.8 times a second between them, and
  // every one of those used to pull the whole session back — participants,
  // answers, messages, questions and events — and then recompute attention for
  // everyone. The changed row is already in the payload, so it is applied
  // straight to the list instead.
  const applyParticipant = useCallback((payload: {
    eventType: string
    new: Record<string, unknown>
    old: Record<string, unknown>
  }) => {
    setParticipants((current) => {
      if (payload.eventType === 'DELETE') {
        const goneId = payload.old?.id as string | undefined
        return goneId ? current.filter((entry) => entry.id !== goneId) : current
      }
      const row = payload.new as unknown as Participant
      if (!row?.id) return current
      // Removing someone is an UPDATE that sets removed_at, and this list is
      // built with those filtered out — so applying the row verbatim would put
      // them straight back.
      if (row.removed_at) return current.filter((entry) => entry.id !== row.id)
      // Appended rather than sorted: the list already arrives in joined_at
      // order and somebody we have not seen before joined last, so the order
      // holds without reading that field off every row.
      const at = current.findIndex((entry) => entry.id === row.id)
      if (at < 0) return [...current, row]
      const next = [...current]
      next[at] = row
      return next
    })
  }, [])

  // Answers, points and board cards arrive in bursts — a whole class at once —
  // and they all want the same reload.
  const reloadTimer = useRef<number | null>(null)
  const scheduleLoad = useCallback(() => {
    if (reloadTimer.current !== null) return
    reloadTimer.current = window.setTimeout(() => {
      reloadTimer.current = null
      void load()
    }, 400)
  }, [load])

  useEffect(() => () => {
    if (reloadTimer.current !== null) window.clearTimeout(reloadTimer.current)
  }, [])

  useEffect(() => {
    void load()
    if (!isSupabaseConfigured || !sessionId) return
    const supabase = requireSupabase()
    const channel = supabase.channel(`roster:${sessionId}`)
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'participants', filter: `session_id=eq.${sessionId}` }, applyParticipant)
    for (const table of ['answers', 'messages', 'questions', 'session_events', 'participant_points', 'board_posts']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `session_id=eq.${sessionId}` }, scheduleLoad)
    }
    channel.subscribe()
    // Attention is reported on a heartbeat rather than as a row change, so the
    // figures need a nudge to stay current.
    const timer = window.setInterval(() => void load(), 20_000)
    return () => {
      window.clearInterval(timer)
      void supabase.removeChannel(channel)
    }
  }, [applyParticipant, load, scheduleLoad, sessionId])

  const activeQuestion = useMemo(() => {
    const current = session?.current_question_id
      ? questions.find((question) => question.id === session.current_question_id && question.status === 'active')
      : null
    if (current) return current
    // Nothing current, or it has been stopped: fall back to an open question
    // that is not the board, and only then to the board itself.
    const openOnes = questions.filter((question) => question.status === 'active')
    return openOnes.find((question) => question.type !== 'board') || openOnes[0] || null
  }, [questions, session?.current_question_id])

  const pointsByParticipant = useMemo(() => {
    const totals = new Map<string, number>()
    for (const award of points) {
      totals.set(award.participant_id, (totals.get(award.participant_id) || 0) + award.points)
    }
    return totals
  }, [points])

  const rows = useMemo(() => {
    const computed = participationRows({
      participants,
      questions,
      answers,
      messages,
      quizAttempts: quiz?.attempts || [],
      buzzerWins: buzzerWinsFrom(events),
      uploadMarks,
      boardPosts,
    }, t)
    const byParticipantId = new Map(computed.map((row) => [row.participant.id, row]))
    const online = (participantId: string | null) => Boolean(participantId) && onlineParticipantIds.includes(participantId as string)

    const toRow = (
      participation: ParticipationRow | null,
      name: string,
      studentNo: string,
      unit: string,
      onRoster: boolean,
      key: string,
    ): RosterRow => ({
      key,
      name,
      studentNo,
      unit,
      participation,
      online: online(participation?.participant.id || null),
      onRoster,
      points: participation ? pointsByParticipant.get(participation.participant.id) || 0 : 0,
    })

    if (!roster) {
      return computed.map((row) => toRow(row, row.participant.name, '', '', false, row.participant.id))
    }

    const { matches, matchedParticipantIds } = matchRoster(roster.entries, participants)
    // The class list first, in the order the presenter put it in, so a teacher
    // reading down it is reading their own list. The name shown is the one on
    // the list, not the one the student typed — that is the whole point of
    // matching, and the two differ by exactly the spacing being ignored.
    const listed = matches.map(({ entry, participantId }) => toRow(
      participantId ? byParticipantId.get(participantId) || null : null,
      entry.name,
      entry.studentNo,
      entry.unit,
      true,
      entry.id,
    ))
    // Whoever typed something that is not on the list still joined, under what
    // they typed. They are not an error, just not identified.
    const unlisted = computed
      .filter((row) => !matchedParticipantIds.has(row.participant.id))
      .map((row) => toRow(row, row.participant.name, '', '', false, row.participant.id))

    return [...listed, ...unlisted]
  // boardPosts belongs here: the cards arrive from their own call, so a memo
  // that did not watch them left 未作答 wrong until something else happened to
  // change and force a recompute.
  }, [answers, boardPosts, events, messages, onlineParticipantIds, participants, pointsByParticipant, questions, quiz, roster, t, uploadMarks])

  const sortedRows = useMemo(() => {
    const scored = rows.some((row) => (row.participation?.score || 0) > 0)
    return [...rows].sort((a, b) => {
      // A raised hand outranks every sort, because it is a question waiting to
      // be taken and a teacher scanning for one should never have to look past
      // the top of the list. Longest wait first among them, which is the order
      // the hands actually went up in.
      const aHand = a.participation?.participant.hand_raised_at || ''
      const bHand = b.participation?.participant.hand_raised_at || ''
      if (Boolean(aHand) !== Boolean(bHand)) return aHand ? -1 : 1
      if (aHand && bHand && aHand !== bHand) return aHand.localeCompare(bHand)
      // Whoever is not here is not actionable, so they sink regardless of sort —
      // and someone on the list who never turned up sinks furthest.
      if (a.online !== b.online) return a.online ? -1 : 1
      if (Boolean(a.participation) !== Boolean(b.participation)) return a.participation ? -1 : 1
      if (sort === 'name') return a.name.localeCompare(b.name, 'zh-Hant')
      if (sort === 'joined') {
        const left = a.participation?.participant.joined_at || ''
        const right = b.participation?.participant.joined_at || ''
        return left.localeCompare(right)
      }
      // Before anyone has done anything the scores are all zero and the order
      // would be arbitrary, so fall back to something stable and readable.
      if (!scored) return a.name.localeCompare(b.name, 'zh-Hant')
      return (b.participation?.score || 0) - (a.participation?.score || 0)
    })
  }, [rows, sort])

  const onlineCount = sortedRows.filter((row) => row.online).length
  const raisedCount = sortedRows.filter((row) => row.participation?.participant.hand_raised_at).length
  const joinedCount = participants.length

  async function callPresenter(body: Record<string, unknown>, failure: string) {
    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) { setError(t('rosterNoRights')); return false }
    try {
      const { data, error: callError } = await requireSupabase().functions.invoke('presenter-action', {
        body: { ...body, sessionId, presenterToken },
      })
      if (callError) throw callError
      if (data?.message && !data?.ok && !data?.point) throw new Error(data.message)
      setError('')
      return true
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : failure)
      return false
    }
  }

  // One hand, or every hand at once when the presenter has finished taking
  // questions. Omitting the id is what means "all of them".
  async function lowerHands(participantId?: string) {
    setBusyId(participantId || 'all')
    if (await callPresenter({ action: 'lower_hands', participantId }, t('lowerHandsFailed'))) {
      await load()
    }
    setBusyId('')
  }

  async function award(participantId: string) {
    setBusyId(participantId)
    if (await callPresenter({ action: 'award_participant_point', participantId, points: 1 }, t('awardFailed'))) {
      await load()
    }
    setBusyId('')
  }

  async function revoke(participantId: string) {
    setBusyId(participantId)
    if (await callPresenter({ action: 'revoke_participant_point', participantId }, t('revokeFailed'))) {
      await load()
    }
    setBusyId('')
  }

  async function removeParticipant() {
    if (!pendingRemoval) return
    const { id } = pendingRemoval
    setBusyId(id)
    if (await callPresenter({ action: 'remove_participant', participantId: id }, t('removeFailed'))) {
      await load()
    }
    setBusyId('')
    setPendingRemoval(null)
  }

  async function callOn(participantId: string, name: string) {
    setCalling(participantId)
    await callPresenter({ action: 'draw_lottery', candidateIds: [participantId] }, t('callOnFailed', { name }))
    setCalling('')
  }

  function cycleSort() {
    setSort((current) => (current === 'engagement' ? 'name' : current === 'name' ? 'joined' : 'engagement'))
  }

  return (
    <PresenterLocaleContext.Provider value={locale}>
    <main className="roster-window">
      <header className="roster-heading">
        <h1><Users size={17} />{t('rosterTitle')}</h1>
        <span className="roster-heading-actions">
          <button
            aria-label={t('rosterManageLabel')}
            className="icon-button ghost-button"
            title={t('rosterManage')}
            type="button"
            onClick={() => setManagerOpen(true)}
          >
            <ClipboardText size={18} />
          </button>
          <button
            aria-label={t('closeRoster')}
            className="icon-button ghost-button"
            title={t('close')}
            type="button"
            onClick={() => window.lingoActDesktop?.close()}
          >
            <X size={18} />
          </button>
        </span>
      </header>

      <div className="roster-toolbar">
        <span className="roster-count">
          {roster
            ? t('rosterCountListed', { online: onlineCount, joined: joinedCount, listed: roster.entries.length })
            : t('rosterCountJoined', { online: onlineCount, joined: joinedCount })}
        </span>
        {raisedCount > 0 && (
          <button
            className="roster-hand is-clear"
            disabled={busyId === 'all'}
            title={t('lowerAllHands')}
            type="button"
            onClick={() => void lowerHands()}
          >
            <Hand size={14} />{raisedCount}
          </button>
        )}
        <button className="roster-sort" type="button" title={t('toggleSort')} onClick={cycleSort}>
          <SortDescending size={14} />{t(sortLabels[sort])}
        </button>
      </div>

      {activeQuestion && (
        <p className="roster-hint">{t('rosterPendingHint')}</p>
      )}
      {error && <p className="error roster-error">{error}</p>}

      {sortedRows.length ? (
        <ol className="roster-list">
          {sortedRows.map((row) => {
            const participation = row.participation
            const pending = Boolean(activeQuestion) && row.online
              && !participation?.answeredQuestionIds.has(activeQuestion?.id || '')
            // Away for a stretch rather than a moment between tabs.
            const distracted = row.online && (participation?.unfocusedMs || 0) >= 2 * 60_000
            const classes = ['roster-row']
            if (!participation) classes.push('is-absent')
            else if (!row.online) classes.push('is-offline')
            if (pending) classes.push('is-pending')
            if (distracted) classes.push('is-distracted')
            const busy = busyId === participation?.participant.id
            return (
              <li className={classes.join(' ')} key={row.key}>
                {/* The dot's place is taken by the hand while one is up, so the
                    line reads as "waiting" rather than merely "here", and the
                    same spot is what the presenter taps to answer it. */}
                {participation?.participant.hand_raised_at ? (
                  <button
                    aria-label={t('lowerHandFor', { name: row.name })}
                    className="roster-hand"
                    disabled={busy}
                    title={t('lowerHand')}
                    type="button"
                    onClick={() => void lowerHands(participation.participant.id)}
                  >
                    <Hand size={15} />
                  </button>
                ) : (
                  <span className={`roster-dot${row.online ? ' is-online' : ''}`} />
                )}
                <span className="roster-name">
                  {row.name}
                  {/* A green tick means this line on the class list was claimed by
                      somebody who actually joined — the one thing a teacher is
                      scanning for when they take attendance. */}
                  {row.onRoster && participation && (
                    <CheckCircle aria-label={t('rosterPresent')} className="roster-present" size={14} />
                  )}
                  {participation && participation.badges.length > 0 && (
                    <span className="roster-badges" title={participation.badges.map((badge) => `${badge.label}：${badge.detail}`).join('\n')}>
                      {participation.badges.map((badge) => <span key={badge.key}>{badge.icon}</span>)}
                    </span>
                  )}
                </span>
                <span className="roster-tags">
                  {row.studentNo && <span className="roster-tag is-quiet">{row.studentNo}</span>}
                  {!row.onRoster && roster && <span className="roster-tag is-unlisted">{t('tagUnlisted')}</span>}
                  {!participation && <span className="roster-tag is-absent">{t('tagAbsent')}</span>}
                  {pending && <span className="roster-tag is-pending">{t('tagPending')}</span>}
                  {distracted && <span className="roster-tag is-distracted">{t('tagAway', { n: minutes(participation?.unfocusedMs || 0) })}</span>}
                </span>

                {/* Nothing below this point applies to a name nobody has joined
                    under: there is no participant to score, credit or remove. */}
                {participation && (
                  <>
                    {/* One number, because pressing + has to move the number the
                        presenter is looking at. The split that matters — earned
                        against awarded — is kept where it can be audited: its own
                        columns in the exported report. */}
                    <span
                      className="roster-score"
                      title={[
                        t('statAnswers', { n: participation.answerCount }),
                        t('statCorrect', { n: participation.correctCount }),
                        t('statMessages', { n: participation.messageCount }),
                        t('statBuzzes', { n: participation.quickCount }),
                        participation.uploadScore !== null ? t('statUploadScore', { n: participation.uploadScore }) : '',
                        row.points > 0 ? t('statTeacherPoints', { n: row.points }) : '',
                      ].filter(Boolean).join('．')}
                    >
                      {participation.score + row.points}
                    </span>
                    {row.points > 0 && (
                      <button
                        className="roster-bonus"
                        disabled={busy}
                        title={t('bonusHint', { n: row.points })}
                        type="button"
                        onClick={() => void revoke(participation.participant.id)}
                      >
                        +{row.points}
                      </button>
                    )}
                    <button
                      aria-label={t('awardLabel', { name: row.name })}
                      className="roster-award"
                      disabled={busy}
                      title={t('awardHint')}
                      type="button"
                      onClick={() => void award(participation.participant.id)}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      aria-label={t('callOn', { name: row.name })}
                      className="roster-call"
                      disabled={!row.online || calling === participation.participant.id}
                      title={t('callOnHint')}
                      type="button"
                      onClick={() => void callOn(participation.participant.id, row.name)}
                    >
                      <HandPointing size={14} />
                    </button>
                    <button
                      aria-label={t('removeLabel', { name: row.name })}
                      className="roster-remove"
                      disabled={busy}
                      title={t('removeHint')}
                      type="button"
                      onClick={() => setPendingRemoval({ id: participation.participant.id, name: row.name })}
                    >
                      <UserMinus size={14} />
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ol>
      ) : <p className="muted roster-empty">{t('noStudentsJoined')}</p>}

      <RosterManager
        open={managerOpen}
        sessionId={sessionId}
        onChanged={readRoster}
        onClose={() => { setManagerOpen(false); readRoster() }}
      />

      <ConfirmDialog
        busy={Boolean(busyId)}
        confirmLabel={t('removeConfirm')}
        description={t('removeConfirmBody', { name: pendingRemoval?.name || '' })}
        open={Boolean(pendingRemoval)}
        title={t('removeConfirmTitle')}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => void removeParticipant()}
      />
    </main>
    </PresenterLocaleContext.Provider>
  )
}
