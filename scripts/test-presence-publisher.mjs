import {test} from 'node:test';import assert from 'node:assert/strict';import {createPresencePublisher} from '../src/lib/presencePublisher.ts';
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
test('Presence publishing retries a rejected track, stops after success and cancels pending work on cleanup',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let calls=0;const publisher=createPresencePublisher(async()=>++calls===1?'error':'ok');publisher.start();await flush();assert.equal(calls,1);t.mock.timers.tick(2500);await flush();assert.equal(calls,2);t.mock.timers.tick(30000);await flush();assert.equal(calls,2);const failed=createPresencePublisher(async()=>{calls++;return'error'});failed.start();await flush();failed.cancel();const before=calls;t.mock.timers.tick(30000);await flush();assert.equal(calls,before);
});
