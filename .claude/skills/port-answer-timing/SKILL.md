---
name: port-answer-timing
description: Port LingoAct's answer clock (作答時間 / 準備時間) and the presenter's stop/resume answering control (停止/恢復作答) into another codebase. Use when asked to add a per-question countdown, a server-enforced answer deadline, or a teacher control that closes and reopens answering on the question the class is on — and when porting these from LingoAct to InterAct or any sibling app.
---

# 作答時間 & 停止/恢復作答

Two mechanics that ship together and are usually asked for together, because
each is what makes the other honest: a clock nobody enforces is decoration, and
a stop button with no way back forces the teacher to re-dispatch and lose the
answers already in.

This is the LingoAct implementation written down so it can be rebuilt
elsewhere. It states the shape, the enforcement, and the reasons — the reasons
matter most, because every one of them is a thing that was wrong first.

**Names in this document are LingoAct's.** Translate them to the host app's
schema before writing code: LingoAct has `questions`, `answers`, `participants`,
`sessions`, one Edge Function for the teacher (`presenter-action`) and one for
the student (`participant-action`). If the host app calls the teacher a host and
the question an activity, use its words.

---

## 1. What the teacher sets

Two independent clocks per question, both nullable:

| Column | Range | Meaning when null |
| --- | --- | --- |
| `prepare_seconds` | 5–300 | no thinking time; answering starts at once |
| `answer_seconds` | 5–600 | untimed |

```sql
alter table public.questions
  add column if not exists prepare_seconds integer null
  check (prepare_seconds is null or prepare_seconds between 5 and 300);

alter table public.questions
  add column if not exists answer_seconds integer null
  check (answer_seconds is null or answer_seconds between 5 and 600);
```

**Two fields rather than one.** The pause before speaking IS the exercise in a
spoken challenge — twenty seconds to plan, thirty to say it. A vocabulary race
has no preparation at all, only a clock. One combined field cannot express
either without lying about the other.

**Null means untimed, and every pre-existing question stays null.** Adding a
clock must not retroactively time work that was dispatched without one.

### Which question types get which clock

```ts
const timedTypes = new Set(['poll', 'multiple_choice', 'true_false', 'short_answer', 'pronunciation', 'oral_response'])
const spokenTypes = new Set(['pronunciation', 'oral_response'])
```

- `answer_seconds` only for `timedTypes`.
- `prepare_seconds` only for `spokenTypes` — nothing else has anything to prepare.
- Everything outside those sets is stored as `null`, **not merely hidden in the
  UI**. Storing a limit on a type that never reads it leaves a number behind
  that looks like a rule and is not one.

`send_screen` (nothing to answer), `custom_quiz` and `file_upload` (paced by the
attempt or by the upload, not by a wall clock) are all untimed by design.

### Server-side validation

```ts
function timingSeconds(value: unknown, max: number) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 5 || value > max) return undefined
  return value
}
```

Three outcomes, and the difference is load-bearing: `null` is "untimed",
`undefined` is "the client sent rubbish" → reject the whole dispatch with 400.
Coercing bad input to null would silently dispatch an untimed question the
teacher thought they had timed.

At the dispatch site:

```ts
const prepareSeconds = timedTypes.has(type) && spokenTypes.has(type) ? timingSeconds(input.prepareSeconds, 300) : null
const answerSeconds = timedTypes.has(type) ? timingSeconds(input.answerSeconds, 600) : null
if (prepareSeconds === undefined || answerSeconds === undefined) {
  return jsonResponse({ message: '時間設定不正確。' }, 400)
}
```

### The teacher's control

Chips, not a number input — the teacher sets this mid-class and a row of taps
beats typing into a spinner while thirty students wait.

```tsx
// TimingRow: label, an "off" label, presets, value, onChange.
// offLabel differs by clock and the difference matters to the teacher reading
// the row: a spoken answer's "off" is 不準備, a written one's is 不限時.
const ANSWER_PRESETS: Array<number | null> = [null, 30, 60, 90, 180]
const PREPARE_PRESETS: Array<number | null> = [null, 10, 20, 30]
```

