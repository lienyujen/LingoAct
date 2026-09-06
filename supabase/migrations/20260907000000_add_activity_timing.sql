-- Timed activities: a countdown to think, then a countdown to answer.
--
-- Two fields rather than one because the pause before speaking is the exercise
-- in a spoken challenge — twenty seconds to plan, thirty to say it — while a
-- vocabulary race has no preparation at all, only a clock.
--
-- Null means untimed, which is what every existing question is and should stay.
alter table public.questions
  add column if not exists prepare_seconds integer null
  check (prepare_seconds is null or prepare_seconds between 5 and 300);

alter table public.questions
  add column if not exists answer_seconds integer null
  check (answer_seconds is null or answer_seconds between 5 and 600);
