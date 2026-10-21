import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import { inflateSync } from 'node:zlib'
import ts from 'typescript'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { japanesePresenter, japaneseParticipant, japaneseLiterals } from '../src/lib/japaneseLocales.ts'
import { KANA_LEVELS, JF_LEVELS, settleJapaneseWords, japaneseReadingTarget } from '../supabase/functions/_shared/japanese.ts'
import { FRAMEWORKS, levelInstruction, dispatchLevelCode } from '../supabase/functions/_shared/proficiency.ts'
import { resolveFramework, trackInstruction } from '../supabase/functions/_shared/teaching.ts'
import { generateReadingPassage } from '../supabase/functions/_shared/reading.ts'
import { feedbackSystemPrompt } from '../supabase/functions/_shared/feedback-language.ts'
import { speechAccent } from '../supabase/functions/_shared/speech-accent.ts'
import { buildVoicePlan } from '../supabase/functions/_shared/listening.ts'
import { karaokeCues, needsKaraokeAlignment } from '../supabase/functions/_shared/listening.ts'
import { quizGenerationFailed } from '../supabase/functions/_shared/quiz-state.ts'
import { protectLearningReferences } from '../supabase/functions/_shared/learning-translation.ts'

const root = new URL('../', import.meta.url)
const read = file => readFileSync(new URL(file, root), 'utf8')
function table(file, name) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true)
  let result
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      const value = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer
      result = new Function(`return ${value.getText(source)}`)()
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return result
}
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort()

