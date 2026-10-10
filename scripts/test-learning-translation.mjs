import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { cachedLearningTranslation, protectChineseReferences, translateLearningTexts, translateQuizFeedback, translateFileFeedback, translateAudioFeedback } from '../supabase/functions/_shared/learning-translation.ts'
import { classChineseFont } from '../src/lib/classChineseFont.ts'
import { generatedLocales } from '../src/lib/participantLocales.generated.ts'

function memoryDb() {
  const rows = new Map()
  return { rows, from: () => {
    let mode = 'read', value, filters = {}, expiry
    const query = {
      select() { return this }, match(key) { Object.assign(filters, key); return this },
      eq(key, item) { filters[key] = item; return this }, lte(_key, item) { expiry = item; return this },
      insert(item) { mode = 'insert'; value = item; return this },
      update(item) { mode = 'update'; value = item; return this },
      maybeSingle() { return this.run() }, then(resolve, reject) { return this.run().then(resolve, reject) },
      async run() {
        const key = JSON.stringify(['session_id', 'source_hash', 'locale'].map(k => (value?.[k] ?? filters[k])))
        const existing = rows.get(key)
        if (mode === 'insert') {
          if (existing) return { data: null, error: { code: '23505' } }
          rows.set(key, { ...value }); return { data: { ...value } }
        }
        if (existing && Object.entries(filters).every(([k,v]) => existing[k] === v) && (!expiry || existing.lease_until <= expiry)) {
          if (mode === 'update') Object.assign(existing, value)
          return { data: { ...existing } }
        }
        return { data: null }
      },
    }
    return query
  } }
}

test('Chinese references survive unchanged; missing or duplicated references fail closed', () => {
  for (const source of ['Use 因為……所以 to give a reason. Example: 我喜歡中文。', 'Use 因为……所以. Correct answer: 星期三.']) {
    const protectedText = protectChineseReferences(source)
    assert.doesNotMatch(protectedText.text, /[\p{Script=Han}]/u)
    assert.equal(protectedText.restore(protectedText.text), source)
    assert.throws(() => protectedText.restore(protectedText.text.replace('⟦ZH_0⟧','')), /Chinese teaching reference/)
    assert.throws(() => protectedText.restore(protectedText.text + '⟦ZH_0⟧'), /Chinese teaching reference/)
  }
  const fallback = protectChineseReferences('请用“因为……所以”说明原因。', false)
  assert.equal(fallback.restore(fallback.text), '请用“因为……所以”说明原因。')
})

test('student Chinese font follows the teacher regardless of translation language', () => {
  for (const guidance_language of ['vi','th','ja','ko','id','en']) {
    assert.equal(classChineseFont({system_language:'zh-CN',guidance_language}),'sc')
    assert.equal(classChineseFont({system_language:'zh-TW',guidance_language,level_framework:'hsk'}),'tc')
  }
  assert.equal(classChineseFont({system_language:'en',level_framework:'hsk'}),'sc')
  assert.equal(classChineseFont({system_language:'en',level_framework:'tocfl'}),'tc')
})

