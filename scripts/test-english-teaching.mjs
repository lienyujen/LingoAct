import { englishTextRuns } from '../src/lib/englishText.ts'

test('English karaoke keeps whole words, contractions, punctuation and Unicode cue offsets', () => {
  const text = "😀 Leo: Don't re-read each letter."
  const runs = englishTextRuns(text)
  assert.equal(runs.map(run => run.text).join(''), text)
  assert.deepEqual(runs.filter(run => run.word).map(run => run.text), ['Leo', "Don't", 're-read', 'each', 'letter'])
  const leo = runs.find(run => run.text === 'Leo')
  assert.equal(leo.start, 2)
  assert.equal(leo.offset, 3)
})

test('English karaoke highlights an entire word even when an old cue ends inside it', () => {
  const require = createRequire(import.meta.url)
  const source = readFileSync(new URL('../src/components/ListeningPlayer.tsx', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)(name => {
    if (name === '../lib/englishText') return { englishTextRuns }
    if (name.startsWith('../lib/') || name === '@phosphor-icons/react') return {}
    return require(name)
  }, exports)
  const html = renderToStaticMarkup(createElement(exports.KaraokeText, {
    language: 'en', text: "An entrance exam.", activeCue: 0,
    cues: [{ start_index: 3, end_index: 5, start_ms: 0, end_ms: 100 }],
    fontFamily: null, ruby: [], words: null,
  }))
  assert.match(html, /class="karaoke-word active">entrance<\/span>/)
  assert.doesNotMatch(html, /karaoke-character|<rt>/)
})
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FRAMEWORKS as client } from '../src/lib/proficiency.ts'
import { TEACHING_TRACKS } from '../src/lib/teachingTracks.ts'
import { FRAMEWORKS as server, dispatchLevelCode, levelInstruction } from '../supabase/functions/_shared/proficiency.ts'
import { resolveFramework, trackInstruction } from '../supabase/functions/_shared/teaching.ts'
import { speechAccent } from '../supabase/functions/_shared/speech-accent.ts'
import { accentChoices } from '../src/lib/speechAccent.ts'
import { buildVoicePlan, contentHash } from '../supabase/functions/_shared/listening.ts'
import { englishWord, englishWords, englishReadingTargets, englishNewWords } from '../supabase/functions/_shared/english.ts'
import { generateReadingPassage, writeMissingGrammarNotes } from '../supabase/functions/_shared/reading.ts'
import { feedbackSystemPrompt } from '../supabase/functions/_shared/feedback-language.ts'
import { protectLearningReferences } from '../supabase/functions/_shared/learning-translation.ts'
import { ENGLISH_GRAMMAR } from '../supabase/functions/_shared/english-grammar.generated.ts'
import { englishMaterialIssue, requireEnglishMaterial } from '../supabase/functions/_shared/english-material.ts'

test('English grammar references contain curriculum points rather than extracted headings', () => {
  assert.equal(ENGLISH_GRAMMAR.length,76)
  assert.ok(ENGLISH_GRAMMAR.every(entry => entry.source === 'naer-general-2018' && entry.page >= 70 && entry.page <= 73))
  assert.ok(ENGLISH_GRAMMAR.some(entry => entry.point === 'gerunds after prepositions'))
  assert.ok(ENGLISH_GRAMMAR.some(entry => entry.point === 'question tags'))
  assert.equal(new Set(ENGLISH_GRAMMAR.map(entry => entry.point)).size,76)
})

test('English material rejects mixed teaching scripts while allowing English names and IPA', () => {
  requireEnglishMaterial("Emma: What's your favourite book?", '/ˈbʊk/', 'Beyoncé')
  for (const text of ['The answer is 學校.', 'A. 学生', '日本語', '한국어', 'ภาษาไทย']) assert.ok(englishMaterialIssue(text))
  assert.throws(() => requireEnglishMaterial('Read this.', '請作答'),/must stay in English/)
})