test('Japanese catalogues cover every teacher, student and shared key with matching placeholders', () => {
  for (const [file, translated] of [['src/lib/presenterI18n.ts', japanesePresenter], ['src/lib/participantI18n.ts', japaneseParticipant]]) {
    const source = table(file, 'messages')['zh-TW']
    assert.deepEqual(Object.keys(translated).sort(), Object.keys(source).sort())
    for (const [key, value] of Object.entries(source)) {
      assert.ok(translated[key]?.trim(), key)
      assert.deepEqual(placeholders(translated[key]), placeholders(value), key)
    }
  }
  for (const key of Object.keys(table('src/lib/uiLocales.generated.ts', 'uiLocales'))) {
    assert.ok(japaneseLiterals[key], key)
    assert.deepEqual(placeholders(key), placeholders(japaneseLiterals[key]), key)
  }
  const missing = new Set()
  for (const dir of ['src/components', 'src/routes', 'src']) for (const file of readdirSync(new URL(dir, root)).filter(name => name.endsWith('.tsx'))) {
    const source = ts.createSourceFile(file, read(`${dir}/${file}`), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    function visit(node) {
      if (ts.isCallExpression(node) && ['uiText', 'uiFormat'].includes(node.expression.getText(source))) {
        const text = node.arguments[0]
        if (text && ts.isStringLiteral(text) && /\p{Script=Han}/u.test(text.text) && !japaneseLiterals[text.text]) missing.add(text.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual([...missing], [], 'UI copy must never silently fall back to Chinese')
})

test('Japanese modes use their own ranges and keep dispatch overrides local', () => {
  for (const [id, levels] of [['kana', KANA_LEVELS], ['jf', JF_LEVELS], ['jlpt', FRAMEWORKS.jlpt.levels]]) {
    assert.equal(resolveFramework('ja', id), id)
    for (const level of levels) {
      const instruction = levelInstruction(id, level.code)
      assert.match(instruction, /Japanese/)
      assert.match(instruction, /editorial/i)
      assert.doesNotMatch(instruction, /About [\d,]+ words/)
    }
  }
  assert.equal(resolveFramework('ja', 'en108'), 'jf')
  assert.equal(dispatchLevelCode('jlpt', 'N5', 'JLPT N3で出題してください'), 'N3')
  assert.equal(dispatchLevelCode('jlpt', 'N5', 'N3には変更しない'), 'N5')
  assert.equal(dispatchLevelCode('jf', 'A1', 'JF A2にして'), 'A2')
  assert.match(japaneseReadingTarget('jlpt', 'N5', 2).instruction, /never advance/)
  assert.match(trackInstruction('ja'), /です\/ます/)
  const exports = {}
  const compiled = ts.transpileModule(read('src/lib/brand.ts'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText
  new Function('require','exports',compiled)(()=>({APP_PROFILE:{id:'full'}}),exports)
  assert.equal(exports.brandFromSearch(new URLSearchParams('b=japanese')), 'japanese')
  assert.equal(exports.brandFromSearch(new URLSearchParams()), null)
})

test('Furigana preserves contextual whole-word readings and rejects altered or misaligned text', () => {
  const text = '今日、本を借りました。\n学校へ行きます。'
  const words = [{text:'今日',pinyin:'きょう'},{text:'、',pinyin:''},{text:'本',pinyin:'ほん'},{text:'を',pinyin:''},{text:'借りました',pinyin:'かりました'},{text:'。\n',pinyin:''},{text:'学校',pinyin:'がっこう'},{text:'へ',pinyin:''},{text:'行きます',pinyin:'いきます'},{text:'。',pinyin:''}]
  assert.deepEqual(settleJapaneseWords(words, text), words)
  assert.deepEqual(settleJapaneseWords(words, text.replace('今日', '明日')), [])
  assert.deepEqual(settleJapaneseWords([{text:'今日',pinyin:'jīntiān'}], '今日'), [])
  assert.deepEqual(settleJapaneseWords([{text:'かな',pinyin:'かな'}], 'かな'), [])
  assert.deepEqual(settleJapaneseWords([null], '今日'), [])
})

test('Japanese assessment uses selected guidance and speech keeps Japanese mora timing', () => {
  const prompt = feedbackSystemPrompt('Write Traditional Chinese feedback.', {teaching_language:'ja',guidance_language:'ja'})
  assert.doesNotMatch(prompt, /Write Traditional Chinese/)
  assert.match(prompt, /clear Japanese/)
  assert.match(prompt, /pitch-accent/)
  assert.match(feedbackSystemPrompt('Write Traditional Chinese feedback.', {teaching_language:'ja',guidance_language:'zh-TW'}), /Traditional Chinese/)
  assert.equal(speechAccent('ja', 'putonghua'), 'japanese')
  const plan = buildVoicePlan('passage','ja','japanese',[],[],'学校へ行きます。')
  assert.match(plan.instruction, /mora/)
  assert.equal(plan.speechText, '学校へ行きます。')
  const source = 'Use 借りました to describe a past action. Its dictionary form is 借りる.'
  const protectedText = protectLearningReferences({text:source,english:true})
  assert.doesNotMatch(protectedText.text, /借りました|借りる/)
  assert.equal(protectedText.restore(protectedText.text), source)
  assert.equal(quizGenerationFailed('問題を生成できませんでした。もう一度配信してください。'), true)
})

test('Japanese reading generates Japanese-specific annotations without Chinese vocabulary grading', async () => {
  const oldFetch = globalThis.fetch, oldDeno = globalThis.Deno
  const instructions = []
  const body = '今日、本を借りました。'
  const words = [{text:'今日',pinyin:'きょう'},{text:'、',pinyin:''},{text:'本',pinyin:'ほん'},{text:'を',pinyin:''},{text:'借りました',pinyin:'かりました'},{text:'。',pinyin:''}]
  globalThis.Deno = {env:{get: key => key === 'GEMINI_API_KEY' ? 'offline-test-key' : undefined}}
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    const instruction = request.systemInstruction.parts.map(part => part.text).join('\n')
    instructions.push(instruction)
    const output = instructions.length === 1 ? {title:'図書館で',body,words,grammar:[{point:'過去・否定',span:'借りました'},{point:'Chinese grammar',span:'本'}],vocabulary:[{word:'借りました',reading:'かりました',lemma:'借りる',form:'ます形・過去'},{word:'存在しない語',reading:'ご',lemma:'語',form:''}]}
      : {words:[{word:'借りました',pos:'動詞',gloss:{ja:'本などを、あとで返す約束で受け取ったこと。',zh_tw:'借了，之後要歸還。'}}]}
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}]}),{status:200})
  }
  try {
    const passage = await generateReadingPassage({source:body,direction:'図書館での経験',teachingLanguage:'ja',levelFramework:'jf',levelCode:'A2',levelStretch:1,accent:'japanese',locales:['ja','zh_tw']})
    assert.equal(passage.body, body)
    assert.deepEqual(passage.words, words)
    assert.equal(passage.vocabulary.length, 1)
    assert.equal(passage.vocabulary[0].lemma, '借りる')
    assert.equal(passage.vocabulary[0].form, 'ます形・過去')
    assert.deepEqual(passage.grammar.map(entry=>entry.point), ['Japanese: 過去・否定'])
    assert.match(instructions[0], /HIRAGANA/)
    assert.doesNotMatch(instructions[0], /漢語拼音正詞法|Official HSK grammar|TBCL 第/)
  } finally { globalThis.fetch = oldFetch; globalThis.Deno = oldDeno }
})

test('Japanese profile, language selector and setup render in Japanese and existing Chinese', async () => {
  const previousWindow = globalThis.window, previousStorage = globalThis.localStorage
  const storage = new Map()
  globalThis.localStorage = {getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}
  globalThis.window = {location:{hash:'#/presenter/new',search:''},localStorage:globalThis.localStorage,addEventListener(){},removeEventListener(){},dispatchEvent(){}}
  const server = await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',define:{'import.meta.env.VITE_APP_PROFILE':JSON.stringify('japanese')}})
  try {
    const {APP_PROFILE} = await server.ssrLoadModule('/src/lib/appProfiles.ts')
    const {PresenterLocaleContext} = await server.ssrLoadModule('/src/lib/presenterI18n.ts')
    const {setUiLanguage} = await server.ssrLoadModule('/src/lib/uiText.ts')
    const {JapaneseInterfaceSelector} = await server.ssrLoadModule('/src/components/JapaneseInterfaceSelector.tsx')
    const {LanguagePairFields} = await server.ssrLoadModule('/src/components/LanguagePairFields.tsx')
    const {LessonPlan} = await server.ssrLoadModule('/src/components/LessonPlan.tsx')
    const {StudentSocialLinks} = await server.ssrLoadModule('/src/components/StudentSocialLinks.tsx')
    const {KaraokeText} = await server.ssrLoadModule('/src/components/ListeningPlayer.tsx')
    const {japaneseInterfaceLanguage,setJapaneseInterfaceLanguage} = await server.ssrLoadModule('/src/lib/japaneseInterface.ts')
    const {guidanceLocalesForBrand} = await server.ssrLoadModule('/src/lib/brand.ts')
    assert.equal(APP_PROFILE.id, 'japanese')
    assert.deepEqual(APP_PROFILE.allowedTracks, ['ja'])
    assert.equal(APP_PROFILE.productName, 'LingoAct-JP')
    for (const activeCue of [0,1]) {
      const markup=renderToStaticMarkup(React.createElement(KaraokeText,{language:'ja',text:'人気の寿司屋',fontFamily:null,ruby:[],words:null,activeCue,cues:[{start_index:0,end_index:1,start_ms:0,end_ms:200},{start_index:1,end_index:2,start_ms:200,end_ms:400}]}))
      assert.equal((markup.match(/karaoke-character active/g)||[]).length,1)
      assert.ok(markup.includes(`karaoke-character active">${[...'人気'][activeCue]}</span>`))
    }
    assert.equal(japaneseInterfaceLanguage(), 'ja')
    const props = {teachingTrack:'ja',guidanceLanguage:'ja',levelFramework:'jf',levelCode:'A1',readingAnnotation:'furigana',onTrackChange(){},onGuidanceChange(){},onFrameworkChange(){},onLevelChange(){},onAnnotationChange(){}}
    const render = locale => {setUiLanguage(locale);return renderToStaticMarkup(React.createElement(PresenterLocaleContext.Provider,{value:locale},React.createElement(LanguagePairFields,props)))}
    const ja = render('ja')
    assert.match(ja, /ふりがな/); assert.match(ja, /かな入門/); assert.match(ja, /日本語/); assert.match(ja, /中文/)
    assert.doesNotMatch(ja, /注音|拼音|繁體|HSK|English/)
    const plan = renderToStaticMarkup(React.createElement(PresenterLocaleContext.Provider,{value:'ja'},React.createElement(LessonPlan,{courseName:'初級日本語',teachingLanguage:'ja'})))
    assert.match(plan, /授業プラン/); assert.match(plan, /標準的な日本語/)
    assert.doesNotMatch(plan, /Mandarin|Add an activity|Lesson plan|普通話|台湾アクセント/)
    const social = renderToStaticMarkup(React.createElement(StudentSocialLinks))
    assert.match(social, /https:\/\/www.welearnjapanese.com\//)
    assert.match(social, /<img[^>]+jp-logo/)
    assert.doesNotMatch(social, /facebook.com|youtube.com/)
    assert.match(render('zh-TW'), /振假名/)
    setJapaneseInterfaceLanguage('zh-TW')
    assert.equal(japaneseInterfaceLanguage(),'zh-TW')
    assert.match(renderToStaticMarkup(React.createElement(JapaneseInterfaceSelector)), /介面語言/)
    assert.deepEqual(guidanceLocalesForBrand([{code:'en',label:'English'},{code:'zh-TW',label:'繁體中文'},{code:'ja',label:'日本語'}],'japanese'),[{code:'ja',label:'日本語'},{code:'zh-TW',label:'中文'},{code:'en',label:'English'}])
    const require = createRequire(import.meta.url), previousProfile = process.env.APP_PROFILE
    try {
      process.env.APP_PROFILE = 'japanese'
      delete require.cache[require.resolve('../electron-builder.cjs')]
      const config = require('../electron-builder.cjs')
      assert.equal(config.productName, 'LingoAct-JP')
      assert.equal(config.win.icon, 'build/LingoAct-JP.ico')
      assert.equal(config.mac.icon, 'build/LingoAct-JP.png')
    } finally {if (previousProfile === undefined) delete process.env.APP_PROFILE;else process.env.APP_PROFILE=previousProfile}
  } finally {await server.close();globalThis.window=previousWindow;globalThis.localStorage=previousStorage}
})

test('shared student build shows Japanese branding and only ja/zh-TW/en, including legacy links', async () => {
  const oldWindow=globalThis.window
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom',define:{'import.meta.env.VITE_APP_PROFILE':JSON.stringify('full')}})
  try{
    const {participantBrand,guidanceLocalesForBrand}=await server.ssrLoadModule('/src/lib/brand.ts')
    const {GUIDANCE_LOCALES}=await server.ssrLoadModule('/src/lib/participantI18n.ts')
    const {StudentSocialLinks}=await server.ssrLoadModule('/src/components/StudentSocialLinks.tsx')
    for(const search of ['','b=japanese']){
      globalThis.window={location:{hash:`#/participant/example${search?'?'+search:''}`,search:''}}
      const brand=participantBrand(new URLSearchParams(search),'ja')
      assert.equal(brand,'japanese')
      assert.deepEqual(guidanceLocalesForBrand(GUIDANCE_LOCALES,brand).map(o=>[o.code,o.label]),[['ja','日本語'],['zh-TW','中文'],['en','English']])
      const html=renderToStaticMarkup(React.createElement(StudentSocialLinks,{teachingLanguage:'ja'}))
      assert.match(html,/href="https:\/\/www.welearnjapanese.com\/"/)
      assert.equal((html.match(/<a /g)||[]).length,1)
      assert.doesNotMatch(html,/facebook.com|youtube.com/)
    }
    assert.equal(participantBrand(new URLSearchParams('b=ncacls'),'ja'),'ncacls')
    assert.equal(participantBrand(new URLSearchParams(),'huayu'),null)
  }finally{await server.close();globalThis.window=oldWindow}
})

test('real class-creation handler stores Japanese modes, guidance, captions and furigana', async () => {
  registerHooks({resolve(specifier,context,next){return next(specifier.startsWith('npm:@supabase/supabase-js@')?'@supabase/supabase-js':specifier,context)}})
  const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno
  let handler,stored,inserts=0
  globalThis.Deno={env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'offline-placeholder'})[key]},serve:callback=>{handler=callback}}
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('/rest/v1/sessions')) {
      stored=JSON.parse(options.body);inserts++
      return new Response(JSON.stringify({id:crypto.randomUUID(),code:'JPN123'}),{status:201,headers:{'Content-Type':'application/json'}})
    }
    return new Response(null,{status:201})
  }
  const send=body=>handler(new Request('https://example.supabase.co/functions/v1/create-session',{
    method:'POST',headers:{'Content-Type':'application/json','x-lingoact-client':'desktop-app'},body:JSON.stringify({appProfile:'japanese',teachingLanguage:'en',readingAnnotation:'furigana',...body}),
  }))
  try {
    await import('../supabase/functions/create-session/index.ts')
    assert.equal((await send({levelFramework:'jf'})).status,400)
    assert.equal(inserts,0)
    for(const [levelFramework,levelCode] of [['kana','hiragana'],['jf','A1'],['jlpt','N3']]) {
      const response=await send({levelFramework,levelCode})
      assert.equal(response.status,200,await response.clone().text())
      assert.equal(stored.teaching_language,'ja');assert.equal(stored.guidance_language,'ja')
      assert.equal(stored.level_framework,levelFramework);assert.equal(stored.level_code,levelCode)
      assert.equal(stored.reading_annotation,'furigana');assert.equal(stored.caption_source_language,'ja')
    }
    await send({levelFramework:'jf',levelCode:'A2',guidanceLanguage:'zh-TW',readingAnnotation:'none'})
    assert.equal(stored.guidance_language,'zh-TW');assert.equal(stored.teaching_language,'ja');assert.equal(stored.reading_annotation,'none')
  } finally {globalThis.fetch=oldFetch;globalThis.Deno=oldDeno}
})

