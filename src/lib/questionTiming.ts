import { useEffect, useState } from 'react'
import type { Question } from '../types'

// When a timed question stops accepting answers, as a wall-clock instant.
//
// Anchored on started_at rather than on when this page happened to render it:
// questions are created already active, so started_at is the moment the class
// saw the question, and a student who reconnects halfway through then sees the
// time that is really left instead of a fresh clock. It is also the same anchor
// the database uses to accept or reject the answer, so the countdown on screen
// and the rule that decides are the same rule.
//
// Audio questions are excluded on purpose. Their preparation clock starts when
// the student chooses to begin, not when the question was dispatched, so there
// is no session-wide deadline to compute; the recorder caps the take instead.
export function answerDeadline(question: Question): number | null {
  if (question.type === 'pronunciation' || question.type === 'oral_response') return null
  if (!question.answer_seconds || !question.started_at) return null
  const startedAt = Date.parse(question.started_at)
  return Number.isFinite(startedAt) ? startedAt + question.answer_seconds * 1000 : null
}

// Whole seconds remaining, or null when nothing is being timed.
//
// The three seconds of slack the database allows for a slow round trip are
// deliberately not shown: the student should see the deadline they were given,
// and the grace should quietly rescue an answer sent just before it rather than
// advertise itself as extra time.
export function useSecondsLeft(deadline: number | null): number | null {
  const [left, setLeft] = useState(() => remaining(deadline))

  useEffect(() => {
    setLeft(remaining(deadline))
    if (deadline === null) return
    const timer = window.setInterval(() => setLeft(remaining(deadline)), 250)
    return () => window.clearInterval(timer)
  }, [deadline])

  return left
}

// A quarter-second tick rather than a full second: a timer that only wakes once
// a second drifts visibly against the clock it is counting down to, and skips
// numbers when the tab has been throttled.
function remaining(deadline: number | null) {
  if (deadline === null) return null
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

// 30秒 / 1分鐘 / 1分30秒 — the way a teacher would say it out loud.
export function formatSeconds(seconds: number) {
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}分鐘` : `${minutes}分${rest}秒`
}