Format the presets the way a teacher says them out loud — `30秒` / `1分鐘` /
`1分30秒` in Chinese, `30s` / `1m` / `1m 30s` elsewhere. This is teacher-facing
text, so it follows the teacher's interface language, not the student's.

---

## 2. The deadline

**Anchor: `questions.started_at`.** Questions are inserted already `active`, so
`started_at` is the moment the class saw the question.

```ts
export function answerDeadline(question: Question): number | null {
  if (question.type === 'pronunciation' || question.type === 'oral_response') return null
  if (!question.answer_seconds || !question.started_at) return null
  const startedAt = Date.parse(question.started_at)
  return Number.isFinite(startedAt) ? startedAt + question.answer_seconds * 1000 : null
}
```

**Why `started_at` and not "when this page rendered it".** A student who
reconnects halfway through must see the time that is really left, not a fresh
clock. It is also the same anchor the database uses to accept or reject the
answer, so the countdown on screen and the rule that decides are one rule
rather than two that drift.

**Audio questions are excluded on purpose.** Their preparation clock starts when
the student chooses to begin, not when the question was dispatched, so there is
no session-wide deadline to compute. What bounds a recording is the recorder
itself (see §5).

### The countdown

```ts
export function useSecondsLeft(deadline: number | null): number | null
// ticks every 250ms, returns Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
```

A quarter-second tick, not one second: a timer that wakes once a second drifts
visibly against the clock it is counting down to, and skips numbers outright
when the tab has been throttled.

Both sides render the same number from the same function. **The teacher must see
the clock the class is watching** — without it they are deciding when to move on
blind, which is the whole reason a timed question was set.

---

## 3. Enforcing it

> This is the part that is usually missing. Until it existed, the only gate on
> an answer was `status = 'active'`, so the countdown was decoration: a stopped
> clock, a wrong device clock, or a devtools console all got the answer in
> anyway. **A race everyone can win by fiddling is not a race.**

Enforce against the **database's own clock**, in the insert policy:

```sql
create policy "answer active questions" on public.answers for insert
to anon, authenticated
with check (
  exists (select 1 from public.sessions
          where sessions.id = answers.session_id and sessions.status = 'active')
  and exists (
    select 1 from public.questions
    where questions.id = answers.question_id
      and questions.session_id = answers.session_id
      and questions.status = 'active'
      and questions.type <> 'custom_quiz'
      and (
        questions.answer_seconds is null
        or questions.started_at is null
        or now() <= questions.started_at + make_interval(secs => questions.answer_seconds + 3)
      )
  )
  -- ...participant identity and length limits unchanged
);
```

**The three seconds of grace** cover the round trip on school wifi. Without
them a student who taps at 29.8s is rejected at 30.2s, their answer vanishes,
and the teacher sees a bug rather than a deadline.

**The grace is never shown.** The student sees the deadline they were given; the
grace quietly rescues an answer sent just before it rather than advertising
itself as extra time.

**Where the host app has no RLS** (a plain API server), the same check goes in
the write handler — the requirement is that it reads the *server's* clock and
the stored `started_at`, never a timestamp the client sent.

### Paths that are not `answers`

| Path | Gate | Clock? |
| --- | --- | --- |
| `answers` insert (poll, choice, T/F, short answer) | RLS policy above | yes |
| `submit_custom_quiz` | Edge Function, 409 `測驗已停止作答。` | no |
| `submit_flashcard_try` | Edge Function, 409 `本題已停止作答。` | no |
| `prepare_file_upload` / `submit_file_response` | Edge Function, 409 `教師已停止收件。` | no |
| `prepare_caption_recording` / `submit_caption` | same, via the file response's question | no |
| recordings | recorder length cap | see §5 |

