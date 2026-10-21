import {test} from 'node:test';import assert from 'node:assert/strict';import {createClassroomReadCache} from '../src/lib/classroomReadCache.ts';
test('an invalidated in-flight snapshot cannot refill the cache; simultaneous readers share one query',async()=>{
 const c=createClassroomReadCache();let finish,calls=0;const get=()=>{calls++;return new Promise(r=>{finish=r})};const a=c.read('questions',get),b=c.read('questions',get);await Promise.resolve();assert.equal(calls,1);c.invalidate('questions');finish({data:['old']});await Promise.all([a,b]);assert.deepEqual(await c.read('questions',async()=>({data:['new']})),{data:['new']});
});
test('errors retry, scope changes isolate learners and locale, absent material expires and related prefixes invalidate',async()=>{
 let now=0,calls=0;const c=createClassroomReadCache(()=>now),get=async()=>{calls++;return{data:null}};c.scope('a');await c.read('reading_passages:q',get,60000,2000);now=1000;await c.read('reading_passages:q',get,60000,2000);assert.equal(calls,1);now=2001;await c.read('reading_passages:q',get,60000,2000);assert.equal(calls,2);c.invalidate('reading_passages');await c.read('reading_passages:q',get);assert.equal(calls,3);c.scope('b');await c.read('reading_passages:q',get);assert.equal(calls,4);for(let i=0;i<2;i++)await c.read('failure',async()=>{calls++;return{error:'offline'}});assert.equal(calls,6);
});
test('200 learners wait 60 grading ticks without repeatedly fetching all eight base datasets; dispatch and answer invalidate immediately',async()=>{
 let before=0,after=0,clock=0;const clients=Array.from({length:200},()=>createClassroomReadCache(()=>clock));const keys=['sessions','participants','exit_tickets','shared_contents','session_events','questions','answers','quizzes'];
 for(let tick=0;tick<60;tick++){clock=tick*2000;for(const c of clients)await Promise.all(keys.map(key=>{before++;return c.read(key,async()=>{after++;return{data:key}},key==='sessions'?15000:key==='quizzes'?5000:60000)}))}
 assert.ok(after<before*.15,`${after}/${before}`);for(const c of clients){c.invalidate('sessions','questions');assert.equal((await c.read('questions',async()=>({data:'new question'}))).data,'new question');c.invalidate('answers');assert.equal((await c.read('answers',async()=>({data:'new grade'}))).data,'new grade')}
 console.log(JSON.stringify({learners:200,gradingTicks:60,oldBaseReads:before,newBaseReads:after,reductionPercent:Math.round((1-after/before)*100)}));
});

 test('AI wait retries remain prompt at first, spread the class and back off long waits',async()=>{const {classroomRetryDelay}=await import('../src/lib/classroomReadCache.ts');assert.equal(classroomRetryDelay(0,0),1500);assert.equal(classroomRetryDelay(0,1),3000);assert.equal(classroomRetryDelay(30000,0),3500);assert.equal(classroomRetryDelay(90000,0),8000);assert.ok(classroomRetryDelay(90000,1)<10000)});
