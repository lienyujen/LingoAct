import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
const require = createRequire(import.meta.url)
function load(file, dependencies = {}, profile = 'ncacls') {
 const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8').replaceAll('import.meta.env.VITE_APP_PROFILE', JSON.stringify(profile))
 const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
 const exports = {}
 new Function('require','exports',compiled)(name => dependencies[name] || require(name), exports)
 return exports
}
test('NCACLS keeps Traditional teaching with every requested student guidance language', () => {
 const config = load('src/lib/appProfiles.ts')
 const brand = load('src/lib/brand.ts', {'./appProfiles': config})
 const generated = load('src/lib/participantLocales.generated.ts')
 const catalog = load('src/lib/participantI18n.ts', {'./japaneseLocales':{japaneseParticipant:{}},'./participantLocales.generated':generated,'./scLocales.generated':{scParticipantMessages:{}}})
 assert.equal(config.APP_PROFILE.defaultTrack, 'huayu')
 assert.equal(config.profileAllowsTrack('putonghua'), false)
 assert.deepEqual(brand.guidanceLocalesForBrand(catalog.GUIDANCE_LOCALES, brand.brandFromSearch(new URLSearchParams('b=ncacls'))).map(item => item.code), ['zh-TW','en','es','vi','th','id','ja','ko','my'])
 for (const [key, translation] of Object.entries(generated.generatedLocales.my)) {
  const english = catalog.participantText('en',key)
  const placeholders = value => [...value.matchAll(/\{\w+\}/g)].map(match=>match[0]).sort()
  assert.equal(typeof translation,'string')
  assert.ok(translation.length > 0)
  assert.deepEqual(placeholders(translation),placeholders(english),key)
 }
 assert.equal(Object.keys(generated.generatedLocales.my).length,312)
 assert.match(catalog.participantText('my','language'), /[\u1000-\u109f]/)
 const font = load('src/lib/classChineseFont.ts')
 assert.equal(font.classChineseFont({system_language:'zh-TW',guidance_language:'my'}),'tc')
})
