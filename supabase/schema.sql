create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  code text unique not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  danmaku_enabled boolean not null default true,
  anonymous_enabled boolean not null default true,
  current_question_id uuid null,
  short_join_url text null,
  exit_ticket_prompt text null,
  exit_ticket_prompt_en text null,
  exit_ticket_category text null check (exit_ticket_category in ('lesson_summary', 'learning_assessment', 'course_satisfaction', 'student_question')),
  exit_ticket_response_type text null check (exit_ticket_response_type in ('text', 'rating')),
  recording_enabled boolean not null default false,
  captions_enabled boolean not null default false,
  caption_status text not null default 'idle' check (caption_status in ('idle', 'starting', 'live', 'error')),
  caption_source_language text not null default 'zh-tw',
  caption_display_language text not null default 'zh-tw',
  caption_font_size integer not null default 32 check (caption_font_size between 24 and 96),
  caption_font_bold boolean not null default false,
  caption_position text not null default 'bottom' check (caption_position in ('top', 'center', 'bottom')),
  caption_started_at timestamptz null,
  interpretation_enabled boolean not null default false,
  interpretation_audio_enabled boolean not null default false,
  interpretation_languages text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  ended_at timestamptz null,
  constraint sessions_captions_require_recording check (not captions_enabled or recording_enabled)
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  device_id text not null,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unfocused_ms bigint not null default 0,
  focus_streak_ms bigint not null default 0,
  unique (session_id, device_id)
);

create table if not exists public.presenter_session_keys (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.participant_session_keys (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  participant_name text not null,
  content text not null,
  anonymous_at_display boolean not null default true,
  displayed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.screenshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  storage_path text not null,
  public_url text not null,
  screen_summary jsonb null,
  ai_status text not null default 'skipped' check (ai_status in ('pending', 'success', 'failed', 'skipped')),
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  screenshot_id uuid null references public.screenshots(id) on delete set null,
  type text not null check (type in ('send_screen', 'poll', 'multiple_choice', 'true_false', 'short_answer', 'pronunciation', 'oral_response', 'custom_quiz', 'file_upload')),
  status text not null default 'active' check (status in ('draft', 'active', 'stopped', 'closed')),
  title text not null default '',
  prompt_text text null,
  options jsonb not null default '[]'::jsonb,
  allow_multiple boolean not null default false,
  correct_answer text null,
  correct_answers text[] not null default '{}'::text[],
  started_at timestamptz null default now(),
  stopped_at timestamptz null,
  translations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.sessions
  drop constraint if exists sessions_current_question_id_fkey;

alter table public.sessions
  add constraint sessions_current_question_id_fkey
  foreign key (current_question_id) references public.questions(id)
  on delete set null;

create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  participant_name text not null,
  answer_value text null,
  answer_values text[] null,
  answer_text text null,
  is_correct boolean null,
  submitted_at timestamptz not null default now(),
  unique (question_id, participant_id)
);

create table if not exists public.audio_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  participant_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  duration_ms integer not null check (duration_ms between 250 and 180000),
  file_size integer not null check (file_size between 1 and 10485760),
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'success', 'failed')),
  detected_language text null,
  transcript text null,
  score integer null check (score between 0 and 100),
  analysis_json jsonb null,
  error_message text null,
  submitted_at timestamptz not null default now(),
  analyzed_at timestamptz null,
  unique (question_id, participant_id)
);

create table if not exists public.shared_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 209715200),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists shared_files_session_idx on public.shared_files (session_id, created_at);

create table if not exists public.file_responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  participant_name text not null,
  name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 209715200),
  storage_path text not null unique,
  analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'analyzing', 'success', 'failed', 'unsupported')),
  analysis_json jsonb null,
  error_message text null,
  submitted_at timestamptz not null default now(),
  analyzed_at timestamptz null
);
create index if not exists file_responses_question_idx on public.file_responses (question_id, submitted_at);

