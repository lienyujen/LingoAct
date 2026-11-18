create table if not exists public.handwriting_checks (
  id uuid primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  character text not null check (char_length(character) = 1),
  ink jsonb not null check (jsonb_typeof(ink) = 'array'),
  result text not null check (result in ('match', 'count', 'stroke')),
  wrong_stroke smallint,
  expected_strokes smallint not null,
  created_at timestamptz not null default now()
);
create index if not exists handwriting_checks_question_idx
  on public.handwriting_checks (question_id, created_at desc, id desc);
alter table public.handwriting_checks enable row level security;
revoke all on public.handwriting_checks from anon, authenticated;
grant all on public.handwriting_checks to service_role;