test('Japanese karaoke retains real word anchors and advances character by character across paragraphs', async () => {
  const oldFetch=globalThis.fetch,oldDeno=globalThis.Deno
  const transcript='先週、人気の寿司屋へ行きました。\nまた行きたいです。'
  const anchors=[['先週',400,1300],['人気',1600,2200],['寿司屋',2500,3400],['行きました',3700,4800],['また',5400,5800],['行きたい',6000,6700],['です',6800,7200]]
  globalThis.Deno={env:{get:()=> 'offline-test'}}
  globalThis.fetch=async()=>Response.json({steps:[{content:[{annotations:anchors.map(([text,start,end])=>({type:'word_info',text,start_offset:`${start/1000}s`,end_offset:`${end/1000}s`}))}]}]})
  try{
    const cues=await karaokeCues(new Uint8Array(),transcript,'ja',7600)
    assert.equal(cues.length,[...transcript].filter(c=>/[\p{L}\p{N}]/u.test(c)).length)
    assert.ok(cues.every(c=>c.end_index-c.start_index===1&&c.end_ms>c.start_ms))
    for(const [word,start,end] of anchors){
      const from=transcript.indexOf(word), to=from+word.length
      assert.equal(cues.find(c=>c.start_index===from).start_ms,start,word)
      assert.equal(cues.find(c=>c.end_index===to).end_ms,end,word)
    }
    assert.equal(needsKaraokeAlignment(cues,'ja'),false)
    assert.equal(needsKaraokeAlignment([{start_index:3,end_index:24,start_ms:1300,end_ms:4697}],'ja'),true)
    assert.equal(needsKaraokeAlignment([{start_index:0,end_index:7,start_ms:0,end_ms:1000}],'en'),false)
    globalThis.Deno={env:{get:()=>undefined}}
    const fallback=await karaokeCues(new Uint8Array(),transcript,'ja',7600)
    assert.ok(fallback.every(c=>c.end_index-c.start_index===1))
  }finally{globalThis.fetch=oldFetch;globalThis.Deno=oldDeno}
})