test('English student guidance offers only English and Traditional Chinese on the shared deployment', () => {
  const exports={}
  const source=readFileSync(new URL('../src/lib/brand.ts',import.meta.url),'utf8')
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','exports',compiled)(()=>({APP_PROFILE:{id:'full'}}),exports)
  const all=['vi','zh-CN','en','zh-TW','ja','ko','th','id'].map(code=>({code}))
  assert.deepEqual(exports.guidanceLocalesForBrand(all,'english').map(option=>option.code),['en','zh-TW'])
  assert.ok(exports.guidanceLocalesForBrand(all,'huayu').some(option=>option.code==='vi'))
})

test('English matching quizzes retry wrong-language columns and never dispatch a failed correction', async () => {
  registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('npm:@supabase/supabase-js@')?'@supabase/supabase-js':specifier,context)}})
  const {generateCustomQuiz}=await import('../supabase/functions/_shared/custom-quiz.ts')
  const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno
  globalThis.Deno={env:{get:()=> 'test-key'}}
  let calls=0,correct=false,instructions=''
  globalThis.fetch=async(_url,options)=> {
    calls++
    const request=JSON.parse(options.body)
    instructions=request.systemInstruction.parts[0].text
    const result={title:'Match the words',items:[{type:'matching',prompt_text:'Match each word to its meaning.',pair_prompts:correct&&calls>1 ? ['book','school','park'] : ['書本','school','park'],options:['Something you read','A place to learn','A place to walk'],accepted_answers:[],rubric:''}]}
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}),{status:200})
  }
  const input={sourceText:'Books are useful at school.',direction:'請用中文出題',requestedType:'matching',requestedCount:1,teachingLanguage:'English',guidanceLanguage:'Traditional Chinese',levelFramework:'cefr',levelCode:'A2'}
  try {
    await assert.rejects(()=>generateCustomQuiz(input),/must stay in English/)
    assert.equal(calls,2)
    calls=0;correct=true
    const quiz=await generateCustomQuiz(input)
    assert.deepEqual(quiz.items[0].pair_prompts,['book','school','park'])
    assert.equal(calls,2)
    assert.match(instructions,/cannot switch the teaching language/)
  } finally {globalThis.fetch=oldFetch;globalThis.Deno=oldDeno}
})

test('English reading retries mixed-language AI passages once before accepting or rejecting them', async () => {
  const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno
  globalThis.Deno={env:{get:()=> 'test-key'}}
  let calls=0,correct=false
  globalThis.fetch=async()=> {
    calls++
    const result={title:'At School',body:correct&&calls>1 ? 'We read books at school.' : 'We read books 在學校.',words:[],grammar:[]}
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}),{status:200})
  }
  const input={source:'A school day',direction:'',teachingLanguage:'en',levelFramework:'cefr',levelCode:'A1',levelStretch:0,accent:'american',locales:['en']}
  try {
    await assert.rejects(()=>generateReadingPassage(input),/must stay in English/)
    assert.equal(calls,2)
    calls=0;correct=true
    const passage=await generateReadingPassage(input)
    assert.equal(passage.body,'We read books at school.')
    assert.equal(calls,2)
  } finally {globalThis.fetch=oldFetch;globalThis.Deno=oldDeno}
})

