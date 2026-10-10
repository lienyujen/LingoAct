// Real authenticated operations in one disposable class, including Realtime.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID, createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { fixtureSql } from './live-test-db.mjs'
const project=process.env.LINGOACT_TEST_PROJECT
if(!project)throw Error('Set LINGOACT_TEST_PROJECT and sign in to Supabase CLI.')
const vars=Object.fromEntries(readFileSync(process.env.LINGOACT_TEST_CONFIG || 'LingoAct/.env','utf8').split(/\r?\n/).filter(line=>/^[A-Z_]+=/.test(line)).map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')]}))
const key=vars.VITE_SUPABASE_ANON_KEY||vars.VITE_SUPABASE_PUBLISHABLE_KEY
assert.ok(key)
assert.equal(new URL(vars.VITE_SUPABASE_URL).hostname,`${project}.supabase.co`)
const sessionId=randomUUID(),participantId=randomUUID(),presenterToken=randomUUID()+randomUUID(),participantToken=randomUUID()+randomUUID()
const hash=text=>createHash('sha256').update(text).digest('hex')
let created=false,channel
const client=createClient(`https://${project}.supabase.co`,key,{auth:{persistSession:false}})
async function invoke(name,body,status=200){const response=await fetch(`https://${project}.supabase.co/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId,...body}),signal:AbortSignal.timeout(15000)});const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data}
try{
 await fixtureSql(project,`insert into sessions(id,title,code,teaching_language,guidance_language) values('${sessionId}','Hand sync QA','${sessionId}','en','zh-TW');insert into presenter_session_keys(session_id,token_hash) values('${sessionId}','${hash(presenterToken)}');insert into participants(id,session_id,name,device_id) values('${participantId}','${sessionId}','QA learner','${participantId}');insert into participant_session_keys(participant_id,token_hash) values('${participantId}','${hash(participantToken)}');`)
 created=true
 let loweredResolve
 const lowered=new Promise(resolve=>{loweredResolve=resolve})
 channel=client.channel(`standings:${sessionId}`).on('broadcast',{event:'hands_lowered'},message=>loweredResolve(message.payload))
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Realtime subscription timed out')),15000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}else if(status==='CHANNEL_ERROR'){clearTimeout(timer);reject(Error(status))}})})
 const raised=await invoke('participant-action',{action:'set_hand',participantId,participantToken,raised:true})
 assert.equal(raised.participantState.id,participantId);assert.ok(raised.participantState.hand_raised_at)
 await invoke('presenter-action',{action:'lower_hands',presenterToken,participantId})
 let waitTimer
 const notification=await Promise.race([lowered,new Promise((_,reject)=>{waitTimer=setTimeout(()=>reject(Error('Lower-hand notification missing')),12000)})]).finally(()=>clearTimeout(waitTimer))
 assert.equal(notification.participantId,participantId)
 assert.deepEqual(Object.keys(notification),['participantId'])
 const rows=await fixtureSql(project,`select hand_raised_at from participants where id='${participantId}';`)
 assert.equal(rows[0].hand_raised_at,null)
 await invoke('participant-action',{action:'set_hand',participantId,participantToken:'invalid-fixture-token',raised:true},403)
 console.log('PASS: authenticated raise, authoritative acknowledgement, teacher lower, targeted Realtime notification, database state and invalid-token rejection')
}finally{
 if(channel)await client.removeChannel(channel)
 if(created){await fixtureSql(project,`delete from sessions where id='${sessionId}';`);console.log('QA class removed')}
}