test('JP icon contains complete PNG frames for every Windows icon size', () => {
  const ico = readFileSync(new URL('../build/LingoAct-JP.ico', import.meta.url))
  assert.equal(ico.readUInt16LE(2), 1)
  assert.equal(ico.readUInt16LE(4), 7)
  const sizes = []
  for (let i=0;i<7;i++) {
    const at = 6+i*16, size = ico[at] || 256, length = ico.readUInt32LE(at+8), offset = ico.readUInt32LE(at+12)
    assert.ok(offset+length <= ico.length)
    assert.equal(ico.subarray(offset,offset+8).toString('hex'),'89504e470d0a1a0a')
    assert.equal(ico.readUInt32BE(offset+16),size)
    assert.equal(ico.readUInt32BE(offset+20),size)
    assert.equal(ico[offset+25],6,'icon frame must carry RGBA transparency')
    const compressed=[]
    for(let chunk=offset+8;chunk<offset+length;){
      const bytes=ico.readUInt32BE(chunk)
      if(ico.toString('ascii',chunk+4,chunk+8)==='IDAT') compressed.push(ico.subarray(chunk+8,chunk+8+bytes))
      chunk+=bytes+12
    }
    // The first pixel has no left or previous neighbour under any PNG filter.
    assert.equal(inflateSync(Buffer.concat(compressed))[4],0,'outer corner must be transparent')
    sizes.push(size)
  }
  assert.deepEqual(sizes,[16,24,32,48,64,128,256])
})