test('English exit tickets replace stale Chinese cache and store English questions', async () => {
  const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno
  let handler,saved,instruction=''
  globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-placeholder',GEMINI_API_KEY:'test-key'})[key]},serve:callback=>{handler=callback}}
  globalThis.fetch=async(url,options)=> {
    if(!String(url).includes('example.supabase.co')) {
      const request=JSON.parse(options.body)
      instruction=request.systemInstruction.parts.map(part=>part.text).join('\n')
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({category:'lesson_summary',prompt:'What did you learn about recycling today?',prompt_en:'What did you learn about recycling today?'})}]}}]}),{status:200})
    }
    const table=new URL(url).pathname.split('/').at(-1)
    if(options.method==='PATCH') {saved=JSON.parse(options.body);return new Response(null,{status:204})}
    const row=table==='presenter_session_keys' ? {session_id:'class'} : table==='sessions'
      ? {id:'class',title:'English A2',teaching_language:'en',guidance_language:'en',level_framework:'cefr',level_code:'A2',exit_ticket_prompt:'今天學到什麼？'} : []
    return new Response(JSON.stringify(row),{status:200,headers:{'Content-Type':'application/json','Content-Range':'0-0/0'}})
  }
  try {
    await import('../supabase/functions/generate-exit-ticket/index.ts')
    const response=await handler(new Request('https://example.supabase.co/functions/v1/generate-exit-ticket',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:'class',presenterToken:'test-token'})}))
    assert.equal(response.status,200,await response.clone().text())
    assert.equal((await response.json()).cached,false)
    assert.equal(saved.exit_ticket_prompt,'What did you learn about recycling today?')
    assert.equal(saved.exit_ticket_prompt_en,saved.exit_ticket_prompt)
    assert.deepEqual(saved.exit_ticket_prompt_translations,{})
    const contentModule={}
    const source=readFileSync(new URL('../src/lib/sessionContent.ts',import.meta.url),'utf8')
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
    new Function('require','exports',compiled)(()=>({contentLocaleKey:locale=>locale.toLowerCase().replace('-','_')}),contentModule)
    assert.equal(contentModule.exitTicketPrompt({teaching_language:'en',exit_ticket_prompt:saved.exit_ticket_prompt,exit_ticket_prompt_translations:{zh_tw:'今天學到什麼？'}},'zh-TW'),saved.exit_ticket_prompt)
    assert.match(instruction,/Both prompt and prompt_en must contain the same natural English/)
    assert.doesNotMatch(instruction,/繁體中文題目/)
  } finally {globalThis.fetch=oldFetch;globalThis.Deno=oldDeno}
})

test('English levels agree across browser and backend; other tracks keep their scales', () => {
  assert.deepEqual(TEACHING_TRACKS.find(track=>track.id==='en').frameworks,['en108','cefr','gept','toeic'])
  assert.equal(resolveFramework('en','cefr'),'cefr')
  assert.equal(resolveFramework('huayu','cefr'),'tbcl')
  for (const framework of ['en108','cefr','gept','toeic']) assert.deepEqual(
    new Set(client.find(row=>row.id===framework).levels.map(row=>row.code)),new Set(server[framework].levels.map(row=>row.code)))
  assert.match(levelInstruction('en108','v'),/vocational/)
  assert.match(levelInstruction('toeic','sw-b2'),/speaking at least 160\/200; writing at least 150\/200/)
  assert.doesNotMatch(levelInstruction('toeic','blue'),/Roughly CEFR/)
  assert.match(trackInstruction('en'),/Guidance and explanatory feedback/)
})

test('explicit English activity overrides preserve class defaults and ignore negation/i+1', () => {
  for (const direction of ['', 'i+1', '不要改成 CEFR B2', 'Do not use B2']) assert.equal(dispatchLevelCode('cefr','A2',direction),'A2')
  assert.equal(dispatchLevelCode('cefr','A2','Use CEFR B1'),'B1')
  assert.equal(dispatchLevelCode('cefr','B1','改成 CEFR Pre-A1'),'Pre-A1')
  assert.equal(dispatchLevelCode('en108','j','改成技術型高中'),'v')
  assert.equal(dispatchLevelCode('gept','elementary','改成中高級'),'high-intermediate')
  assert.equal(dispatchLevelCode('toeic','blue','Switch to sw-b2'),'sw-b2')
  assert.equal(dispatchLevelCode('en108','j','Switch to h-advanced'),'h-advanced')
})