create table if not exists public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid null references public.questions(id) on delete cascade,
  type text not null check (type in ('screen_preview', 'short_answer_summary', 'question_analysis', 'exit_ticket_summary')),
  input_json jsonb not null default '{}'::jsonb,
  output_json jsonb not null default '{}'::jsonb,
  status text not null check (status in ('success', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.exit_tickets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  participant_name text not null,
  most_useful text not null default '',
  still_confused text not null default '',
  understanding_score int null check (understanding_score between 1 and 5),
  engagement_score int null check (engagement_score between 1 and 5),
  next_suggestion text not null default '',
  response_text text null,
  rating int null check (rating between 1 and 5),
  submitted_at timestamptz not null default now(),
  unique (session_id, participant_id)
);

create table if not exists public.shared_contents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  body text null,
  url text null,
  created_at timestamptz not null default now(),
  constraint shared_contents_has_content check (
    nullif(btrim(coalesce(body, '')), '') is not null
    or nullif(btrim(coalesce(url, '')), '') is not null
  )
);

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null unique references public.questions(id) on delete cascade,
  title text not null,
  direction text not null,
  requested_count integer null check (requested_count between 1 and 10),
  requested_type text not null check (requested_type in ('random', 'multiple_choice', 'fill_blank', 'short_answer', 'ordering')),
  total_points integer not null default 100 check (total_points = 100),
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_items (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  type text not null check (type in ('multiple_choice', 'fill_blank', 'short_answer', 'ordering')),
  prompt_text text not null check (char_length(prompt_text) between 1 and 2000),
  options jsonb not null default '[]'::jsonb,
  points integer not null check (points between 1 and 100),
  translations jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (quiz_id, position)
);

create table if not exists public.quiz_item_keys (
  item_id uuid primary key references public.quiz_items(id) on delete cascade,
  accepted_answers text[] not null default '{}'::text[],
  rubric text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  participant_name text not null,
  status text not null default 'grading' check (status in ('grading', 'graded', 'failed')),
  total_score numeric(6,2) null check (total_score between 0 and 100),
  max_score integer not null default 100 check (max_score = 100),
  feedback jsonb null,
  error_message text null,
  submitted_at timestamptz not null default now(),
  graded_at timestamptz null,
  unique (question_id, participant_id)
);

create table if not exists public.quiz_item_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  item_id uuid not null references public.quiz_items(id) on delete cascade,
  answer_text text null check (coalesce(char_length(answer_text), 0) <= 4000),
  answer_values text[] null,
  score numeric(6,2) null check (score >= 0),
  feedback jsonb null,
  created_at timestamptz not null default now(),
  unique (attempt_id, item_id)
);

create table if not exists public.caption_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  language text not null check (char_length(language) between 2 and 20),
  source_language text not null check (char_length(source_language) between 2 and 20),
  text text not null check (char_length(btrim(text)) between 1 and 4000),
  is_translation boolean not null default false,
  started_at timestamptz null,
  ended_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists shared_contents_session_created_idx
  on public.shared_contents (session_id, created_at desc);
create index if not exists caption_segments_session_created_idx
  on public.caption_segments (session_id, created_at);

