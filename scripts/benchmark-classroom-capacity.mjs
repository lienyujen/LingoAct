// Explicitly opted-in, real REST/WebSocket benchmark. Uses synthetic data only,
// makes no AI calls, refuses to start while real students are active, cleans up
// its own UUID-scoped fixture. Run from the repository root with Node >=24.
import fs from 'node:fs';import {randomUUID} from 'node:crypto';import {createClient} from '@supabase/supabase-js';import {fixtureSql} from './live-test-db.mjs';import {guardRealtimeTables} from '../src/lib/realtimeGuard.ts';
import {createPresencePublisher} from '../src/lib/presencePublisher.ts';import {onlineClassIds} from '../src/lib/classroomProjection.ts';
const publishers=[],heartbeatTimers=[];let closing=false;
if(process.env.LINGOACT_CAPACITY_TEST!=='1')throw Error('Set LINGOACT_CAPACITY_TEST=1 and LINGOACT_TEST_PROJECT explicitly to run the real 200-client benchmark.');
const project=process.env.LINGOACT_TEST_PROJECT;if(!/^[a-z]{20}$/.test(project||''))throw Error('An explicit test project is required');
const sid=randomUUID(),qid=randomUUID(),N=200,clients=[],channels=[],tokens=[],students=[],events=new Map(),received=new Set(),errors=[],stats={students:N,connections:0,joins:[],reads:[],answers:[],dispatchReceived:0,answerEvents:0};
const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')]}));const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_ANON_KEY;if(!url?.includes(project))throw Error('Wrong test project');
const delay=ms=>new Promise(r=>setTimeout(r,ms));const quant=a=>{const s=[...a].sort((x,y)=>x-y);return{count:s.length,p50:Math.round(s[Math.floor(s.length*.5)]||0),p95:Math.round(s[Math.floor(s.length*.95)]||0),max:Math.round(s.at(-1)||0)}};
const resultFile='.codex-tmp/classroom-200-live-final.json';const save=()=>fs.writeFileSync(resultFile,JSON.stringify({...stats,errors},null,2));
async function parallel(items,limit,work){let next=0;await Promise.all(Array.from({length:limit},async()=>{while(next<items.length){const i=next++;await work(items[i],i)}}))}
function client(){const c=guardRealtimeTables(createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},realtime:{params:{eventsPerSecond:20}}}));clients.push(c);return c}
async function subscribe(ch){channels.push(ch);await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('subscribe timeout')),25000);ch.subscribe(status=>{if(!closing&&(status==='CHANNEL_ERROR'||status==='TIMED_OUT'))errors.push('Realtime '+status);if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(timer);reject(Error(status))}})})}
try{
 const busy=await fixtureSql(project,"select count(*)::int as count from participants p join sessions s on s.id=p.session_id where s.status='active' and p.last_seen_at>now()-interval '2 minutes'");if(busy[0].count)throw Error('Real students active; skipping load test');
 await fixtureSql(project,`insert into sessions(id,title,code,status) values('${sid}','Codex 200-student stability QA','QA${randomUUID().slice(0,8)}','active');insert into questions(id,session_id,type,title,prompt_text,status) values('${qid}','${sid}','short_answer','Synthetic test','QA only','active');update sessions set current_question_id='${qid}' where id='${sid}';`);
 fs.writeFileSync('.codex-tmp/classroom-200-fixture.json',JSON.stringify({sid,qid}));console.log('Created isolated synthetic class');
 const teacher=client();await subscribe(teacher.channel('qa-answers:'+sid).on('postgres_changes',{event:'INSERT',schema:'public',table:'answers',filter:'session_id=eq.'+sid},p=>{received.add(p.new.participant_id);stats.answerEvents=received.size}));
 const roster=teacher.channel('classroom-presence:'+sid,{config:{presence:{key:'teacher',enabled:true}}}).on('presence',{event:'sync'},()=>{stats.presenceCount=Object.keys(roster.presenceState()).length});await subscribe(roster);
 const tp=teacher.channel('teacher-presence:'+sid,{config:{presence:{key:'teacher',enabled:false}}});await subscribe(tp);await tp.track({role:'presenter'});
 await parallel(Array.from({length:N},(_,i)=>i),12,async i=>{const start=performance.now();const r=await fetch(url+'/functions/v1/participant-action',{method:'POST',headers:{apikey:key,authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({action:'join_session',sessionReference:sid,name:'QA '+i,deviceId:'qa-'+randomUUID()})});const d=await r.json();if(!r.ok||!d.participant||!d.participantToken)throw Error('Join failed '+r.status);students[i]=d.participant;tokens[i]=d.participantToken;stats.joins.push(performance.now()-start)});console.log('200 authenticated joins complete',JSON.stringify(quant(stats.joins)));save();
 for(let i=0;i<N;i++)heartbeatTimers.push(setInterval(async()=>{try{const r=await fetch(url+'/functions/v1/participant-action',{method:'POST',headers:{apikey:key,'content-type':'application/json'},body:JSON.stringify({action:'heartbeat',sessionId:sid,participantId:students[i].id,participantToken:tokens[i],unfocusedMs:0,focusStreakMs:30000,locale:'zh-TW'})});if(!r.ok)errors.push('Heartbeat HTTP '+r.status)}catch(e){errors.push('Heartbeat '+e.message)}},30000+Math.random()*10000));
 // Four live channels per learner, plus the shared-files channel, match the page's transport shape.
 for(let i=0;i<N;i++){
  const c=client(),pid=students[i].id,pc=c.channel('classroom-presence:'+sid,{config:{presence:{key:pid,enabled:false}}});await subscribe(pc);const publisher=createPresencePublisher(()=>pc.track({role:'participant',participant_id:pid}));publishers.push(publisher);publisher.start();
  await Promise.all([
   subscribe(c.channel('teacher-presence:'+sid,{config:{presence:{key:pid,enabled:true}}}).on('presence',{event:'sync'},()=>{})),
   subscribe(c.channel('participant:'+sid+':'+pid).on('postgres_changes',{event:'UPDATE',schema:'public',table:'sessions',filter:'id=eq.'+sid},()=>{if(!events.has(pid))events.set(pid,Date.now());stats.dispatchReceived=events.size}).on('postgres_changes',{event:'*',schema:'public',table:'questions',filter:'session_id=eq.'+sid},()=>{}).on('postgres_changes',{event:'*',schema:'public',table:'answers',filter:'participant_id=eq.'+pid},()=>{}).on('postgres_changes',{event:'*',schema:'public',table:'participants',filter:'id=eq.'+pid},()=>{})),
   subscribe(c.channel('standings:'+sid).on('broadcast',{event:'standings'},()=>{})),
   subscribe(c.channel('shared-files:'+sid).on('postgres_changes',{event:'*',schema:'public',table:'shared_files',filter:'session_id=eq.'+sid},()=>{}))]);stats.connections=i+1;
  if(i%25===24){console.log('Live learners',i+1);save()}await delay(80);
 }
 await delay(1500);console.log('Presence count',stats.presenceCount);save();
 // Exercise HTTP reads with actual publishable-key RLS, not a service-role bypass.
 await parallel(students,20,async(p,i)=>{const start=performance.now();for(const q of [teacher.from('sessions').select('id,current_question_id,status').eq('id',sid).single(),teacher.from('questions').select('*').eq('session_id',sid),teacher.from('answers').select('*').eq('session_id',sid).eq('participant_id',p.id)]){const r=await q;if(r.error)throw Error('Read failed '+r.error.code)}stats.reads.push(performance.now()-start)});
 await fixtureSql(project,`update sessions set title='QA dispatch ${Date.now()}' where id='${sid}'`);await delay(4000);if(events.size!==N)errors.push('Dispatch delivered to '+events.size+'/'+N);const times=[...events.values()].sort();stats.dispatchFanoutMs=times.length?times.at(-1)-times[0]:null;
 await parallel(students,200,async(p,i)=>{const start=performance.now(),r=await teacher.from('answers').insert({session_id:sid,question_id:qid,participant_id:p.id,participant_name:p.name,answer_text:'QA answer '+i});if(r.error)throw Error('Answer failed '+r.error.code);stats.answers.push(performance.now()-start)});await delay(5000);if(received.size!==N)errors.push('Projection received '+received.size+'/'+N);
 const rows=await fixtureSql(project,`select count(*)::int as count from answers where session_id='${sid}'`);stats.persistedAnswers=rows[0].count;
 console.log('200-answer burst complete; holding all connections for 120 seconds');await delay(120000);
 const onlineRows=await teacher.from('participants').select('*').eq('session_id',sid);if(onlineRows.error)throw onlineRows.error;stats.onlineCount=onlineClassIds(onlineRows.data,Object.keys(roster.presenceState())).length;stats.soakSeconds=120;
 stats.joinMs=quant(stats.joins);stats.readMs=quant(stats.reads);stats.answerMs=quant(stats.answers);delete stats.joins;delete stats.reads;delete stats.answers;stats.passed=errors.length===0&&stats.persistedAnswers===N&&stats.onlineCount===N;console.log(JSON.stringify(stats));save();
}catch(e){errors.push(e.message);save();console.error(e.message);process.exitCode=1}
finally{
 closing=true;for(const t of heartbeatTimers)clearInterval(t);for(const p of publishers)p.cancel();await Promise.allSettled(clients.map(c=>c.removeAllChannels()));for(const c of clients)c.realtime.disconnect();
 await fixtureSql(project,`delete from sessions where id='${sid}' and title like 'QA dispatch %' or id='${sid}' and title='Codex 200-student stability QA'`);console.log('Removed isolated test class');save();
}
