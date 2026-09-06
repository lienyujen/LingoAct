-- Make the answer clock real.
--
-- Until now the only gate on an answer was questions.status = 'active', so a
-- countdown on the student's page was decoration: a stopped clock, a wrong
-- device clock, or a devtools console all got the answer in anyway. A race
-- everyone can win by fiddling is not a race.
--
-- The deadline is therefore checked against the database's own clock, with
-- started_at as the anchor. Questions are inserted already active, so
-- started_at is the moment the class saw the question -- and anchoring there
-- rather than at page load is also what lets a student who reconnects
-- mid-question see the time that is actually left.
--
-- Three seconds of grace covers the round trip on school wifi. Without it a
-- student who taps at 29.8s is rejected at 30.2s, their answer vanishes, and
-- the teacher sees a bug rather than a deadline.
--
-- Audio questions are deliberately not covered: the recorder caps the take at
-- answer_seconds and the upload that follows can take a while, so a wall clock
-- here would throw away recordings that were made in time. What bounds those
-- is the recording length, and the teacher hearing the result.
drop policy if exists "answer active questions" on public.answers;
create policy "answer active questions" on public.answers for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.sessions
    where sessions.id = answers.session_id and sessions.status = 'active'
  )
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
  and exists (
    select 1 from public.participants
    where participants.id = answers.participant_id
      and participants.session_id = answers.session_id
      and participants.name = answers.participant_name
  )
  and is_correct is null
  and coalesce(char_length(answer_value), 0) <= 500
  and coalesce(char_length(answer_text), 0) <= 1000
  and coalesce(array_length(answer_values, 1), 0) <= 20
  and not exists (
    select 1
    from unnest(coalesce(answer_values, '{}'::text[])) as submitted_value
    where char_length(submitted_value) > 500
  )
);