create table if not exists public.session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  event_type text not null check (event_type in ('lottery', 'lottery_result', 'buzzer')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists session_events_session_type_created_idx
  on public.session_events (session_id, event_type, created_at desc);

create index if not exists ai_summaries_question_id_idx on public.ai_summaries (question_id);
create index if not exists ai_summaries_session_id_idx on public.ai_summaries (session_id);
create index if not exists answers_participant_id_idx on public.answers (participant_id);
create index if not exists answers_session_id_idx on public.answers (session_id);
create index if not exists audio_responses_session_id_idx on public.audio_responses (session_id);
create index if not exists audio_responses_question_id_idx on public.audio_responses (question_id);
create index if not exists audio_responses_participant_id_idx on public.audio_responses (participant_id);
create index if not exists exit_tickets_participant_id_idx on public.exit_tickets (participant_id);
create index if not exists messages_participant_id_idx on public.messages (participant_id);
create index if not exists messages_session_id_idx on public.messages (session_id);
create index if not exists questions_screenshot_id_idx on public.questions (screenshot_id);
create index if not exists questions_session_id_idx on public.questions (session_id);
create index if not exists screenshots_session_id_idx on public.screenshots (session_id);
create index if not exists sessions_current_question_id_idx on public.sessions (current_question_id);
create index if not exists quizzes_session_id_idx on public.quizzes (session_id);
create index if not exists quiz_items_quiz_id_idx on public.quiz_items (quiz_id, position);
create index if not exists quiz_attempts_question_id_idx on public.quiz_attempts (question_id, submitted_at);
create index if not exists quiz_attempts_participant_id_idx on public.quiz_attempts (participant_id, submitted_at);
create index if not exists quiz_attempts_quiz_id_idx on public.quiz_attempts (quiz_id, submitted_at);
create index if not exists quiz_attempts_session_id_idx on public.quiz_attempts (session_id, submitted_at);
create index if not exists quiz_item_answers_attempt_id_idx on public.quiz_item_answers (attempt_id);
create index if not exists quiz_item_answers_item_id_idx on public.quiz_item_answers (item_id);

create or replace function public.claim_buzzer(
  p_event_id uuid,
  p_session_id uuid,
  p_participant_id uuid
)
returns setof public.session_events
language sql
security invoker
set search_path = ''
as $$
  with winner as (
    select participant.id, participant.name
    from public.participants as participant
    where participant.id = p_participant_id
      and participant.session_id = p_session_id
  ),
  claimed as (
    update public.session_events as event
    set payload = event.payload || jsonb_build_object(
      'winner_id', winner.id,
      'winner_name', winner.name,
      'accepting', false,
      'finalized', true,
      'finalized_at', now(),
      'duration_ms', 6000
    )
    from winner
    where event.id = p_event_id
      and event.session_id = p_session_id
      and event.event_type = 'buzzer'
      and coalesce((event.payload ->> 'accepting')::boolean, false) = true
      and coalesce((event.payload ->> 'finalized')::boolean, false) = false
      and coalesce((event.payload ->> 'cancelled')::boolean, false) = false
      and (event.payload ->> 'expires_at')::timestamptz > now()
      and coalesce(event.payload -> 'candidate_ids', '[]'::jsonb) ? p_participant_id::text
    returning event.*
  )
  select * from claimed
  union all
  select event.*
  from public.session_events as event
  where event.id = p_event_id
    and event.session_id = p_session_id
    and event.event_type = 'buzzer'
    and not exists (select 1 from claimed)
  limit 1;
$$;

revoke all on function public.claim_buzzer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_buzzer(uuid, uuid, uuid) to service_role;

alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.presenter_session_keys enable row level security;
alter table public.participant_session_keys enable row level security;
alter table public.messages enable row level security;
alter table public.screenshots enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.audio_responses enable row level security;
alter table public.ai_summaries enable row level security;
alter table public.exit_tickets enable row level security;
alter table public.shared_contents enable row level security;
alter table public.caption_segments enable row level security;
alter table public.session_events enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_items enable row level security;
alter table public.quiz_item_keys enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.quiz_item_answers enable row level security;
alter table public.shared_files enable row level security;
alter table public.file_responses enable row level security;

drop policy if exists "mvp read sessions" on public.sessions;
create policy "mvp read sessions" on public.sessions for select using (true);
revoke insert on public.sessions from anon, authenticated;

drop policy if exists "mvp read participants" on public.participants;
create policy "mvp read participants" on public.participants for select using (true);
drop policy if exists "join active sessions" on public.participants;
create policy "join active sessions" on public.participants for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.sessions
    where sessions.id = participants.session_id and sessions.status = 'active'
  )
  and char_length(btrim(name)) between 1 and 80
  and char_length(device_id) between 1 and 200
);
drop policy if exists "mvp read messages" on public.messages;
create policy "mvp read messages" on public.messages for select using (true);
drop policy if exists "send messages to active sessions" on public.messages;
create policy "send messages to active sessions" on public.messages for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.sessions
    where sessions.id = messages.session_id and sessions.status = 'active'
  )
  and exists (
    select 1 from public.participants
    where participants.id = messages.participant_id
      and participants.session_id = messages.session_id
      and participants.name = messages.participant_name
  )
  and char_length(btrim(content)) between 1 and 180
);

drop policy if exists "mvp read screenshots" on public.screenshots;
create policy "mvp read screenshots" on public.screenshots for select using (true);

drop policy if exists "mvp read questions" on public.questions;
create policy "mvp read questions" on public.questions for select using (true);

drop policy if exists "read dispatched quizzes" on public.quizzes;
create policy "read dispatched quizzes" on public.quizzes for select
to anon, authenticated
using (
  exists (
    select 1 from public.questions
    where questions.id = quizzes.question_id
      and questions.session_id = quizzes.session_id
  )
);

drop policy if exists "read dispatched quiz items" on public.quiz_items;
create policy "read dispatched quiz items" on public.quiz_items for select
to anon, authenticated
using (
  exists (
    select 1 from public.quizzes
    join public.questions on questions.id = quizzes.question_id
    where quizzes.id = quiz_items.quiz_id
  )
);

