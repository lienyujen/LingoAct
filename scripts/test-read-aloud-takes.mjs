import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { classroomMessage, activityNotice } from '../src/lib/classroomMessages.ts'
import { readingQuizFailureMessage } from '../supabase/functions/_shared/reading-failure.ts'
import { recordingLimitMs } from '../supabase/functions/_shared/recording-limits.ts'
import { recordingForClient } from '../supabase/functions/_shared/recording-results.ts'
const require=createRequire(import.meta.url)
function component(file,dependencies){const source=readFileSync(file,'utf8'),exports={};new Function('require','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(name=>dependencies[name]||require(name),exports);return exports}
const Player=()=>null
const comparison=component('src/components/RecordingComparison.tsx',{'../lib/classroomMessages':{classroomMessage},'./RecordingPlayer':{RecordingPlayer:Player}}).RecordingComparison
const recorder=component('src/components/AudioRecorder.tsx',{'../../supabase/functions/_shared/recording-limits':{recordingLimitMs},'@phosphor-icons/react':{ArrowCounterClockwise:()=>null,Microphone:()=>null,StopCircle:()=>null},'./RecordingComparison':{RecordingComparison:comparison},'../lib/classroomMessages':{classroomMessage},'../lib/uiText':{uiText:x=>x},'./RecordingPlayer':{RecordingPlayer:Player},'../lib/audio':{},'../lib/participantI18n':{participantText:(_l,key)=>key},'../lib/localizedContent':{localizedFields:()=>null}}).AudioRecorder
const analysis={score:82,summary:'发音清楚。',strengths:['声调正确。'],improvements:['注意语速。'],transcript:'你好。',detected_language:'zh',relevance:'切题',clarity:'清楚',completeness:'完整'}
const response={id:'first',analysis_status:'success',analysis_json:analysis,score:82,attempt_number:1,duration_ms:2000}
const render=(type='pronunciation',status='active',value=response)=>renderToStaticMarkup(createElement(recorder,{busy:false,question:{id:'q',type,status},response:value,onSubmit:async()=>{},onDiscard:async()=>{},locale:'zh-CN'}))
test('read-aloud feedback appears while open, a second take retains the first, stop only disables submission; oral feedback also appears while open',()=>{
 const first=render();assert.match(first,/audio-score/);assert.match(first,/82/);assert.match(first,/再录一次（保留第一次）/)
 assert.match(render('oral_response'),/audio-score/)
 assert.doesNotMatch(render('pronunciation','stopped'),/再录一次/)
 const second=render('pronunciation','active',{...response,id:'second',score:91,attempt_number:2,analysis_json:{...analysis,score:91},previous_attempt:response})
 assert.match(second,/两次成绩对比/);assert.match(second,/第 1 次：82 分/);assert.match(second,/第 2 次：91 分/);assert.doesNotMatch(second,/再录一次/)
})
test('archived and current takes strip all private storage paths, including unexpected nested history',async()=>{
 const db={storage:{from:()=>({createSignedUrl:async path=>({data:{signedUrl:'https://audio.example/'+path},error:null})})}}
 const result=await recordingForClient(db,{id:'second',storage_path:'second.wav',previous_attempt:{id:'first',storage_path:'first.wav',previous_attempt:{storage_path:'hidden.wav'}}})
 assert.equal(result.signed_url,'https://audio.example/second.wav');assert.equal(result.previous_attempt.signed_url,'https://audio.example/first.wav');assert.doesNotMatch(JSON.stringify(result),/storage_path|hidden.wav/)
})
test('reading failure notices distinguish timeout and quota in Simplified Chinese while preserving teacher content',()=>{
 assert.match(readingQuizFailureMessage('putonghua','hsk','request timed out'),/生成超时/)
 assert.match(readingQuizFailureMessage('putonghua','hsk','429 quota'),/调用限额/)
 assert.match(readingQuizFailureMessage('huayu','tbcl','request timed out'),/生成逾時/)
 assert.equal(activityNotice('這篇的題目沒有生成成功，可以直接讀，或請老師重新派送。','zh-CN'),classroomMessage('zh-CN','readingQuizFailed'))
 const text='老师说：请把这篇文章翻译成英文。';assert.equal(activityNotice(text,'en'),text)
})
import{reusableReadingWords}from'../src/lib/readingAnnotationReuse.ts'
test('reuse only complete, exact pinyin coverage so long articles avoid a redundant AI annotation',()=>{
 assert.equal(reusableReadingWords('你好。',[{text:'你好',pinyin:'Nǐhǎo'},{text:'。',pinyin:''}]),true)
 assert.equal(reusableReadingWords('你好。',[{text:'你好',pinyin:''},{text:'。',pinyin:''}]),false)
 assert.equal(reusableReadingWords('你好。',[{text:'您好',pinyin:'Nínhǎo'},{text:'。',pinyin:''}]),false)
 assert.equal(reusableReadingWords('你好。',undefined),false)
})
import { readingAnnotationChunks, annotateReadingChunks } from '../supabase/functions/_shared/reading-annotation-chunks.ts'
test('long annotation chunks retain exact Unicode text and context, with at most two concurrent calls',async()=>{
 const text=('😀 小明准备租房。\n为了练习汉语，他每天都和邻居聊天。').repeat(50)
 const chunks=readingAnnotationChunks(text);assert.equal(chunks.join(''),text);assert.ok(chunks.every(chunk=>[...chunk].length<=320))
 let active=0,peak=0;const parts=await annotateReadingChunks(text,async(chunk,context)=>{active++;peak=Math.max(peak,active);assert.ok(typeof context.preceding_context==='string');await new Promise(resolve=>setTimeout(resolve,2));active--;return chunk})
 assert.equal(parts.join(''),text);assert.equal(peak,2)
 await assert.rejects(annotateReadingChunks(text,async()=>{throw Error('partial annotation failed')}),/partial annotation failed/)
})