test('American and British voices are distinct without changing supplied text or Mandarin', async () => {
  assert.deepEqual(accentChoices('en').map(choice=>choice.value),['american','british'])
  assert.equal(speechAccent('en','taiwanese'),'american')
  const text='Amy: Robert lives near the park.\nRobert: I work here.'
  const american=buildVoicePlan('dialogue','en','american',['Amy','Robert'],[],text)
  const british=buildVoicePlan('dialogue','en','british',['Amy','Robert'],[],text)
  assert.equal(american.speechText,text)
  assert.equal(british.speechText,text)
  assert.match(american.instruction,/General American/)
  assert.match(british.instruction,/British English.*non-rhotic/s)
  assert.notEqual(await contentHash(text,'en','american','dialogue'),await contentHash(text,'en','british','dialogue'))
  assert.match(buildVoicePlan('passage','zh-cn','american',[],[],'中国').instruction,/Putonghua/)
  assert.match(buildVoicePlan('passage','zh-tw','taiwanese',[],[],'臺灣').instruction,/unmistakably Taiwanese/)
})

test('English source vocabulary and exact tokenisation stay separate from CEFR stretch', () => {
  assert.equal(englishWord('ability')[1],1)
  assert.equal(englishWord('zoom')[1],6)
  assert.equal(englishWord('agreement')[1],1)
  assert.equal(englishWord('neither')[1],2)
  const text="Students’ well-known ideas aren't lost.\nTry again!"
  assert.equal(englishWords(text).map(word=>word.text).join(''),text)
  assert.ok(englishWords(text).every(word=>word.pinyin===''))
  assert.ok(englishNewWords('We zoom past the school.','en108','j').some(word=>word.word==='zoom'&&word.level===6))
  assert.ok(!englishNewWords('We are in the school.','cefr','A2').some(word=>['We','are','in','the'].includes(word.word)))
  assert.ok(englishReadingTargets('en108','h-advanced',0).max > englishReadingTargets('en108','h',0).max)
  assert.ok(englishReadingTargets('cefr','A2',2).max > englishReadingTargets('cefr','A2',0).max)
  assert.ok(englishReadingTargets('cefr','A2',2).max < englishReadingTargets('cefr','B1',0).max)
})

test('English assessments and explanatory translations retain English learning evidence', () => {
  const prompt=feedbackSystemPrompt('Write Traditional Chinese feedback.',{teaching_language:'en',guidance_language:'en',level_framework:'cefr',level_code:'A2'})
  assert.doesNotMatch(prompt,/Write Traditional Chinese/)
  assert.match(prompt,/English language class/)
  assert.match(prompt,/American and British English/)
  assert.match(feedbackSystemPrompt('Write Traditional Chinese feedback.',{teaching_language:'en',guidance_language:'zh-TW'}),/Traditional Chinese/)
  const source={text:'Use because to give a reason. Example: because they care about their future.',english:true,references:['because','because they care about their future']}
  const protectedText=protectLearningReferences(source)
  assert.doesNotMatch(protectedText.text,/because/)
  assert.equal(protectedText.restore(protectedText.text),source.text)
  assert.throws(()=>protectedText.restore(protectedText.text.replace('⟦EN_0⟧','bởi vì')),/English teaching reference/)
  const boundary=protectLearningReferences({text:'The theme is art.',english:true,references:['he','art']})
  assert.match(boundary.text,/The theme/)
})

