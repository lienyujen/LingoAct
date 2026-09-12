-- Transactional checks: fixtures and their answers never survive this test.
begin;
do $$
declare s uuid := gen_random_uuid(); q1 uuid := gen_random_uuid(); q2 uuid := gen_random_uuid();
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
begin
  if has_table_privilege('anon', 'public.teaching_pairs', 'SELECT') then raise exception 'A/B materials exposed to anon'; end if;
  if has_function_privilege('anon', 'public.submit_teaching_pair(uuid,uuid,text)', 'EXECUTE') then raise exception 'Unverified pair submission exposed'; end if;
  if has_function_privilege('anon', 'public.publish_teaching_question(uuid,uuid,uuid)', 'EXECUTE') then raise exception 'Publishing exposed'; end if;
  insert into sessions(id,title,code) values(s,'teaching cycle test',s::text);
  insert into participants(id,session_id,name,device_id) values(a,s,'A',a::text),(b,s,'B',b::text),(outsider,s,'C',outsider::text);
  insert into questions(id,session_id,type,status,title) values(q1,s,'short_answer','active','Original'),(q2,s,'short_answer','draft','Round 2');
  update sessions set current_question_id=q1 where id=s;
  insert into answers(session_id,question_id,participant_id,participant_name,answer_text) values(s,q1,a,'A','Original response');
  perform publish_teaching_question(s,q2,q1);
  if not exists(select 1 from answers where question_id=q1 and answer_text='Original response') then raise exception 'Original answer lost'; end if;
  if not exists(select 1 from questions where id=q1 and status='stopped') then raise exception 'Original still active'; end if;
  begin
    perform publish_teaching_question(s,q1,q1);
    raise exception 'TEST: stale dispatch accepted';
  exception when others then
    if SQLERRM='TEST: stale dispatch accepted' then raise; end if;
  end;
  insert into teaching_pairs(question_id,participant_a,participant_b,material_a,material_b) values(q2,a,b,'Only A','Only B');
  begin
    perform submit_teaching_pair(q2,outsider,'Unauthorized');
    raise exception 'TEST: outsider accepted';
  exception when others then
    if SQLERRM='TEST: outsider accepted' then raise; end if;
  end;
  perform submit_teaching_pair(q2,a,'Agreed result');
  if (select count(*) from answers where question_id=q2 and answer_text='Agreed result')<>2 then raise exception 'Joint result not saved to both learners'; end if;
  begin
    perform submit_teaching_pair(q2,b,'Overwrite');
    raise exception 'TEST: duplicate accepted';
  exception when others then
    if SQLERRM='TEST: duplicate accepted' then raise; end if;
  end;
  update questions set status='stopped' where id=q2;
  begin
    perform submit_teaching_pair(q2,a,'After stop');
    raise exception 'TEST: stopped submission accepted';
  exception when others then
    if SQLERRM='TEST: stopped submission accepted' then raise; end if;
  end;
end;
$$;
rollback;
