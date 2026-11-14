import {test} from 'node:test'
import assert from 'node:assert/strict'
import {classroomChanges, classroomBroadcastTables, createClassroomReconnect} from '../src/lib/classroomBroadcast.ts'

function fixture() {
 const bindings=[],reads=[]
 const channel={on(type,filter,callback){bindings.push({type,filter,callback});return this}}
 const client={channel(topic){channel.topic=topic;return channel},from(table){const filters={};return{select(){return this},eq(k,v){filters[k]=v;return this},async maybeSingle(){reads.push({table,...filters});return {data:{id:filters.id,session_id:filters.session_id,name:'authoritative'}}}}}}
 return {client,bindings,reads}
}
test('200 students retain only two personal DB bindings instead of nine, with legacy fallback',()=>{
 let database=0,broadcast=0
 for(let i=0;i<200;i++){
  const f=fixture(),c=classroomChanges(f.client,'class','student-'+i,true)
  for(const table of [...classroomBroadcastTables,'answers','exit_tickets']) c.on('postgres_changes',{event:'*',table,schema:'public',filter:'session_id=eq.class'},()=>{})
  database+=f.bindings.filter(b=>b.type==='postgres_changes').length
  broadcast+=f.bindings.filter(b=>b.type==='broadcast').length
 }
 assert.equal(database,400);assert.equal(broadcast,1400)
 const f=fixture();classroomChanges(f.client,'class','student',false).on('postgres_changes',{table:'questions'},()=>{})
 assert.equal(f.bindings[0].type,'postgres_changes')
})
test('forged or other-class hints cannot apply state; personal hints only read the intended authoritative row',async()=>{
 const f=fixture(),seen=[],c=classroomChanges(f.client,'class','me',true)
 c.on('postgres_changes',{table:'participants',schema:'public',event:'UPDATE',filter:'id=eq.me'},p=>seen.push(p.new))
 const callback=f.bindings[0].callback
 const valid={table:'participants',session_id:'class',id:'me',eventType:'UPDATE',name:'forged'}
 for(const patch of [{session_id:'other'},{id:'other'},{table:'questions'},{eventType:'INSERT'}]) await callback({payload:{...valid,...patch}})
 assert.equal(f.reads.length,0);assert.equal(seen.length,0)
 await callback({payload:valid});assert.deepEqual(seen,[{id:'me',session_id:'class',name:'authoritative'}])
 assert.deepEqual(f.reads,[{table:'participants',id:'me',session_id:'class'}])
})
test('a hundred reconnects coalesce, wait with jitter and cancel on unmount',()=>{
 let id=0;const pending=new Map(),delays=[],seen=[]
 const r=createClassroomReconnect(v=>seen.push(v),()=>.5,(run,delay)=>{pending.set(++id,run);delays.push(delay);return id},timer=>pending.delete(timer))
 r.subscribed();assert.equal(delays[0],1050);pending.get(id)();pending.delete(id);assert.deepEqual(seen,[false])
 for(let i=0;i<100;i++)r.subscribed()
 assert.equal(pending.size,1);assert.equal(delays.at(-1),10000)
 pending.get(id)();pending.delete(id);assert.deepEqual(seen,[false,true])
 r.subscribed();r.stop();assert.equal(pending.size,0)
})
