import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { classFeedbackSettings, feedbackSystemPrompt, mainlandFeedbackInstruction } from '../supabase/functions/_shared/feedback-language.ts'

registerHooks({ resolve(specifier, context, nextResolve) {
 return nextResolve(specifier.startsWith('npm:@supabase/supabase-js@') ? '@supabase/supabase-js' : specifier, context)
}})
const { analyzeFileResponse } = await import('../supabase/functions/_shared/file-analysis.ts')
const { analyzeAudioResponse } = await import('../supabase/functions/_shared/audio-analysis.ts')
const { reviewWriting } = await import('../supabase/functions/_shared/writing-review.ts')
const cn = { system_language: 'zh-CN', teaching_language: 'putonghua', level_framework: 'hsk', level_code: '2' }
const tw = { system_language: 'zh-TW', teaching_language: 'huayu', level_framework: 'tocfl', level_code: 'level2' }

test('class language is authoritative, with legacy and English HSK compatibility', () => {
 const original='請以繁體中文分析。Write Traditional Chinese first.'
 assert.equal(feedbackSystemPrompt(original,tw),original)
 assert.equal(feedbackSystemPrompt(original,undefined),original)
 assert.equal(feedbackSystemPrompt(original,{...cn,system_language:'zh-TW'}),original)
 for(const settings of [cn,{...cn,system_language:'en'},{level_framework:'hsk'}]) {
  const prompt=feedbackSystemPrompt(original,settings)
  assert.doesNotMatch(prompt,/繁體中文|Traditional Chinese/)
  assert.match(prompt,/Simplified/)
  assert.match(prompt,/compatibility keys/)
 }
 const level=mainlandFeedbackInstruction(cn)
 assert.match(level,/HSK 2/)
 assert.match(level,/short, clear sentences/)
 assert.match(level,/Do not automatically raise/)
 assert.match(level,/keep them faithful/)
 assert.doesNotMatch(level,/stem to at most/)
})

test('session lookup propagates settings and fails rather than silently assuming Traditional',async()=>{
 let selected=''
 const db={from:()=>({select:columns=>{selected=columns;return {eq:()=>({maybeSingle:async()=>({data:cn})})}}})}
 assert.deepEqual(await classFeedbackSettings(db,'class'),cn)
 assert.match(selected,/system_language/)
 const broken={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null,error:new Error('offline')})})})})}
 await assert.rejects(classFeedbackSettings(broken,'class'),/offline/)
})

test('file, oral and writing assessment requests carry Mainland policy and preserve evidence and English',async()=>{
 const savedFetch=globalThis.fetch, savedDeno=globalThis.Deno
 globalThis.Deno={env:{get:name=>name==='GEMINI_API_KEY'?'unit-test-key':undefined}}
 let requests=[], payload={}
 globalThis.fetch=async(_url,options)=>{
  requests.push(JSON.parse(options.body))
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}),{status:200})
 }
 try {
  for(const settings of [cn,tw]) {
   payload={verdict:'partial',score:60,summary_zh_tw:'请根据图片回答。',summary_en:'Answer using the picture.',strengths_zh_tw:[],strengths_en:[],improvements_zh_tw:['先读题目，再写答案。'],improvements_en:['Read the question first, then answer.']}
   for(const caption of [null,{text:'這是水。',audio:null}]) {
    const result=await analyzeFileResponse({promptText:'描述這張照片。',files:[{fileName:'test.png',mimeType:'image/png',fileBytes:new Uint8Array([1,2])}],caption,feedbackSettings:settings})
    assert.equal(result.summary_en,payload.summary_en)
    const request=requests.at(-1), prompt=request.systemInstruction.parts[0].text
    assert.equal(request.contents[0].parts[0].text.includes('描述這張照片。'),true)
    if(settings===cn){assert.match(prompt,/HSK 2/);assert.match(prompt,/standard Mainland/);assert.doesNotMatch(prompt,/繁體中文/)}
    else {assert.match(prompt,/繁體中文/);assert.doesNotMatch(prompt,/FEEDBACK LEVEL/)}
   }
   payload={score:85,summary:'表达清楚。',transcript:'這是水。',translations:{en:{summary:'Clear expression.'}}}
   const audio=await analyzeAudioResponse({mode:'oral_response',promptText:'介紹這張照片。',screenshotUrl:null,audioBytes:new Uint8Array([1,2]),audioMimeType:'audio/wav',feedbackSettings:settings})
   assert.equal(audio.transcript,'這是水。')
   const oralPrompt=requests.at(-1).systemInstruction.parts[0].text
   if(settings===cn){assert.match(oralPrompt,/HSK 2/);assert.doesNotMatch(oralPrompt,/繁體中文/)}
   else assert.match(oralPrompt,/繁體中文/)
   payload={fields:[{item_id:'one',feedback_zh_tw:'你写得很清楚。',feedback_en:'Your writing is clear.'}],overall_zh_tw:'再加一个例子。',overall_en:'Add one more example.',score:85,revised_composition:'這是水。',revision_notes:[]}
   const review=await reviewWriting({direction:'介绍物品',fields:[{itemId:'one',prompt:'介紹物品',text:'這是水。'}],composition:'這是水。',trackId:settings.teaching_language,framework:settings.level_framework,levelCode:settings.level_code,feedbackSettings:settings})
   assert.equal(review.fields[0].en,'Your writing is clear.')
   assert.equal(review.revision.zhTw,'這是水。')
   const writingPrompt=requests.at(-1).systemInstruction.parts[0].text
   if(settings===cn){assert.match(writingPrompt,/HSK 2/);assert.doesNotMatch(writingPrompt,/Traditional Chinese/)}
   else assert.match(writingPrompt,/Traditional Chinese/)
  }
 } finally { globalThis.fetch=savedFetch;globalThis.Deno=savedDeno }
})
