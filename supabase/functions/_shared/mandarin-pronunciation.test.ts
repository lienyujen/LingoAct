import {
  applyRegionalPinyin,
  pinyinToBopomofo,
  regionalPronunciationInstruction,
} from './mandarin-pronunciation.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function readings(text: string, accent: 'standard_guoyu' | 'putonghua' | 'taiwanese') {
  return applyRegionalPinyin(text, [...text].map(() => ''), accent)
}

Deno.test('Taiwan accents share MOE readings and Putonghua keeps Mainland readings', () => {
  const text = '暫時危及操行成績垃圾'
  const taiwan = ['', 'zhàn', 'wéi', 'xìng', 'jī', 'lè', 'sè']
  const mainland = ['', 'zàn', 'wēi', 'xíng', 'jì', 'lā', 'jī']
  const picked = (accent: 'standard_guoyu' | 'putonghua' | 'taiwanese') => {
    const output = readings(text, accent)
    return ['', output[0], output[2], output[5], output[7], output[8], output[9]]
  }
  assertEquals(picked('standard_guoyu'), taiwan)
  assertEquals(picked('taiwanese'), taiwan)
  assertEquals(picked('putonghua'), mainland)
})

Deno.test('phrase rules do not leak into an unrelated polyphonic word', () => {
  assertEquals(readings('會不會', 'standard_guoyu'), ['', '', ''])
  assertEquals(readings('卡片', 'putonghua'), ['', ''])
})

Deno.test('TTS instructions and Bopomofo conversion use the same selected standard', () => {
  const taiwan = regionalPronunciationInstruction('操行', 'standard_guoyu')
  const mainland = regionalPronunciationInstruction('操行', 'putonghua')
  if (!taiwan.includes('xìng') || taiwan.includes('xíng')) throw new Error(taiwan)
  if (!mainland.includes('xíng') || mainland.includes('xìng')) throw new Error(mainland)
  assertEquals(pinyinToBopomofo('xìng'), 'ㄒㄧㄥˋ')
  assertEquals(pinyinToBopomofo('xíng'), 'ㄒㄧㄥˊ')
})

