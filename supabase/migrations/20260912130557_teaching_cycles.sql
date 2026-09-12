-- Keep every practice round as its own question, with an explicit parent.
alter table public.questions add column if not exists source_question_id uuid references public.questions(id) on delete set null;
alter table public.questions add column if not exists learning_focus text;
alter table public.questions add column if not exists teaching_mode text;
alter table public.questions add column if not exists discussion_samples jsonb not null default '[]'::jsonb;

-- A/B material must never be placed on the publicly readable questions row.
create table if not exists public.teaching_pairs (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  participant_a uuid not null references public.participants(id) on delete cascade,
  participant_b uuid references public.participants(id) on delete cascade,
  material_a text not null,
  material_b text not null,
  result text,
  submitted_by uuid references public.participants(id) on delete set null,
  submitted_at timestamptz,
  unique(question_id, participant_a)
);
alter table public.teaching_pairs enable row level security;
revoke all on public.teaching_pairs from public, anon, authenticated;
grant all on public.teaching_pairs to service_role;

-- Publish only after all copied quiz rows or pair assignments are ready.
create or replace function public.publish_teaching_question(target_session uuid, target_question uuid, expected_current uuid)
returns void language plpgsql set search_path = public as $$
declare current_id uuid; session_status text;
begin
  select current_question_id, status into current_id, session_status from sessions where id = target_session for update;
  if session_status is distinct from 'active' or current_id is distinct from expected_current then
    raise exception 'Class changed. Reload before dispatching.';
  end if;
  if not exists(select 1 from questions where id = target_question and session_id = target_session and status = 'draft') then
    raise exception 'Draft question not found.';
  end if;
  update questions set status = 'stopped', stopped_at = now() where session_id = target_session and status = 'active';
  update questions set status = 'active', started_at = now(), stopped_at = null where id = target_question;
  update sessions set current_question_id = target_question where id = target_session;
end;
$$;
revoke all on function public.publish_teaching_question(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.publish_teaching_question(uuid, uuid, uuid) to service_role;
create or replace function public.submit_teaching_pair(target_question uuid, learner uuid, shared_result text)
returns void language plpgsql set search_path = public as $$
declare q questions%rowtype; p teaching_pairs%rowtype;
begin
  select * into q from questions where id = target_question for update;
  if q.status is distinct from 'active' or not exists(select 1 from sessions where id=q.session_id and status='active') then
    raise exception 'Answering has stopped.';
  end if;
  select * into p from teaching_pairs where question_id=target_question and (participant_a=learner or participant_b=learner) for update;
  if p.id is null or p.submitted_at is not null or length(trim(shared_result)) not between 1 and 4000 then
    raise exception 'Pair not found, already submitted, or empty result.';
  end if;
  update teaching_pairs set result=trim(shared_result), submitted_by=learner, submitted_at=now() where id=p.id;
  insert into answers(session_id, question_id, participant_id, participant_name, answer_text)
    select q.session_id, q.id, id, name, trim(shared_result) from participants where id in (p.participant_a,p.participant_b)
    on conflict (question_id, participant_id) do update set answer_text=excluded.answer_text;
end;
$$;
revoke all on function public.submit_teaching_pair(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_teaching_pair(uuid, uuid, text) to service_role;
notify pgrst, 'reload schema';
