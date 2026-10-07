-- Shared translations are served only after participant/session authorization.
-- A lease prevents students selecting the same language together from paying
-- for the same source twice. Edited feedback produces a new content hash.
create table if not exists public.learning_translations (
  session_id uuid not null references public.sessions(id) on delete cascade,
  source_hash text not null,
  locale text not null,
  status text not null check (status in ('pending', 'ready', 'failed')),
  claim_token uuid not null,
  lease_until timestamptz not null,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (session_id, source_hash, locale)
);
alter table public.learning_translations enable row level security;
revoke all on public.learning_translations from anon, authenticated;
grant all on public.learning_translations to service_role;
