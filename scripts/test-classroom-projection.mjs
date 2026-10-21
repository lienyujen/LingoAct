import {test} from 'node:test';import assert from 'node:assert/strict';
import {createDanmakuQueue,sentencePages,onlineClassIds,answerBeforeComment} from '../src/lib/classroomProjection.ts';
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
test('short answer and comment entry stay separate until that question has been answered',()=>{assert.equal(answerBeforeComment({type:'short_answer',status:'active'},false),true);assert.equal(answerBeforeComment({type:'short_answer',status:'active'},true),false);assert.equal(answerBeforeComment({type:'short_answer',status:'stopped'},false),false);assert.equal(answerBeforeComment({type:'multiple_choice',status:'active'},false),false)});
test('rapid taps and a lost send acknowledgement use one message ID; an intentional next message gets a new ID',async()=>{
 const send=createMessageSubmission();let finish;const ids=[];const first=send('hello',async id=>{ids.push(id);await new Promise(r=>{finish=r});throw Error('lost acknowledgement')});assert.equal(await send('hello',async()=>{throw Error('duplicate write')}),false);finish();await assert.rejects(first);await send('hello',async id=>{ids.push(id)});assert.equal(ids[0],ids[1]);await send('hello',async id=>{ids.push(id)});assert.notEqual(ids[1],ids[2]);
});
