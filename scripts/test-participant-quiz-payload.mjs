import assert from 'node:assert/strict'
import { participantQuizPayload } from '../src/lib/participantQuizPayload.ts'

for (const value of [null, undefined, {}, { generating: true }, { message: 'Unavailable' }, { quiz: {} }]) {
  assert.equal(participantQuizPayload(value, 'round-2'), null)
}
const ready = { quiz: { question_id: 'round-2', requested_type: 'writing' }, items: [], answers: [], attempt: null }
assert.equal(participantQuizPayload(ready, 'round-2'), ready)
assert.equal(participantQuizPayload(ready, 'round-1'), null)
assert.equal(participantQuizPayload({ ...ready, items: undefined }, 'round-2'), null)
assert.equal(participantQuizPayload({ ...ready, answers: undefined }, 'round-2'), null)
const item={id:'item',type:'multiple_choice',prompt_text:'Choose one.',options:['Yes','No'],pair_prompts:[]}
assert.equal(participantQuizPayload({...ready,items:[item]},'round-2')?.items[0],item)
for (const broken of [null,{}, {...item,prompt_text:{}},{...item,options:[{}]},{...item,pair_prompts:[null]},{...item,type:'unexpected'}]) {
  assert.equal(participantQuizPayload({...ready,items:[broken]},'round-2'),null)
}
for (const broken of [null,{}, {item_id:'item',answer_text:{}},{item_id:'item',answer_values:[null]}]) {
  assert.equal(participantQuizPayload({...ready,answers:[broken]},'round-2'),null)
}
console.log('PASS: preparing/error/malformed/stale responses cannot enter quiz render state; ready response accepted.')