test('English reading UI never offers Pinyin or marks word fragments', () => {
  const require=createRequire(import.meta.url)
  const source=readFileSync(new URL('../src/components/ReadingPassageView.tsx',import.meta.url),'utf8')
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText
  const exports={}
  new Function('require','exports',compiled)(name=>{
    if(name==='../lib/englishText') return {englishTextRuns}
    if(name==='../lib/uiText') return {uiText:text=>text}
    if(name==='@phosphor-icons/react') return {BookOpen:()=>null,Translate:()=>null,X:()=>null}
    if(name==='../lib/readingFont') return {useReadingFont:()=>null}
    if(name==='../lib/useReadingTranslation') return {useReadingTranslation:passage=>({passage})}
    if(name==='../lib/participantI18n') return {participantText:(_locale,key)=>key,contentLocaleKey:locale=>locale}
    return require(name)
  },exports)
  const body='The theme is art. He likes the theatre.'
  const html=renderToStaticMarkup(createElement(exports.ReadingPassageView,{
    passage:{title:'Art',body,words:englishWords(body),vocabulary:[{word:'he',level:1,gloss:{en:'A person.'}},{word:'art',level:1,gloss:{en:'Creative work.'}}],grammar:[]},locale:'vi',
  }))
  assert.doesNotMatch(html,/readingPinyin|readingZhuyin|<rt>/)
  assert.equal((html.match(/class="reading-mark is-word/g)||[]).length,1)
  assert.match(html,/theme/)
})

test('English class creation requires a valid level and defaults captions to English', async () => {
  registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('npm:@supabase/supabase-js@')?'@supabase/supabase-js':specifier,context)}})
  const savedFetch=globalThis.fetch,savedDeno=globalThis.Deno
  let handler,stored,insertions=0
  globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-placeholder'})[key]},serve:callback=>{handler=callback}}
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('/rest/v1/sessions')) {
      stored=JSON.parse(options.body);insertions++
      return new Response(JSON.stringify({id:crypto.randomUUID(),code:'QA1234'}),{status:201,headers:{'Content-Type':'application/json'}})
    }
    return new Response(null,{status:201})
  }
  const send=body=>handler(new Request('https://example.supabase.co/functions/v1/create-session',{
    method:'POST',headers:{'Content-Type':'application/json','x-lingoact-client':'desktop-app'},body:JSON.stringify({appProfile:'english',teachingLanguage:'en',guidanceLanguage:'en',readingAnnotation:'pinyin',...body}),
  }))
  try {
    await import('../supabase/functions/create-session/index.ts')
    assert.equal((await send({levelFramework:'cefr'})).status,400)
    assert.equal(insertions,0)
    for(const [levelFramework,levelCode] of [['en108','j7'],['en108','h2-advanced'],['en108','v-advanced'],['cefr','Pre-A1'],['gept','high-intermediate'],['toeic','sw-b2']]) {
      const response=await send({levelFramework,levelCode})
      assert.equal(response.status,200,await response.clone().text())
      assert.equal(stored.teaching_language,'en');assert.equal(stored.guidance_language,'en')
      assert.equal(stored.level_framework,levelFramework);assert.equal(stored.level_code,levelCode)
      assert.equal(stored.reading_annotation,'none');assert.equal(stored.caption_source_language,'en')
    }
  } finally {globalThis.fetch=savedFetch;globalThis.Deno=savedDeno}
})

