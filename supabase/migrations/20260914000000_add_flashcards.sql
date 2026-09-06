-- 數位 Flashcard: a drill, not a test.
--
-- Every other activity here asks a class one question at a time. A flashcard
-- deck is the opposite: each student works through it at their own speed, and
-- the cards they get wrong come back. That is the whole value of doing it on a
-- tablet rather than on paper, and it is the one thing the quiz machinery could
-- not express, because quiz_item_answers is unique per (attempt, item) — one
-- answer per card, ever.
--
-- So tries get their own table and quiz_item_answers keeps its meaning: the
-- final answer, which scoring already reads. Nothing that works today changes.
create table if not exists public.quiz_item_tries (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  item_id uuid not null references public.quiz_items(id) on delete cascade,
  answer_text text null check (coalesce(char_length(answer_text), 0) <= 500),
  answer_values text[] null,
  -- Decided on the server against the key the student cannot read, so a drill
  -- can give instant feedback without handing out the answers up front.
  correct boolean not null,
  tried_at timestamptz not null default now()
);

create index if not exists quiz_item_tries_attempt_id_idx on public.quiz_item_tries (attempt_id);
create index if not exists quiz_item_tries_item_id_idx on public.quiz_item_tries (item_id);

alter table public.quiz_item_tries enable row level security;

-- Same posture as every other quiz table: reachable only through the Edge
-- Functions, because a try carries whether it was right and reading another
-- student's tries would be reading their score.
revoke all on public.quiz_item_tries from public, anon, authenticated;
grant all on public.quiz_item_tries to service_role;

alter table public.quizzes drop constraint if exists quizzes_requested_type_check;
alter table public.quizzes
  add constraint quizzes_requested_type_check
  check (requested_type in (
    'random', 'multiple_choice', 'fill_blank', 'short_answer',
    'ordering', 'matching', 'writing', 'flashcard'
  ));
