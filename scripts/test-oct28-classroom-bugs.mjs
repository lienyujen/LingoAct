import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createServer} from 'vite'
import {renderToStaticMarkup} from 'react-dom/server'
import {createElement} from 'react'
import {buildVoicePlan,synthesize} from '../supabase/functions/_shared/listening.ts'
import {answerDeadline,presenterClock} from '../src/lib/questionTiming.ts'

test('Japanese two-speaker synthesis omits the rejected mode and preserves turns and voices',async()=>{
 const previousFetch=globalThis.fetch,previousDeno=globalThis.Deno
 globalThis.Deno={env:{get:key=>key==='GEMINI_API_KEY'?'offline-key':undefined}}
 let request
 globalThis.fetch=async(_,options)=>{request=JSON.parse(options.body);return Response.json({steps:[{content:[{type:'audio',data:btoa('\0\0')}]}]})}
 try{
  const text='店員：いらっしゃいませ。\nお客さん：コーヒーを一つお願いします。'
  const plan=buildVoicePlan('dialogue','ja',null,['店員','お客さん'],['female','male'],text)
  assert.equal((await synthesize(text,plan)).length,2)
  assert.deepEqual(request.generation_config.speech_config,{speakers:plan.speakers.map((speaker,i)=>({speaker,voice:plan.voiceNames[i]}))})
  assert.deepEqual(request.input[0].content.map(turn=>turn.text),['いらっしゃいませ。','コーヒーを一つお願いします。'])
  assert.deepEqual(request.input[0].content.map(turn=>turn.annotations[0].speaker),['店員','お客さん'])
 }finally{globalThis.fetch=previousFetch;globalThis.Deno=previousDeno}
})

test('teacher clock covers every written activity and clearly distinguishes individual audio timing',()=>{
 const start=Date.parse('2026-10-28T00:00:00Z')
 for(const type of ['multiple_choice','poll','short_answer','custom_quiz','matching','ordering','drawing','file_upload','hotspot','board','listening','send_screen']){
  const q={type,status:'active',started_at:new Date(start).toISOString(),answer_seconds:45}
  assert.equal(presenterClock(q,start+10000).deadline,start+45000,type)
  assert.equal(presenterClock({...q,status:'stopped'},start),null)
  assert.equal(presenterClock({...q,answer_seconds:null},start),null)
 }
 const oral={type:'oral_response',status:'active',started_at:new Date(start).toISOString(),prepare_seconds:10,answer_seconds:30}
 assert.equal(answerDeadline(oral),null)
 assert.deepEqual(presenterClock(oral,start+5000),{deadline:start+10000,phase:'prepare',individual:true})
 assert.deepEqual(presenterClock(oral,start+11000),{deadline:start+40000,phase:'answer',individual:true})
})

test('Japanese follow-up, writing and ordering controls render Japanese; farewell language survives deletion and another class',async()=>{
 const oldWindow=globalThis.window,oldStorage=globalThis.localStorage
 const storage=new Map()
 globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
 globalThis.window={localStorage:globalThis.localStorage,location:{hash:'#/presenter/test',search:''},addEventListener(){},removeEventListener(){}}
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},define:{'import.meta.env.VITE_APP_PROFILE':JSON.stringify('japanese')}})
 try{
  const {PresenterLocaleContext}=await server.ssrLoadModule('/src/lib/presenterI18n.ts')
  const {setUiLanguage}=await server.ssrLoadModule('/src/lib/uiText.ts')
  const {TeachingCyclePanel}=await server.ssrLoadModule('/src/components/TeachingCyclePanel.tsx')
  const {CustomQuizFields}=await server.ssrLoadModule('/src/components/CustomQuizFields.tsx')
  const {InteractionEditor}=await server.ssrLoadModule('/src/components/InteractionEditor.tsx')
  const {PresenterQuestionClock}=await server.ssrLoadModule('/src/components/PresenterQuestionClock.tsx')
  const {localeForDispatchedGuidance,rememberParticipantLocale,participantLocaleFromStorage,participantText}=await server.ssrLoadModule('/src/lib/participantI18n.ts')
  setUiLanguage('ja')
  const render=(component,props)=>renderToStaticMarkup(createElement(PresenterLocaleContext.Provider,{value:'ja'},createElement(component,props)))
  const html=render(TeachingCyclePanel,{question:{id:'q',type:'short_answer'},sessionId:'test',presenterToken:'placeholder',participants:[],active:true,onDispatched(){}})
  assert.match(html,/次の練習|つまずき|ペア/);assert.doesNotMatch(html,/Follow-up|Practice again|Discuss work|Learning needs|Pair task/)
  const writing=render(CustomQuizFields,{count:'auto',direction:'',quizType:'writing',coaching:true,onCountChange(){},onDirectionChange(){},onTypeChange(){},onCoachingChange(){}})
  assert.match(writing,/作文|コーチ/);assert.doesNotMatch(writing,/Writing|Enable AI|Field count/)
  const ordering=render(InteractionEditor,{value:{kind:'ordering',tiles:[],items:[],hasAnswer:true,shareScreenshot:true,sentenceMode:false},direction:'',previewUrl:null,onChange(){},onDirectionChange(){},onGenerate(){},onBusy(){}})
  assert.match(ordering,/並べ替え|スクリーンショット/);assert.doesNotMatch(ordering,/Split screenshot|Instructions \(optional\)|Generate with AI/)
  const q={type:'custom_quiz',status:'active',started_at:new Date(Date.now()-5000).toISOString(),answer_seconds:45}
  assert.match(render(PresenterQuestionClock,{question:q}),/role="timer"/)
  assert.match(render(PresenterQuestionClock,{question:{...q,started_at:new Date(Date.now()-60000).toISOString()}}),/時間切れ|時間になりました|終了/)
  assert.equal(localeForDispatchedGuidance('a','ja'),'ja')
  rememberParticipantLocale('a','en')
  assert.equal(localeForDispatchedGuidance('a','ja'),'en')
  assert.equal(localeForDispatchedGuidance('b','zh-TW'),'zh-TW')
  assert.equal(participantLocaleFromStorage(undefined,'a'),'en')
  assert.equal(participantText(participantLocaleFromStorage(undefined,'a'),'classDismissed'),'Class dismissed!')
  assert.equal(localeForDispatchedGuidance('a','ja'),'en')
  assert.equal(localeForDispatchedGuidance('a','zh-TW'),'zh-TW')
  rememberParticipantLocale('a','ja')
  assert.match(participantText(participantLocaleFromStorage(undefined,'a'),'sessionGoneTitle'),/終了/)
 }finally{await server.close();globalThis.window=oldWindow;globalThis.localStorage=oldStorage}
})