test('English passage and grammar explanation follow the real AI request path without Chinese annotation', async () => {
  const originalFetch=globalThis.fetch, originalDeno=globalThis.Deno
  const requests=[]
  globalThis.Deno={env:{get:()=> 'test-key'}}
  const body='Students recycle bottles at school. They protect the environment because they care about their future.'
  globalThis.fetch=async (_url,options)=> {
    const request=JSON.parse(options.body); requests.push(request)
    const payload=JSON.parse(request.contents[0].parts[0].text)
    const result=payload.words ? {words:payload.words.map(word=>({word,pos:'noun',gloss:{en:'Meaning in this passage.',zh_tw:'文章中的意思。'}}))}
      : payload.points ? {notes:payload.points.map(point=>({point:point.point,note:{en:'Use because to give a reason.',zh_tw:'用 because 說明原因。'}}))}
        : {title:'Recycling at School',body,words:[],grammar:[{point:'cause and result',span:'because they care about their future'},{point:'把字句',span:'Students'},{point:'passive voice',span:'not in the passage'}]}
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}),{status:200})
  }
  try {
    const passage=await generateReadingPassage({source:body,direction:'i+1',teachingLanguage:'en',levelFramework:'en108',levelCode:'j',levelStretch:1,accent:'british',locales:['en','zh_tw']})
    assert.equal(passage.body,body)
    assert.equal(passage.words.map(word=>word.text).join(''),body)
    assert.ok(passage.words.every(word=>word.pinyin===''))
    assert.deepEqual(passage.grammar.map(point=>point.point),['English: cause and result'])
    assert.match(requests[0].systemInstruction.parts[0].text,/English words.*i\+1/s)
    assert.doesNotMatch(requests[0].systemInstruction.parts[0].text,/Length:.*characters|每個詞的 pinyin/)
    const notes=await writeMissingGrammarNotes(passage.grammar,['en','zh_tw'])
    assert.match(notes['English: cause and result'].en,/because/)
    assert.match(requests.at(-1).systemInstruction.parts[0].text,/You explain English grammar/)
  } finally {globalThis.fetch=originalFetch; globalThis.Deno=originalDeno}
})

test('English short-answer grading carries class policy through the actual grader and saves English feedback', async () => {
  const originalFetch=globalThis.fetch, originalDeno=globalThis.Deno
  let gradingPrompt='', savedItem, savedAttempt
  globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-placeholder',GEMINI_API_KEY:'test-key'})[key]}}
  globalThis.fetch=async(url,options)=>{
    if(!String(url).includes('example.supabase.co')) {
      const request=JSON.parse(options.body); gradingPrompt=request.systemInstruction.parts[0].text
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({evaluations:[{item_id:'item',score:80,feedback_zh_tw:'You gave a clear reason.',feedback_en:'You gave a clear reason.'}],overall_feedback_zh_tw:'Keep practising.',overall_feedback_en:'Keep practising.'})}]}}]}),{status:200})
    }
    const table=new URL(url).pathname.split('/').at(-1)
    const rows={
      quiz_attempts:{id:'attempt',quiz_id:'quiz',question_id:'question',participant_id:'learner'},
      quizzes:{graded:true,requested_type:'short_answer',session_id:'class',direction:''},
      sessions:{teaching_language:'en',guidance_language:'en',level_framework:'cefr',level_code:'A2'},
      quiz_items:[{id:'item',type:'short_answer',prompt_text:'Why do you like this picture?',points:100}],
      quiz_item_answers:[{id:'answer',item_id:'item',answer_text:'I like the colours.'}],
      quiz_item_keys:[{item_id:'item',accepted_answers:['A personal reason.'],rubric:'Give a relevant reason.'}],
    }
    if(options.method==='PATCH') {
      if(table==='quiz_item_answers') savedItem=JSON.parse(options.body)
      if(table==='quiz_attempts') savedAttempt=JSON.parse(options.body)
      return new Response(null,{status:204})
    }
    return new Response(JSON.stringify(rows[table]||[]),{status:200,headers:{'Content-Type':'application/json'}})
  }
  try {
    const {gradeCustomQuizAttempt}=await import('../supabase/functions/_shared/custom-quiz.ts')
    await gradeCustomQuizAttempt('attempt')
    assert.match(gradingPrompt,/English language class/)
    assert.match(gradingPrompt,/CEFR A2/)
    assert.doesNotMatch(gradingPrompt,/Feedback must use Taiwan Traditional Chinese/)
    assert.equal(savedItem.feedback.zh_tw,savedItem.feedback.en)
    assert.equal(savedItem.score,80)
    assert.equal(savedAttempt.status,'graded')
    assert.equal(savedAttempt.feedback.en,'Keep practising.')
  } finally {globalThis.fetch=originalFetch;globalThis.Deno=originalDeno}
})
