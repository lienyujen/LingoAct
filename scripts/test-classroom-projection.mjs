import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDanmakuQueue,sentencePages,onlineClassIds} from '../src/lib/classroomProjection.ts';
import {createMessageSubmission} from '../src/lib/messageSubmission.ts';
import {createRealtimeSnapshot} from '../src/lib/realtimeSnapshot.ts';
test('93 simultaneous comments drain once; duplicate poll and update events cannot replay completed IDs',()=>{
 const q=createDanmakuQueue(), messages=Array.from({length:93},(_,i)=>({id:String(i),content:'comment '+i})), shown=[];
 q.offer(messages,true,0);
 while(q.messages().length){const active=q.messages();assert.ok(active.length<=12);shown.push(...active.map(m=>m.id));for(const m of active)q.finish(m.id,1000);q.offer(messages,true,1000)}
 assert.equal(shown.length,93);assert.equal(new Set(shown).size,93);q.tick(100000);q.offer(messages,true,100000);assert.deepEqual(q.messages(),[]);
});
test('turning comments off drains the active queue without replay on re-enable; lost animation events expire',()=>{
 const q=createDanmakuQueue();q.offer([{id:'a'}],true,0);q.offer([{id:'a'},{id:'b'}],false,1);q.offer([{id:'a'},{id:'b'},{id:'c'}],true,2);assert.deepEqual(q.messages().map(m=>m.id),['c']);q.tick(40000);assert.deepEqual(q.messages(),[])
});
test('all 93 wall answers survive a slow snapshot racing with realtime, and every answer appears on a readable page',()=>{
 const cache=createRealtimeSnapshot(),answers=Array.from({length:93},(_,i)=>({id:String(i),answer_text:'測試回答'.repeat(i%4+1)}));cache.begin();for(const a of answers.slice(4))cache.update('answers',{eventType:'INSERT',new:a,old:{}});cache.replace({answers:answers.slice(0,4)});const all=cache.rows('answers');assert.equal(all.length,93);const pages=sentencePages(all);assert.equal(pages.flat().length,93);assert.ok(pages.every(p=>p.length<=12));assert.equal(new Set(pages.flat().map(a=>a.id)).size,93);
});
test('late joiners remain online during presence loss using fresh heartbeat, excluding removed and stale learners',()=>{
 const now=Date.now(),participants=Array.from({length:93},(_,i)=>({id:String(i),last_seen_at:new Date(now-10000).toISOString()}));participants.push({id:'stale',last_seen_at:new Date(now-120000).toISOString()},{id:'removed',last_seen_at:new Date(now).toISOString(),removed_at:'yes'});assert.equal(onlineClassIds(participants,[],now).length,93);assert.ok(onlineClassIds(participants,['stale'],now).includes('stale'));
});
test('the real comment handler permits unanswered short answers and teacher Presence loss, but respects the stored switch',async()=>{
 const {readFileSync}=await import('node:fs');const {runInNewContext}=await import('node:vm');const {default:ts}=await import('typescript');const page=readFileSync(new URL('../src/routes/ParticipantPage.tsx',import.meta.url),'utf8');const start=page.indexOf('  async function sendMessage('),end=page.indexOf('  async function submitAnswer',start);const source=ts.transpile(page.slice(start,end),{target:ts.ScriptTarget.ES2022});
 for(const [onBreak,answered,open]of [[false,false,true],[true,false,true],[false,true,true],[false,false,false]]){let writes=0;const context={onBreak,answer:answered?{id:'answer'}:null,question:{type:'short_answer',status:'active'},message:'測試彈幕',participant:{id:'student',name:'QA'},session:{status:'active',anonymous_enabled:false},sessionId:'class',danmakuOpen:open,messageSending:{current:false},messageFitsLimit:()=>true,setError(){},setMessageBusy(){},setMessage(){},messageSubmission:createMessageSubmission(),requireSupabase:()=>({from:()=>({insert:async()=>{writes++;return{error:null}}})})};runInNewContext(source,context);await context.sendMessage({preventDefault(){}});assert.equal(writes,open?1:0,JSON.stringify({onBreak,answered,open}))}
 assert.match(page,/\n      <form className=\{`panel message-form/);
});
test('rapid taps and a lost send acknowledgement use one message ID; an intentional next message gets a new ID',async()=>{
 const send=createMessageSubmission();let finish;const ids=[];const first=send('hello',async id=>{ids.push(id);await new Promise(r=>{finish=r});throw Error('lost acknowledgement')});assert.equal(await send('hello',async()=>{throw Error('duplicate write')}),false);finish();await assert.rejects(first);await send('hello',async id=>{ids.push(id)});assert.equal(ids[0],ids[1]);await send('hello',async id=>{ids.push(id)});assert.notEqual(ids[1],ids[2]);
});

test('late joins received during an old roster snapshot are retained rather than disappearing from online count',()=>{
 const cache=createRealtimeSnapshot(),people=Array.from({length:93},(_,i)=>({id:String(i),last_seen_at:new Date().toISOString()}));cache.begin();for(const p of people.slice(80))cache.update('participants',{eventType:'INSERT',new:p,old:{}});cache.replace({participants:people.slice(0,80)});assert.equal(onlineClassIds(cache.rows('participants'),[]).length,93);
});
