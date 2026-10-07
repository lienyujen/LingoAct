import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scFrameworkChoices, scTeachingMode } from '../src/lib/scTeachingMode.ts'
import { dispatchLevelCode, levelInstruction } from '../supabase/functions/_shared/proficiency.ts'
import { HSK_SYLLABUS } from '../supabase/functions/_shared/hsk-syllabus.generated.ts'
import { hskWordLevel, hskOverLevelWords, applyHskWordPinyin } from '../supabase/functions/_shared/hsk.ts'
import { newWords } from '../supabase/functions/_shared/reading.ts'
import { buildVoicePlan } from '../supabase/functions/_shared/listening.ts'

test('English offers all three Chinese standards; script modes constrain them', () => {
  assert.deepEqual(scFrameworkChoices('en'), ['hsk', 'tocfl', 'tbcl'])
  assert.deepEqual(scFrameworkChoices('zh-CN'), ['hsk'])
  assert.deepEqual(scFrameworkChoices('zh-TW'), ['tbcl', 'tocfl'])
  for (const framework of ['hsk', 'tocfl', 'tbcl']) {
    const mode = scTeachingMode('en', framework)
    assert.equal(mode.framework, framework)
    assert.equal(mode.teachingTrack, framework === 'hsk' ? 'putonghua' : 'huayu')
    assert.equal(mode.teachingLanguage, framework === 'hsk' ? 'zh-cn' : 'zh-tw')
  }
  assert.deepEqual(scTeachingMode('zh-CN', 'tbcl').accents, ['putonghua'])
  assert.equal(scTeachingMode('zh-TW', 'hsk').framework, 'tbcl')
})

test('only teacher level directions override this dispatch; defaults and i+ stretch stay separate', () => {
  for (const direction of ['', '练习介绍自己的家庭', 'i+1', '使用新版 HSK3.0 大纲', '不要用 HSK 1 级']) {
    assert.equal(dispatchLevelCode('hsk', '2', direction), '2', direction)
  }
  for (const direction of ['改成 HSK4 级', '这次用HSK四级出题', '改成第三级', 'Switch to HSK level 3', 'HSK 3']) {
    assert.equal(dispatchLevelCode('hsk', '2', direction), direction.includes('四') || direction.includes('4') ? '4' : '3', direction)
  }
  assert.equal(dispatchLevelCode('hsk', '2', '不要HSK3，改成HSK4'), '4')
  assert.equal(dispatchLevelCode('hsk', '2', '改成HSK8级'), '7-9')
  assert.equal(dispatchLevelCode('tbcl', '2', '改成 TBCL 第五級'), '5')
  assert.equal(dispatchLevelCode('tocfl', 'level2', '这次换成 TOCFL B1'), 'level3')
  assert.equal(dispatchLevelCode('tocfl', 'level2', '改成 A1'), 'level1')
  assert.match(levelInstruction('hsk', '2', '改成HSK4'), /HSK 4/)
})

test('official HSK entries and new-word marks use their own table', () => {
  assert.equal(HSK_SYLLABUS.vocabulary.length, 11000)
  assert.deepEqual(HSK_SYLLABUS.vocabulary.map((entry) => entry.id), Array.from({ length: 11000 }, (_, index) => index + 1))
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((level) => HSK_SYLLABUS.vocabulary.filter((entry) => entry.level === level).length), [300, 200, 500, 1000, 1600, 1800, 5600])
  assert.equal(hskWordLevel('爱'), 1)
  assert.equal(hskWordLevel('中国'), 1)
  const same = HSK_SYLLABUS.vocabulary.find((entry) => entry.level === 2 && hskWordLevel(entry.word) === 2).word
  const higher = HSK_SYLLABUS.vocabulary.find((entry) => entry.level === 5 && hskWordLevel(entry.word) === 5).word
  assert.deepEqual(newWords([{ text: '爱', pinyin: 'ài' }, { text: same, pinyin: '' }, { text: higher, pinyin: '' }, { text: '火星猫猫', pinyin: '' }], 2, hskWordLevel),
    [{ word: same, level: 2 }, { word: higher, level: 5 }, { word: '火星猫猫', level: 0 }])
  assert.ok(hskOverLevelWords(higher, 2).some((entry) => entry.level > 2))
})

test('HSK uses official unambiguous readings and no Taiwan speech substitutions', () => {
  assert.equal(applyHskWordPinyin([{ text: '和', pinyin: 'hàn' }])[0].pinyin, 'hé')
  assert.equal(applyHskWordPinyin([{ text: '中国', pinyin: 'zhōngguó' }])[0].pinyin, 'Zhōngguó')
  const text = '小明：我和小王使用软件观看视频。\n小王：我也和小明一起看。'
  const plan = buildVoicePlan('dialogue', 'zh-cn', 'taiwanese', ['小明', '小王'], [], text)
  assert.equal(plan.speechText, text)
  assert.match(plan.instruction, /Putonghua|Mainland/)
  assert.doesNotMatch(plan.instruction, /Taiwanese Mandarin accent/)
})
