-- Keep the first read-aloud take when a learner submits a second one.
alter table public.audio_responses add column if not exists attempt_number integer not null default 1 check (attempt_number between 1 and 2);
alter table public.audio_responses add column if not exists previous_attempt jsonb;

-- Only the verified Edge Function can call this transaction. Lock the question
-- while accepting a take so stopping the activity cannot race a late upload.
create or replace function public.submit_recording_take(p_take jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  q public.questions;
  previous public.audio_responses;
  saved public.audio_responses;
  sid uuid := (p_take->>'session_id')::uuid;
  qid uuid := (p_take->>'question_id')::uuid;
  pid uuid := (p_take->>'participant_id')::uuid;
begin
  select * into q from public.questions where id=qid and session_id=sid for share;
  if not found or q.type not in ('pronunciation','oral_response') or q.status <> 'active' then raise exception 'RECORDING_CLOSED'; end if;
  perform 1 from public.sessions where id=sid and status='active' for share;
  if not found then raise exception 'RECORDING_CLOSED'; end if;
  select * into previous from public.audio_responses where question_id=qid and participant_id=pid for update;
  if found then
    if previous.id=(p_take->>'id')::uuid then return to_jsonb(previous)||'{"already_saved":true}'::jsonb; end if;
    if q.type <> 'pronunciation' or previous.attempt_number>=2 or previous.analysis_status='pending' then raise exception 'RECORDING_RETRY_UNAVAILABLE'; end if;
    update public.audio_responses set
      id=(p_take->>'id')::uuid,storage_path=p_take->>'storage_path',mime_type='audio/wav',
      duration_ms=(p_take->>'duration_ms')::integer,file_size=(p_take->>'file_size')::integer,
      attempt_number=2,previous_attempt=to_jsonb(previous)-'previous_attempt',
      analysis_status='pending',detected_language=null,transcript=null,score=null,analysis_json=null,error_message=null,
      submitted_at=now(),analyzed_at=null
    where id=previous.id returning * into saved;
  else
    insert into public.audio_responses(id,session_id,question_id,participant_id,participant_name,storage_path,mime_type,duration_ms,file_size)
    values((p_take->>'id')::uuid,sid,qid,pid,p_take->>'participant_name',p_take->>'storage_path','audio/wav',(p_take->>'duration_ms')::integer,(p_take->>'file_size')::integer)
    returning * into saved;
  end if;
  insert into public.answers(session_id,question_id,participant_id,participant_name,answer_text)
  values(sid,qid,pid,p_take->>'participant_name','[錄音已送出]')
  on conflict(question_id,participant_id) do update set answer_text=excluded.answer_text;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.submit_recording_take(jsonb) from public,anon,authenticated;
grant execute on function public.submit_recording_take(jsonb) to service_role;
