import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)

function loadModule(file, dependencies, profile) {
  const source = readFileSync(new URL('../'+file,import.meta.url),'utf8').replaceAll('import.meta.env.VITE_APP_PROFILE',JSON.stringify(profile))
  const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const exports = {}
  new Function('require','exports',compiled)(name=>dependencies[name]||require(name),exports)
  return exports
}

test('Huayu gains SC capabilities with an independent Traditional default and full student languages',()=>{
 const values=new Map(), previousStorage=globalThis.localStorage, previousWindow=globalThis.window
 globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}
 globalThis.window={dispatchEvent:()=>{}}
 try{
  for(const profile of ['huayu','sc','ncacls','english']){
   const config=loadModule('src/lib/appProfiles.ts',{},profile)
   const language=loadModule('src/lib/scSystemLanguage.ts',{'./appProfiles':config},profile)
   assert.equal(language.scSystemLanguage(),profile==='sc'?'zh-CN':'zh-TW')
   assert.equal(language.supportsChineseSystemLanguage,['huayu','sc'].includes(profile))
   if(profile==='huayu'){
    assert.ok(config.profileAllowsTrack('putonghua'));assert.ok(config.profileAllowsTrack('huayu'))
    language.setScSystemLanguage('zh-CN');assert.equal(language.scSystemLanguage(),'zh-CN')
    language.setScSystemLanguage('en');assert.equal(language.scSystemLanguage(),'en')
    const brand=loadModule('src/lib/brand.ts',{'./appProfiles':config},profile)
    assert.equal(brand.buildBrand,'huayu');assert.equal(brand.brandFromSearch(new URLSearchParams('b=huayu')),'huayu')
    const locales=['zh-TW','zh-CN','en','vi','th','ja','ko','id'].map(code=>({code}))
    assert.deepEqual(brand.guidanceLocalesForBrand(locales,'huayu').map(item=>item.code),['zh-TW','zh-CN','en','ja','ko','vi','th','id'])
   }else if(profile==='sc'){
    assert.equal(config.profileAllowsTrack('huayu'),false)
    for(const saved of ['zh-TW','en']){
     values.set('lingoact:sc:system-language',saved)
     assert.equal(language.scSystemLanguage(),'zh-CN')
     language.setScSystemLanguage(saved)
     assert.equal(values.get('lingoact:sc:system-language'),'zh-CN')
    }
   }else if(profile==='ncacls')assert.equal(config.profileAllowsTrack('putonghua'),false)
  }
  // Choosing SC in Huayu did not change the SC edition's saved/default language.
  assert.equal(values.get('lingoact:huayu:system-language'),'en')
 }finally{globalThis.localStorage=previousStorage;globalThis.window=previousWindow}
})

test('real create-session handler persists Huayu script, standard, level, caption language and annotation',async()=>{
 registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('npm:@supabase/supabase-js@')?'@supabase/supabase-js':specifier,context)}})
 const previousDeno=globalThis.Deno,previousFetch=globalThis.fetch
 let handler, rows=[]
 globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-only-public-placeholder'})[key]},serve:callback=>{handler=callback}}
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/rest/v1/sessions')){rows.push(JSON.parse(options.body));return new Response(JSON.stringify({id:crypto.randomUUID(),code:'QA1234'}),{status:201,headers:{'Content-Type':'application/json'}})}
  return new Response(null,{status:201})
 }
 try{
  await import('../supabase/functions/create-session/index.ts')
  const cases=[
   {appProfile:'huayu',levelFramework:'tbcl',levelCode:'2',readingAnnotation:'zhuyin',expect:['zh-TW','huayu','tbcl','zhuyin','zh-tw']},
   {appProfile:'huayu',systemLanguage:'zh-CN',levelFramework:'tocfl',levelCode:'2',readingAnnotation:'zhuyin',expect:['zh-CN','putonghua','hsk','pinyin','zh-cn']},
   {appProfile:'huayu',systemLanguage:'zh-TW',levelFramework:'tocfl',levelCode:'level2',readingAnnotation:'pinyin',expect:['zh-TW','huayu','tocfl','pinyin','zh-tw']},
   ...['hsk','tocfl','tbcl'].map(framework=>({appProfile:'huayu',systemLanguage:'en',levelFramework:framework,levelCode:framework==='tocfl'?'level2':'2',expect:['en',framework==='hsk'?'putonghua':'huayu',framework,framework==='hsk'?'pinyin':'none',framework==='hsk'?'zh-cn':'zh-tw']})),
   {appProfile:'sc',levelFramework:'hsk',levelCode:'2',expect:['zh-CN','putonghua','hsk','pinyin','zh-cn']},
   ...['zh-TW','en'].map(language=>({appProfile:'sc',systemLanguage:language,levelFramework:'tbcl',levelCode:'2',readingAnnotation:'zhuyin',expect:['zh-CN','putonghua','hsk','pinyin','zh-cn']})),
   {teachingLanguage:'huayu',guidanceLanguage:'vi',levelFramework:'tocfl',levelCode:'level2',readingAnnotation:'zhuyin',expect:[null,'huayu','tocfl','zhuyin','zh-tw']},
  ]
  for(const {expect,...input} of cases){
   const response=await handler(new Request('https://example.supabase.co/functions/v1/create-session',{method:'POST',headers:{'Content-Type':'application/json','x-lingoact-client':'desktop-app'},body:JSON.stringify(input)}))
   assert.equal(response.status,200,await response.clone().text())
   const row=rows.at(-1)
   assert.deepEqual([row.system_language,row.teaching_language,row.level_framework,row.reading_annotation,row.caption_source_language],expect)
   assert.equal(row.level_code,input.levelCode)
   assert.equal(row.guidance_language,row.system_language||input.guidanceLanguage)
  }
  const count=rows.length
  const missing=await handler(new Request('https://example.supabase.co/functions/v1/create-session',{method:'POST',headers:{'Content-Type':'application/json','x-lingoact-client':'desktop-app'},body:JSON.stringify({appProfile:'huayu',systemLanguage:'zh-CN'})}))
  assert.equal(missing.status,400);assert.equal(rows.length,count)
 }finally{globalThis.Deno=previousDeno;globalThis.fetch=previousFetch}
})