Every one of them checks `question.status !== 'active'` on the server. The
message differs because what the student was doing differs — "answering has
stopped" and "the teacher has stopped collecting" are different sentences to
read halfway through an upload.

Quizzes and uploads are excluded from the wall clock deliberately: a quiz is
paced by its own attempt flow, and an upload's duration is the upload's. They
still honour stop/resume, which is what a teacher actually reaches for there.

---

## 4. Stop and resume

`questions.status` is `'draft' | 'active' | 'stopped' | 'closed'`, with
`started_at` and `stopped_at` alongside.

**Only two of those four are ever written.** Nothing in LingoAct sets `'draft'`
or `'closed'`: questions are inserted `active` and the only transitions are
active ⇄ stopped. `'closed'` is *read* in two places as a defensive
`in ('stopped', 'closed')`, and `'draft'` is dead. Port the two states you need
and leave the other two out of the CHECK unless the host app has a real use for
them — a state nothing can reach is a state nothing is tested in.

`stopped_at` is likewise written and never read except through the type. Keep it
(it is what a report or an audit would want, and it costs a column) but do not
build anything on it.

### Invariant: one question accepts answers at a time

Every dispatch stops whatever was live first:

```ts
const stoppedAt = new Date().toISOString()
await supabase.from('questions')
  .update({ status: 'stopped', stopped_at: stoppedAt })
  .eq('session_id', sessionId).eq('status', 'active')
```

Two questions accepting answers with the students' pages showing only the newer
means the earlier one takes answers nobody can see.

### `stop_question`

```ts
await supabase.from('questions')
  .update({ status: 'stopped', stopped_at: new Date().toISOString() })
  .eq('id', questionId).eq('session_id', sessionId)
  .eq('status', 'active')          // ← the guard IS the concurrency control
  .select('*').maybeSingle()
// no row → 409 '題目已停止或不存在。'
```

The `.eq('status', 'active')` makes this a compare-and-set. Two teachers on two
devices, or a double tap, cannot double-stop: the second gets a 409 rather than
overwriting `stopped_at`.

### `resume_question`

```ts
// 1. Only the question the class is actually ON.
const { data: session } = await supabase.from('sessions')
  .select('current_question_id, status').eq('id', sessionId).maybeSingle()
if (!session || session.status !== 'active') return jsonResponse({ message: '課堂已結束。' }, 409)
if (session.current_question_id !== questionId) {
  return jsonResponse({ message: '這題已經不是目前的題目，請重新派送。' }, 409)
}

// 2. started_at moves to NOW.
await supabase.from('questions')
  .update({ status: 'active', stopped_at: null, started_at: new Date().toISOString() })
  .eq('id', questionId).eq('session_id', sessionId)
  .eq('status', 'stopped')         // ← compare-and-set again
  .select('*').maybeSingle()
// no row → 409 '這題目前不是停止狀態。'
```

**Why resume exists at all.** Stopping is how a teacher ends a question;
reopening it is how they give the class another minute after someone asks.
Without it the only way back was to dispatch the question again, which threw
away the answers already in.

**Why `started_at` moves to now.** It is what the answer clock counts from. A
timed question reopened after its window had passed would otherwise come back
*already expired*, refusing every answer it just invited. Reopening restarts the
clock — and that is the honest behaviour: the teacher is granting more time, not
un-expiring old time.

**Why only `current_question_id`.** Reviving an older question would leave two
accepting answers while the students' pages show only the newer.

`stopped_at: null` is set so nothing downstream reads a stop time for a question
that is running.

---

## 5. Recordings are different

A spoken answer is not gated by a wall clock. Instead:

- `prepare_seconds` counts down on the student's device, and **reaching zero
  starts the recording** rather than merely unlocking a button — a challenge
  that waits for another tap is not timed.
- `answer_seconds` becomes the recorder's `maxDurationMs`; a 200ms interval stops
  the `MediaRecorder` when it is reached.
- The upload that follows can take a while, so a server deadline here would
  throw away recordings that were made in time. What bounds them is the
  recording length, and the teacher hearing the result.

