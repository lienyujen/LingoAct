import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyRegionalPinyin, applyRegionalWordPinyin, pinyinToBopomofo,
  regionalPronunciationInstruction, regionalSpeechText,
  unavailableRegionalBopomofoReadings,
} from '../supabase/functions/_shared/mandarin-pronunciation.ts'
import { buildVoicePlan } from '../supabase/functions/_shared/listening.ts'

const accents = ['standard_guoyu', 'taiwanese', 'putonghua']
const word = (text, pinyin, accent) => applyRegionalWordPinyin(text, [{ text, pinyin }], accent)[0].pinyin

test('workbook additions use current teaching dictionary readings in pinyin, Bopomofo and voice instructions', () => {
  for (const accent of accents) {
    const familiar = accent === 'putonghua' ? 'shú' : 'shóu'
    assert.equal(word('熟悉', 'shúxī', accent), familiar + 'xī')
    assert.equal(word('熟悉', 'shóuxī', accent), familiar + 'xī')
    for (const [text, wrong, expected] of [
      ['俄羅斯', 'èluósī', 'éluósī'], ['俄罗斯', 'Èluósī', 'Éluósī'],
      ['模範', 'múfàn', 'mófàn'], ['模范', 'Múfàn', 'Mófàn'],
      ['暖和', 'nuǎnhé', 'nuǎnhuo'], ['和牌', 'hépái', 'húpái'],
    ]) assert.equal(word(text, wrong, accent), expected, `${accent}: ${text}`)
    const instruction = regionalPronunciationInstruction('熟悉模範俄羅斯暖和和牌', accent)
    for (const value of [familiar, 'mó', 'é', 'huo', 'hú']) assert.ok(instruction.includes(`as ${value}.`), value)
    assert.ok(!instruction.includes('as è.'))
    const voice = buildVoicePlan('passage', 'zh-tw', accent, [], [], '熟悉模範俄羅斯').instruction
    assert.ok(voice.includes(`as ${familiar}.`))
  }
  assert.equal(pinyinToBopomofo('shóu'), 'ㄕㄡˊ')
  assert.equal(pinyinToBopomofo('shú'), 'ㄕㄨˊ')
  assert.equal(pinyinToBopomofo('é'), 'ㄜˊ')
  assert.equal(pinyinToBopomofo('mó'), 'ㄇㄛˊ')
  assert.equal(pinyinToBopomofo('huo'), '˙ㄏㄨㄛ')
})

test('a Taiwan-only font cannot silently show shóu for Mainland shú', () => {
  const readings = new Map([['熟'.codePointAt(0), ['ㄕㄡˊ']]])
  for (const accent of ['standard_guoyu', 'taiwanese']) {
    assert.deepEqual(unavailableRegionalBopomofoReadings('熟悉', accent, readings), [])
  }
  assert.deepEqual(unavailableRegionalBopomofoReadings('熟悉', 'putonghua', readings), [{ at: 0, character: '熟', pinyin: 'shú' }])
  readings.set('熟'.codePointAt(0), ['ㄕㄡˊ', 'ㄕㄨˊ'])
  assert.deepEqual(unavailableRegionalBopomofoReadings('熟悉', 'putonghua', readings), [])
})

test('shared readings stay phrase-scoped and do not erase genuine regional contrasts', () => {
  for (const accent of accents) {
    const taiwan = accent !== 'putonghua'
    for (const [contrast, same, offset, tw, cn, common] of [
      ['勝任', '勝利', 0, 'shēng', 'shèng', 'shèng'],
      ['品質', '人質', 1, 'zhí', 'zhì', 'zhì'],
      ['弛緩', '鬆弛', 0, 'shǐ', 'chí', 'chí'],
      ['女巫', '巫術', 1, 'wú', 'wū', 'wū'],
      ['古玩', '玩笑', 1, 'wàn', 'wán', 'wán'],
      ['車轍', '沒轍', 1, 'chè', 'zhé', 'zhé'],
    ]) {
      assert.equal(applyRegionalPinyin(contrast, ['', ''], accent)[offset], taiwan ? tw : cn)
      const instruction = regionalPronunciationInstruction(same, accent)
      assert.ok(instruction.includes(`as ${common}.`), same)
    }
    assert.deepEqual(applyRegionalPinyin('熟練', ['shú', 'liàn'], accent), ['shú', 'liàn'])
    const source = '方法法律模範俄羅斯暖和和牌'
    assert.equal(regionalSpeechText(source, accent), source, 'Shared guards must not introduce speech homophones')
  }
})

test('split compounds containing 和 preserve neutral and lexical readings while conjunctions retain their accent', () => {
  const text = '我和你和牌暖和附和和平'
  const input = [...text].map(text => ({ text, pinyin: text === '和' ? 'hé' : '' }))
  for (const accent of accents) {
    const words = applyRegionalWordPinyin(text, input, accent)
    assert.deepEqual(words.filter(w => w.text === '和').map(w => w.pinyin), [
      accent === 'putonghua' ? 'hé' : 'hàn', 'hú', 'huo', 'hè', 'hé',
    ])
    const chars = applyRegionalPinyin(text, [...text].map(() => ''), accent)
    assert.deepEqual(chars.filter((_, index) => [...text][index] === '和'), words.filter(w => w.text === '和').map(w => w.pinyin))
  }
})