test('on-demand batch translation caches, serializes concurrent claims and invalidates edited sources', async () => {
  const savedFetch = globalThis.fetch, savedDeno = globalThis.Deno
  globalThis.Deno = { env: { get: name => name === 'GEMINI_API_KEY' ? 'test-key' : undefined } }
  let calls = 0, prompts = []
  globalThis.fetch = async (_url, options) => {
    calls++
    const request = JSON.parse(options.body)
    prompts.push(request.systemInstruction.parts[0].text)
    const source = JSON.parse(request.contents[0].parts[0].text)
    const result = Object.fromEntries(Object.entries(source).map(([key,text]) => [key, 'Bản dịch: ' + text]))
    await new Promise(resolve => setTimeout(resolve, 10))
    return new Response(JSON.stringify({ candidates: [{content:{parts:[{text:JSON.stringify(result)}]}}] }), {status:200})
  }
  try {
    const db = memoryDb(), sources = {grammar:{text:'Use 因为……所以 to give a reason.',english:true}}
    assert.deepEqual(await cachedLearningTranslation(db,'class','en',sources),{values:{}})
    assert.deepEqual(await cachedLearningTranslation(db,'class','zh-CN',sources),{values:{}})
    assert.equal(calls,0); assert.equal(db.rows.size,0)
    const simultaneous = await Promise.all([cachedLearningTranslation(db,'class','vi',sources),cachedLearningTranslation(db,'class','vi',sources)])
    assert.equal(calls,1)
    assert.equal(simultaneous.filter(result=>result.status==='pending').length,1)
    assert.match((await cachedLearningTranslation(db,'class','vi',sources)).values.grammar,/因为……所以/)
    assert.equal(calls,1)
    await cachedLearningTranslation(db,'class','vi',{grammar:{...sources.grammar,text:'Use 因为……所以 to explain your answer.'}})
    assert.equal(calls,2); assert.equal(db.rows.size,2)
    for (const [locale,name] of [['th','Thai'],['ja','Japanese'],['ko','Korean'],['id','Indonesian'],['my','Burmese']]) {
      const translated = await translateLearningTexts(sources,locale)
      assert.match(translated.grammar,/因为……所以/)
      assert.match(prompts.at(-1),new RegExp(name))
    }
    const attempt = {id:'a',total_score:100,feedback:{en:'Correct! Your answer 星期三 is accurate.',zh_tw:'回答正确。'}}
    const answers = [{id:'b',score:20,answer_text:'星期三',feedback:{en:'The answer is 星期三.'}}]
    const quiz = await translateQuizFeedback(db,'class','vi',attempt,answers)
    assert.equal(quiz.attempt.total_score,100); assert.equal(quiz.answers[0].score,20)
    assert.equal(quiz.answers[0].answer_text,'星期三'); assert.match(quiz.answers[0].feedback.vi,/星期三/)
    assert.equal(attempt.feedback.vi,undefined)
    const englishAttempt = { id: 'english', total_score: 100, feedback: { en: 'Your answer is clear.', zh_tw: 'Your answer is clear.' } }
    const englishAnswer = { id: 'english-answer', answer_text: 'on Tuesday', answer_values: [], score: 20, feedback: { en: 'You used on Tuesday correctly.', zh_tw: 'You used on Tuesday correctly.' } }
    const beforeChinese = calls
    const chineseFeedback = await translateQuizFeedback(db, 'english-class', 'zh-TW', englishAttempt, [englishAnswer])
    assert.equal(calls, beforeChinese + 1)
    assert.match(prompts.at(-1), /Traditional Chinese as written in Taiwan/)
    assert.match(chineseFeedback.answers[0].feedback.zh_tw, /on Tuesday/)
    assert.equal(chineseFeedback.answers[0].answer_text, 'on Tuesday')
    assert.equal(chineseFeedback.attempt.feedback.en, englishAttempt.feedback.en)
    await translateQuizFeedback(db, 'english-class', 'zh-TW', englishAttempt, [englishAnswer])
    assert.equal(calls, beforeChinese + 1, 'Repeated guidance requests reuse the translation cache')
    await translateQuizFeedback(db, 'traditional-class', 'zh-TW', { id: 'traditional', feedback: { zh_tw: '回答正確。', en: 'Correct.' } }, [])
    assert.equal(calls, beforeChinese + 1, 'Traditional Chinese feedback needs no translation call')
    const file = {id:'f',analysis_status:'success',analysis_json:{score:80,summary_zh_tw:'写得很好。',summary_en:'You used 因为……所以 correctly.',strengths_zh_tw:['句型正确。'],strengths_en:['Correct sentence pattern.'],improvements_zh_tw:[],improvements_en:[]}}
    const files = await translateFileFeedback(db,'class','vi',[file])
    assert.equal(files.responses[0].analysis_json.score,80)
    assert.match(files.responses[0].analysis_json.translations.vi.summary,/因为……所以/)
    const englishFile = { id: 'english-file', analysis_status: 'success', analysis_json: { score: 80, summary_zh_tw: 'Your writing is clear.', summary_en: 'Your writing is clear.', strengths_zh_tw: ['Clear ideas.'], strengths_en: ['Clear ideas.'], improvements_zh_tw: [], improvements_en: [] } }
    const chineseFile = await translateFileFeedback(db, 'english-class', 'zh-TW', [englishFile])
    assert.ok(chineseFile.responses[0].analysis_json.translations.zh_tw.summary)
    assert.equal(chineseFile.responses[0].analysis_json.summary_en, 'Your writing is clear.')
    const audio = await translateAudioFeedback(db,'class','vi',{id:'oral',analysis_json:{score:90,transcript:'我喜欢中文。',summary:'表达清楚。',strengths:[],improvements:[],limitations:[],translations:{en:{summary:'Your sentence 我喜欢中文 is clear.'}}}})
    assert.equal(audio.analysis_json.transcript,'我喜欢中文。'); assert.equal(audio.analysis_json.score,90)
    assert.match(audio.analysis_json.translations.vi.summary,/我喜欢中文/)
    const englishAudio = { id: 'english-audio', analysis_json: { score: 90, transcript: 'I like English.', summary: 'Your speech is clear.', strengths: [], improvements: [], limitations: [], translations: { en: { summary: 'Your speech is clear.' } } } }
    const chineseAudio = await translateAudioFeedback(db, 'english-class', 'zh-TW', englishAudio)
    assert.ok(chineseAudio.analysis_json.translations.zh_tw.summary)
    assert.equal(chineseAudio.analysis_json.transcript, 'I like English.')
    // A failed request enters a short cooldown instead of spending on every poll.
    globalThis.fetch = async()=>{calls++;return new Response(JSON.stringify({candidates:[{content:{parts:[{text:'{"g":"lost the token"}'}]}}]}),{status:200})}
    const failureSource={g:{text:'Use 因為……所以.',english:true}}, before=calls
    assert.equal((await cachedLearningTranslation(db,'class','ko',failureSource)).status,'failed')
    assert.equal((await cachedLearningTranslation(db,'class','ko',failureSource)).status,'failed')
    assert.equal(calls,before+1)
  } finally { globalThis.fetch = savedFetch; globalThis.Deno = savedDeno }
})

test('Thai and Indonesian fixed UI translations contain every key and preserve interpolation', () => {
  const source = readFileSync(new URL('../src/lib/participantI18n.ts',import.meta.url),'utf8')
  const messages = new Function('return (' + source.split('const messages = ')[1].split(' as const')[0] + ')')()
  const keys = Object.keys(messages.en)
  assert.ok(keys.length >= 300)
  for (const locale of ['th','id']) for (const key of keys) {
    assert.ok(generatedLocales[locale][key],`${locale}: ${key}`)
    assert.deepEqual((generatedLocales[locale][key].match(/\{\w+\}/g)||[]).sort(), (messages.en[key].match(/\{\w+\}/g)||[]).sort())
  }
})