If the host app has no audio questions, drop §5 and `prepare_seconds` with it.

---

## 6. What the student sees

```ts
const timeUp = secondsLeft === 0
const acceptingAnswers = question.status === 'active' && !timeUp
```

**The clock running out and the teacher stopping the question are separate
things, and the student is told which happened** — `answerClosed` (作答時間已結束)
versus the stopped state. "It closed" and "the teacher closed it" call for
different reactions from a student, and collapsing them into one message makes
the app feel arbitrary.

The countdown is `aria-live="off"`: a number that changes every second would
otherwise be read aloud every second.

### Propagation

The student page subscribes to `postgres_changes` on `questions` filtered by
`session_id` and reloads on any event. Stop, resume and dispatch all land as
updates to that table, so one subscription covers all three — there is no
separate "answering closed" message to keep in sync.

Where the host app has no realtime, poll the current question; the important
part is that `status` and `started_at` are the only things the student's page
needs in order to be right.

---

## 7. What the teacher sees

```ts
// Only the question the class is on can be stopped or reopened; an older one in
// the history is a record, not a control.
const stoppable = isCurrentQuestion && question.status === 'active'
const resumable = isCurrentQuestion && question.status === 'stopped'
```

One button that changes its mind, not two that each go one way:

- `active` → `停止作答` (square icon), title `停止收答，之後仍可恢復`
- `stopped` → `恢復作答` (play icon), title `讓學生可以再次作答`

The title says the stop is reversible, because a teacher who does not know that
will not press it mid-activity.

The button holds its own `toggling` and error state so a failed stop shows on
the control the teacher pressed, rather than in a panel somewhere else.

### Things that require `stopped`

Both of these are gated on the question no longer accepting answers, and the
reason is the same in both cases — acting while the class is still working
either interrupts them or draws a conclusion from half the data:

- **AI analysis of the class's answers**: `question.status !== 'active'`.
- **抽選未作答學生** (draw from those who have not answered):
  `status === 'stopped' || status === 'closed'`.

---

## Port checklist

- [ ] `prepare_seconds` / `answer_seconds` columns, nullable, with the range checks
- [ ] `started_at` defaults to now on insert; `stopped_at` nullable
- [ ] `timingSeconds` three-way validation, rejecting the dispatch on bad input
- [ ] Per-type gating so untimed types store `null`
- [ ] `answerDeadline` anchored on `started_at`, audio excluded
- [ ] `useSecondsLeft` at 250ms, shared by both sides
- [ ] **Server-side deadline check with 3s grace, on the server's clock**
- [ ] Dispatch stops the previously active question
- [ ] `stop_question` / `resume_question` with `.eq('status', ...)` compare-and-set
- [ ] Resume restricted to `current_question_id`, and it moves `started_at`
- [ ] Student distinguishes "time up" from "teacher stopped"
- [ ] Realtime (or polling) on the question row
- [ ] Analysis and draw-unanswered gated on not-active

## Where the code is in LingoAct

| Piece | File |
| --- | --- |
| deadline, countdown, formatting | `src/lib/questionTiming.ts` |
| teacher's chips | `src/components/TimingRow.tsx` |
| where the teacher sets it | `src/components/QuestionEditor.tsx` |
| teacher's stop/resume button | `src/components/QuestionResult.tsx` (`QuestionStatusActions`) |
| same button for quizzes | `src/components/CustomQuizResult.tsx` |
| student countdown and gating | `src/components/ParticipantQuestionView.tsx` |
| recorder clocks | `src/components/AudioRecorder.tsx` |
| actions | `supabase/functions/presenter-action/index.ts` (`stop_question`, `resume_question`) |
| student-side gates | `supabase/functions/participant-action/index.ts` |
| columns | `supabase/migrations/20260907000000_add_activity_timing.sql` |
| enforcement | `supabase/migrations/20260908000000_enforce_answer_deadline.sql` |
