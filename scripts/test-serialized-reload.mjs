import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSerializedReload } from '../src/lib/serializedReload.ts'

test('slow quiz response finishes despite repeated retries; bursts produce one latest follow-up', async () => {
 const reload=createSerializedReload(),published=[]
 let finish, active=0, maximum=0
 const slow=async()=>{maximum=Math.max(maximum,++active);await new Promise(resolve=>{finish=resolve});published.push('cards');active--}
 const first=reload(slow)
 await Promise.resolve()
 for(let i=0;i<10;i++)assert.equal(reload(async()=>{maximum=Math.max(maximum,++active);published.push('latest-'+i);active--}),first)
 finish()
 await first
 assert.equal(maximum,1)
 assert.deepEqual(published,['cards','latest-9'])
 await reload(async()=>{published.push('next question')})
 assert.equal(published.at(-1),'next question')
})

test('a failed load releases the runner so the next attempt can recover',async()=>{
 const reload=createSerializedReload()
 await assert.rejects(reload(async()=>{throw new Error('offline')}),/offline/)
 let recovered=false
 await reload(async()=>{recovered=true})
 assert.equal(recovered,true)
})