drop policy if exists "mvp read answers" on public.answers;
create policy "mvp read answers" on public.answers for select using (true);
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
drop policy if exists "mvp read ai summaries" on public.ai_summaries;
create policy "mvp read ai summaries" on public.ai_summaries for select using (true);
revoke insert on public.ai_summaries from anon, authenticated;

drop policy if exists "mvp read exit tickets" on public.exit_tickets;
create policy "mvp read exit tickets" on public.exit_tickets for select using (true);
drop policy if exists "submit exit tickets to active sessions" on public.exit_tickets;
create policy "submit exit tickets to active sessions" on public.exit_tickets for insert
to anon, authenticated
with check (
  exists (
    select 1 from public.sessions
    where sessions.id = exit_tickets.session_id
      and sessions.status = 'active'
      and sessions.exit_ticket_prompt is not null
  )
  and exists (
    select 1 from public.participants
    where participants.id = exit_tickets.participant_id
      and participants.session_id = exit_tickets.session_id
      and participants.name = exit_tickets.participant_name
  )
  and coalesce(char_length(response_text), 0) <= 2000
);

drop policy if exists "public read shared contents" on public.shared_contents;
create policy "public read shared contents" on public.shared_contents for select to anon, authenticated using (true);
drop policy if exists "public read shared files" on public.shared_files;
create policy "public read shared files" on public.shared_files for select to anon, authenticated using (true);
drop policy if exists "public read caption segments" on public.caption_segments;
create policy "public read caption segments" on public.caption_segments for select to anon, authenticated using (true);
drop policy if exists "public read session events" on public.session_events;
create policy "public read session events" on public.session_events for select to anon, authenticated using (true);

revoke all on all tables in schema public from anon, authenticated;
grant select on public.sessions, public.screenshots, public.questions, public.ai_summaries,
  public.shared_contents, public.session_events, public.caption_segments,
  public.quizzes, public.quiz_items, public.shared_files to anon, authenticated;
grant select, insert on public.participants to anon, authenticated;
grant select, insert on public.messages, public.answers, public.exit_tickets to anon, authenticated;

alter table public.listening_clips enable row level security;

-- A clip becomes readable only once a question has carried it to the class.
-- Without this a student could list the session's clips and listen to the test
-- before it starts, which is the audio equivalent of handing out the paper early.
drop policy if exists "read dispatched listening clips" on public.listening_clips;
create policy "read dispatched listening clips" on public.listening_clips for select to anon, authenticated using (
  exists (
    select 1 from public.questions
    where questions.listening_clip_id = listening_clips.id
      and questions.status in ('active', 'stopped', 'closed')
  )
);

-- Column-level, not row-level: the transcript is the answer key for a listening
-- exercise, and the screenshot is the passage in written form. Row access alone
-- would let a crafted PostgREST select ask for either one.
grant select (id, session_id, kind, language, duration_ms, public_url, created_at)
  on public.listening_clips to anon, authenticated;

grant all on public.listening_clips to service_role;

revoke all on public.participant_session_keys, public.audio_responses, public.file_responses, public.quiz_item_keys,
  public.quiz_attempts, public.quiz_item_answers from public, anon, authenticated;
grant all on public.participant_session_keys, public.audio_responses, public.shared_files, public.file_responses, public.quizzes, public.quiz_items,
  public.quiz_item_keys, public.quiz_attempts, public.quiz_item_answers to service_role;

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sessions'
  ) then
    alter publication supabase_realtime add table public.sessions;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'screenshots'
  ) then
    alter publication supabase_realtime add table public.screenshots;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'questions'
  ) then
    alter publication supabase_realtime add table public.questions;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'answers'
  ) then
    alter publication supabase_realtime add table public.answers;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ai_summaries'
  ) then
    alter publication supabase_realtime add table public.ai_summaries;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'exit_tickets'
  ) then
    alter publication supabase_realtime add table public.exit_tickets;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_contents'
  ) then
    alter publication supabase_realtime add table public.shared_contents;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_events'
  ) then
    alter publication supabase_realtime add table public.session_events;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'caption_segments'
  ) then
    alter publication supabase_realtime add table public.caption_segments;
  end if;
end $$;
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_files'
  ) then
    alter publication supabase_realtime add table public.shared_files;
  end if;
end $$;


-- Columns introduced by later migrations. `create table if not exists` above does
-- nothing when the table already exists, so without these an existing project
-- never gains them however many times this file is applied.

alter table public.answers
  add column if not exists answer_values text[] null;

