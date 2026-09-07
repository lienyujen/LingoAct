-- AI寫作教練, the scaffolded version: the coach asks, it does not write.
--
-- The simplified form shipped first — the AI lays out the fields, the class
-- fills them in, the teacher reads them. What that leaves out is the part the
-- activity is named for: 一對一鷹架. Between opening the field and sending it,
-- a student can show the coach what they have and be asked about it — what is
-- missing, what is unclear, what to change — and then change it themselves.
--
-- Every round is kept, and that is the point rather than a side effect: 寫作歷程
-- is what the teacher reads afterwards. A first draft, the question that moved
-- it, and what the student did next says more about their writing than the
-- finished paragraph does.
create table if not exists public.writing_coach_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  item_id uuid not null references public.quiz_items(id) on delete cascade,
  -- Keyed on the participant rather than on an attempt: coaching happens BEFORE
  -- submitting, and opening an attempt early would show the class as finished
  -- on the teacher's panel while they are all still writing.
  participant_id uuid not null references public.participants(id) on delete cascade,
  round integer not null check (round between 1 and 5),
  draft text not null check (char_length(draft) between 1 and 4000),
  reply jsonb not null,
  created_at timestamptz not null default now(),
  unique (question_id, item_id, participant_id, round)
);

create index if not exists writing_coach_turns_question_idx
  on public.writing_coach_turns (question_id, participant_id, created_at);

alter table public.writing_coach_turns enable row level security;

-- Same posture as the rest of the quiz tables: reachable only through the Edge
-- Functions. A student reads their own rounds through get_custom_quiz, which is
-- how they get them back after a reload; nobody reads anybody else's.
revoke all on public.writing_coach_turns from public, anon, authenticated;
grant all on public.writing_coach_turns to service_role;

-- Whether this writing exercise offers the coach at all. Off by default, so the
-- form the teacher already asked for stays exactly what it was.
alter table public.quizzes
  add column if not exists coaching boolean not null default false;

notify pgrst, 'reload schema';
