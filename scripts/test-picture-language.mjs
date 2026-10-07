import assert from 'node:assert/strict'
import { test } from 'node:test'
import { describePictureSource, planPictureStory, pictureLanguageRules } from '../supabase/functions/_shared/picture.ts'
const cn={system_language:'zh-CN',teaching_language:'putonghua',level_framework:'hsk',level_code:'2'}
const tw={system_language:'zh-TW',teaching_language:'huayu',level_framework:'tocfl',level_code:'level2'}
test('captured and generated picture prompts use class script and level; Traditional rules remain intact',async()=>{
 const rules='Write title in Traditional Chinese.'
 assert.equal(pictureLanguageRules(rules,{settings:tw,trackId:'huayu',framework:'tocfl'}),rules)
 const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno
 globalThis.Deno={env:{get:key=>key==='GEMINI_API_KEY'?'test-key':undefined}}
 let request
 globalThis.fetch=async(_url,options)=>{
  request=JSON.parse(options.body)
  const payload={title:'不同发型与服装的证件照对比',cast:'人物',panels:['第一格','第二格','第三格','第四格'],target_words:['头发','长','短'],pattern:'有的……，有的……',spoken_prompt:'请说说这些人的头发有什么不同。',written_prompt:'请写两句话，比较两个人的头发。',order_prompt:'请选择顺序，每张图写一句话。',caution:''}
  return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(payload)}]}}]}),{status:200})
 }
 try{
  for(const settings of [cn,tw])for(const captured of [true,false]){
   const input={settings,trackId:settings.teaching_language,framework:settings.level_framework,levelCode:settings.level_code,direction:''}
   const result=await(captured?describePictureSource({...input,image:{mimeType:'image/png',base64:'AA=='}}):planPictureStory(input))
   const prompt=request.systemInstruction.parts[0].text
   if(settings===cn){assert.match(prompt,/SCRIPT AND STANDARD/);assert.match(prompt,/HSK 2/);assert.doesNotMatch(prompt,/in Traditional Chinese|teaching in Taiwan|class in Taiwan/)}
   else {assert.match(prompt,/Traditional Chinese/);assert.doesNotMatch(prompt,/SCRIPT AND STANDARD/)}
   assert.equal(result.title,'不同发型与服装的证件照对比')
   assert.equal(result.writtenPrompt,'请写两句话，比较两个人的头发。')
  }
 }finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno}
})