alter table public.exit_tickets
  add column if not exists response_text text null,
  add column if not exists rating int null;

alter table public.questions
  add column if not exists allow_multiple boolean not null default false,
  add column if not exists correct_answers text[] not null default '{}'::text[],
  add column if not exists prompt_text text null,
  add column if not exists translations jsonb not null default '{}'::jsonb;

alter table public.sessions
  add column if not exists exit_ticket_prompt text null,
  add column if not exists exit_ticket_category text null,
  add column if not exists exit_ticket_response_type text null,
  add column if not exists captions_enabled boolean not null default false,
  add column if not exists caption_status text not null default 'idle'
    check (caption_status in ('idle', 'starting', 'live', 'error')),
  add column if not exists caption_source_language text not null default 'zh-tw',
  add column if not exists caption_display_language text not null default 'zh-tw',
  add column if not exists interpretation_enabled boolean not null default false,
  add column if not exists interpretation_languages text[] not null default '{}'::text[],
  add column if not exists caption_started_at timestamptz,
  add column if not exists interpretation_audio_enabled boolean not null default false,
  add column if not exists recording_enabled boolean not null default false,
  add column if not exists caption_font_size integer not null default 32,
  add column if not exists caption_font_bold boolean not null default true,
  add column if not exists exit_ticket_prompt_en text,
  add column if not exists caption_position text not null default 'bottom';

-- Defaults that changed after the column already existed. `add column if not
-- exists` above leaves an existing column exactly as it was, so a project that
-- has been deployed once would keep handing out the old value forever.
alter table public.sessions
  alter column caption_font_size set default 32;

-- Tracks how long a student had the class page in the background. Added here
-- rather than only in the table above so a project deployed earlier gains it.
alter table public.participants
  add column if not exists unfocused_ms bigint not null default 0,
  add column if not exists focus_streak_ms bigint not null default 0;

