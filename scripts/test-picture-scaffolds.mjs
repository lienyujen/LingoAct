import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerHooks } from 'node:module'
import { pictureStudentPrompt } from '../src/lib/pictureStudentPrompt.ts'
registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('npm:@supabase/supabase-js@')?'@supabase/supabase-js':specifier,context)}})
test('picture scaffolds reach stored question unchanged, without translation AI calls',async()=>{
 const savedDeno=globalThis.Deno,savedFetch=globalThis.fetch
 const sessionId=crypto.randomUUID(),prompt=pictureStudentPrompt('请看图说一说。',{targetWords:['头发','衣服'],pattern:'有的……，有的……'}, {words:'建议词语',pattern:'建议句型'})
 assert.match(prompt,/建议词语：头发、衣服/);assert.match(prompt,/建议句型：有的/)
 assert.equal(pictureStudentPrompt('Say something.',{targetWords:[],pattern:''},{words:'Words',pattern:'Patterns'}),'Say something.')
 let handler,stored,aiCalls=0
 globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-placeholder'})[key]},serve:callback=>{handler=callback}}
 globalThis.fetch=async(url,options)=>{
  if(!String(url).includes('example.supabase.co')){aiCalls++;throw new Error('Unexpected translation')}
  if(String(url).includes('presenter_session_keys'))return new Response(JSON.stringify({session_id:sessionId}),{status:200})
  if(String(url).includes('/questions')&&options.method==='POST'){stored=JSON.parse(options.body);return new Response(JSON.stringify({...stored,id:crypto.randomUUID()}),{status:201})}
  return new Response(JSON.stringify([]),{status:200})
 }
 try{
  await import('../supabase/functions/presenter-action/index.ts')
  for(const questionType of ['oral_response','short_answer']){
   const response=await handler(new Request('https://example.supabase.co/functions/v1/presenter-action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create_question',sessionId,presenterToken:'test-presenter',questionType,promptText:prompt,preservePromptLanguage:true,options:[]})}))
   assert.equal(response.status,200,await response.clone().text())
   assert.equal(stored.prompt_text,prompt);assert.deepEqual(stored.translations,{})
   for(const locale of ['en','vi','th','ja','ko','id','zh-TW','zh-CN'])assert.equal(stored.translations[locale]?.prompt_text||stored.prompt_text,prompt)
  }
  assert.equal(aiCalls,0)
 }finally{globalThis.Deno=savedDeno;globalThis.fetch=savedFetch}
})
