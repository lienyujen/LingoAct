import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { frameworkById } from '../src/lib/proficiency.ts'
import { SCHOOL_STAGES, SCHOOL_GRADES, schoolStage, schoolDifficulty, schoolLevelCode } from '../src/lib/schoolLevels.ts'
import { uiLocales } from '../src/lib/uiLocales.generated.ts'
import { englishTeachingLabels } from '../src/lib/englishUi.ts'
import { FRAMEWORKS, dispatchLevelCode, levelInstruction } from '../supabase/functions/_shared/proficiency.ts'
import { englishReadingTargets, englishNewWords } from '../supabase/functions/_shared/english.ts'

test('school years and difficulty agree across UI/backend, with legacy stages retained', () => {
  assert.deepEqual(frameworkById('en108').levels.map(level => level.code).sort(), FRAMEWORKS.en108.levels.map(level => level.code).sort())
  for (const [stage, grades] of Object.entries(SCHOOL_GRADES)) for (const grade of grades) {
    for (const difficulty of ['standard', 'foundation', 'advanced']) {
      const code = schoolLevelCode(grade.code, difficulty)
      assert.equal(schoolStage(code), stage)
      assert.equal(schoolDifficulty(code), difficulty)
      const policy = levelInstruction('en108', code)
      assert.match(policy, /editorial pacing suggestions/)
      assert.ok(policy.includes(`Grade ${grade.code.startsWith('j') ? grade.code.slice(1) : Number(grade.code.slice(1)) + 9}`))
      const label = frameworkById('en108').levels.find(level => level.code === code).label
      assert.ok(englishTeachingLabels[label], `Missing English display label: ${label}`)
    }
  }
  for (const code of ['j', 'h', 'j-foundation', 'h-advanced']) assert.ok(FRAMEWORKS.en108.levels.some(level => level.code === code))
})

test('grade overrides select the specific year rather than the general school stage', () => {
  for (const [direction, code] of [['改成國中八年級','j8'],['改成高中二年級','h2'],['Use Grade 9','j9'],['Switch to Grade 10','h1'],['Use Senior high Year 3','h3'],['改成高二進階','h2-advanced'],['Use Grade 8 foundation','j8-foundation']]) assert.equal(dispatchLevelCode('en108', 'j7', direction), code)
  assert.equal(dispatchLevelCode('en108', 'j7', 'Do not use Grade 9'), 'j7')
  assert.equal(dispatchLevelCode('en108', 'j7', 'i+2'), 'j7')
})

test('reading targets progress by year; junior-high grades retain junior-high lexical references', () => {
  for (const codes of [['j7','j8','j9'],['h1','h2','h3']]) {
    const maxima = codes.map(code => englishReadingTargets('en108', code, 0).max)
    assert.ok(maxima[0] < maxima[1] && maxima[1] < maxima[2])
    for (const code of codes) {
      assert.ok(englishReadingTargets('en108', `${code}-foundation`, 0).max < englishReadingTargets('en108', code, 0).max)
      assert.ok(englishReadingTargets('en108', code, 2).max > englishReadingTargets('en108', code, 0).max)
    }
  }
  for (const code of ['j7','j8','j9']) assert.deepEqual(englishNewWords('We zoom past the school.', 'en108', code), englishNewWords('We zoom past the school.', 'en108', 'j'))
})

export function picker(selectedFramework = 'en108', locale = 'en') {
  const require = createRequire(import.meta.url)
  const compiled = ts.transpileModule(readFileSync(new URL('../src/components/LanguagePairFields.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  new Function('require', 'exports', compiled)(name => {
    if (name.endsWith('/brand')) return { buildBrand:'english', guidanceLocalesForBrand: locales => locales }
    if (name.endsWith('/participantI18n')) return { GUIDANCE_LOCALES: [] }
    if (name.endsWith('/appProfiles')) return { APP_PROFILE: { allowedTracks: ['en'] } }
    if (name.endsWith('/teachingTracks')) return { TEACHING_TRACKS: [{id:'en'}], resolveTrack: () => ({id:'en',frameworks:[selectedFramework],annotationChoice:false}), resolveFramework: () => selectedFramework }
    if (name.endsWith('/proficiency')) return { frameworkById }
    if (name.endsWith('/presenterI18n')) return { usePresenterText: () => key => ({ toeicListeningReading: locale === 'en' ? 'Listening & Reading' : 'TOEIC 聽力與閱讀', toeicSpeakingWriting: locale === 'en' ? 'Speaking & Writing' : 'TOEIC 口說與寫作' })[key] || key }
    if (name.endsWith('/scSystemLanguage')) return { supportsChineseSystemLanguage: false, useScSystemLanguage: () => 'en' }
    if (name.endsWith('/scTeachingMode')) return {}
    if (name.endsWith('/uiText')) return { uiText: value => locale === 'en' ? englishTeachingLabels[value] || uiLocales[value]?.en || value : value }
    if (name.endsWith('/schoolLevels')) return { SCHOOL_STAGES, SCHOOL_GRADES, schoolStage, schoolDifficulty, schoolLevelCode }
    return require(name)
  }, exports)
  return exports.LanguagePairFields
}
test('actual picker shows compact, separate grade/difficulty buttons and preserves grade when adjusting difficulty', () => {
  const Picker = picker()
  for (const [code, expected, absent] of [['j8','Grade 8','Grade 11'],['h2','Grade 11','Grade 8']]) {
    const changes = []
    const props = { teachingTrack:'en',levelFramework:'en108',levelCode:code,guidanceLanguage:'en',readingAnnotation:'none',onLevelChange:value=>changes.push(value) }
    const html = renderToStaticMarkup(createElement(Picker, props))
    assert.ok(html.includes(expected)); assert.ok(!html.includes(absent))
    assert.doesNotMatch(html, /Year [123]/)
    assert.match(html, /Difficulty/); assert.match(html, /Standard/)
    const buttons = []
    const visit = value => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) return value.forEach(visit)
      if (value.type === 'button') buttons.push(value)
      visit(value.props?.children)
    }
    visit(Picker(props))
    const foundation = buttons.find(button => button.props.children === 'Foundation')
    foundation.props.onClick()
    assert.equal(changes.at(-1), `${code}-foundation`)
    const stage = buttons.find(button => button.props.children?.props?.children === (code.startsWith('j') ? 'Senior high' : 'Junior high'))
    stage.props.onClick()
    assert.equal(changes.at(-1), code.startsWith('j') ? 'h1' : 'j7')
  }
})