-- Accumulating a column cannot be expressed through the REST API, and reading
-- then writing would lose concurrent heartbeats.
create or replace function public.bump_participant_presence(
  target_id uuid,
  unfocused_delta bigint,
  focus_streak bigint default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.participants
  set last_seen_at = now(),
      unfocused_ms = unfocused_ms + greatest(unfocused_delta, 0),
      -- The client reports its current unbroken stretch, which resets to zero
      -- when the student leaves; keeping the largest is what "was focused for
      -- ten minutes at a time" means.
      focus_streak_ms = greatest(focus_streak_ms, greatest(focus_streak, 0))
  where id = target_id;
$$;


-- The two axes a language class runs on, and the level it runs at.
--
-- Kept as three columns rather than one: the language being taught, the language
-- it is explained in, and how far along the learners are vary independently. A
-- beginners' Japanese class in Taiwan teaches ja, explains in zh-TW, and sits at
-- JLPT N5 — no one of those implies the others.
alter table public.sessions
  add column if not exists teaching_language text not null default 'zh-tw';

alter table public.sessions
  add column if not exists guidance_language text not null default 'zh-TW';

-- Stored in the teacher's own vocabulary rather than translated to CEFR on the
-- way in. A Chinese teacher thinks in TBCL levels and a Japanese teacher thinks
-- in JLPT grades; flattening both to CEFR would lose TBCL levels 1 and 2, which
-- sit below A1 and are exactly the levels where difficulty control matters most.
alter table public.sessions
  add column if not exists level_framework text null check (level_framework in ('tbcl', 'cefr', 'gept', 'jlpt', 'topik', 'ivpt'));

alter table public.sessions
  add column if not exists level_code text null check (level_code is null or char_length(level_code) between 1 and 20);

create table if not exists public.listening_clips (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  -- The link to the source image lives here rather than on the question, and
  -- that is the whole point: a listening question carrying a screenshot_id would
  -- hand the student a public-bucket URL for the very passage they are supposed
  -- to be hearing rather than reading.
  screenshot_id uuid null references public.screenshots(id) on delete set null,
  source text not null check (source in ('screenshot', 'text')),
  kind text not null check (kind in ('passage', 'dialogue', 'scene')),
  -- The language the clip is spoken in, which is the language being taught
  -- rather than the one the class is explained in.
  language text not null,
  -- Only meaningful for Chinese: the same language, two scripts, and a reader
  -- whose accent should follow the one on the teacher's slide.
  script text null check (script in ('traditional', 'simplified')),
  transcript text not null check (char_length(transcript) between 1 and 4000),
  storage_path text not null unique,
  public_url text not null,
  duration_ms integer null,
  voices jsonb not null default '{}'::jsonb,
  -- Same words, same voices, same audio. Regenerating would bill the teacher
  -- twice for a clip they already have.
  content_hash text not null,
  created_at timestamptz not null default now()
);

-- The readings each character may take, in the order the font froze them.
--
-- Copied from ButTaiwan/bpmfvs phonic_table_Z.txt (Apache 2.0). The order is the
-- whole point: the font selects a reading by position, so index 0 is the glyph
-- you get with no selector and index n is the glyph behind U+E01E0 + n. The
-- upstream spec forbids reordering across releases, which is what lets a marked
-- transcript survive a font upgrade.
create table if not exists public.bopomofo_readings (
  codepoint integer primary key,
  readings text[] not null
);

-- Readable by nobody in the browser: the annotator runs server-side, and a
-- student has no reason to hold a dictionary of every reading.
alter table public.bopomofo_readings enable row level security;
grant all on public.bopomofo_readings to service_role;

alter table public.listening_clips
  add column if not exists annotation text not null default 'none'
  check (annotation in ('none', 'zhuyin', 'pinyin'));

-- For zhuyin this is the transcript with variation selectors woven in; for
-- pinyin it is a JSON array of per-character syllables the page renders as ruby.
-- Kept apart from `transcript` so the teacher can still edit plain text and
-- re-annotate without losing their wording.
alter table public.listening_clips
  add column if not exists annotation_text text null;

-- The subset built for exactly this clip's characters. Null for pinyin, which
-- needs no font at all.
alter table public.listening_clips
  add column if not exists font_path text null;

alter table public.listening_clips
  add column if not exists font_url text null;

create index if not exists listening_clips_session_idx
  on public.listening_clips (session_id, created_at desc);

create unique index if not exists listening_clips_reuse_idx
  on public.listening_clips (session_id, content_hash);

-- Reading aloud is the mirror image of a listening test: the learner must see
-- the very text a listening question hides. So the words and the font travel on
-- the question, which students may read, instead of on the clip, whose
-- transcript and font are granted to nobody.
--
-- The font matters as much as the text. A subset is cut from exactly the
-- characters of one clip, so handing it out for a listening item would leak
-- which characters the passage uses. On a read-aloud item there is nothing left
-- to leak — the text is on screen.
alter table public.questions
  add column if not exists reading_font_url text null;

alter table public.questions
  add column if not exists listening_clip_id uuid null references public.listening_clips(id) on delete set null;

-- Null means unlimited, which is right for practice and wrong for a test: a
-- listening assessment a student can replay until they have transcribed it is
-- a reading assessment.
alter table public.questions
  add column if not exists replay_limit integer null check (replay_limit is null or replay_limit between 1 and 10);

alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions
  add constraint questions_type_check
  check (type in (
    'send_screen', 'poll', 'multiple_choice', 'true_false', 'short_answer',
    'pronunciation', 'oral_response', 'custom_quiz', 'file_upload', 'listening'
  ));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listening_clips'
  ) then
    alter publication supabase_realtime add table public.listening_clips;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- The per-clip font subset lives beside the audio it belongs to: same clip,
-- same lifetime, deleted together when the session goes.
values ('lingoact-listening', 'lingoact-listening', true, 10485760, array['audio/wav', 'font/woff2']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public)
values ('lingoact-screenshots', 'lingoact-screenshots', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('lingoact-files', 'lingoact-files', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lingoact-recordings', 'lingoact-recordings', false, 10485760, array['audio/wav']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- PostgREST answers from a cached copy of the schema, so a column added above is
-- invisible until it reloads — the app would keep reporting PGRST204 for a column
-- that already exists.
notify pgrst, 'reload schema';

-- Dragging fragments into order: one primitive, three activities (故事排序,
-- 句子重組, and the ordering half of a listening task).
alter table public.quiz_items drop constraint if exists quiz_items_type_check;
alter table public.quiz_items
  add constraint quiz_items_type_check
  check (type in ('multiple_choice', 'fill_blank', 'short_answer', 'ordering'));

notify pgrst, 'reload schema';

alter table public.quizzes drop constraint if exists quizzes_requested_type_check;
alter table public.quizzes
  add constraint quizzes_requested_type_check
  check (requested_type in ('random', 'multiple_choice', 'fill_blank', 'short_answer', 'ordering'));

notify pgrst, 'reload schema';
