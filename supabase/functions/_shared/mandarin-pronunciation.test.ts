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

Deno.test('Taiwan common-misreading appendix is deterministic in standard Guoyu', () => {
  const cases: Array<[string, number, string]> = [
    ['殯儀館', 0, 'bìn'], ['廣播', 1, 'bò'], ['扳回', 0, 'bān'], ['蝙蝠', 0, 'biān'],
    ['符合', 0, 'fú'], ['法國', 0, 'fǎ'], ['緋聞', 0, 'fēi'], ['諷刺', 0, 'fèng'],
    ['篠原', 0, 'xiǎo'], ['汀州', 0, 'tīng'], ['鯰魚', 0, 'nián'], ['克難', 1, 'nán'],
    ['腳踝', 1, 'huái'], ['稜角', 0, 'léng'], ['顴骨', 0, 'quán'], ['菅原', 0, 'jiān'],
    ['桂冠', 1, 'guān'], ['崗位', 0, 'gǎng'], ['坎坷', 1, 'kě'], ['樺樹', 0, 'huà'],
    ['華陀', 0, 'huà'], ['徘徊', 1, 'huái'], ['新垣', 1, 'yuán'], ['邂逅', 1, 'hòu'],
    ['嫉妒', 0, 'jí'], ['針灸', 1, 'jiǔ'], ['親戚', 1, 'qī'], ['企業', 0, 'qì'],
    ['傾城', 0, 'qīng'], ['校正', 0, 'jiào'], ['新潟', 1, 'xì'], ['流血', 1, 'xiě'],
    ['頭皮屑', 2, 'xiè'], ['朝鮮', 1, 'xiān'], ['玷污', 0, 'diàn'], ['深圳', 1, 'zhèn'],
    ['處理', 0, 'chǔ'], ['連署', 1, 'shù'], ['骰子', 0, 'tóu'], ['張韶涵', 1, 'sháo'],
    ['侮辱', 1, 'rù'], ['狙擊', 0, 'jū'], ['綜合', 0, 'zòng'], ['縱貫', 0, 'zōng'],
    ['彩券', 1, 'quàn'], ['骨髓', 1, 'suǐ'], ['骨頭', 0, 'gú'], ['脊椎', 0, 'jǐ'],
    ['液體', 0, 'yè'], ['懸崖', 1, 'yái'], ['天涯', 1, 'yá'], ['夢魘', 1, 'yǎn'],
    ['虛偽', 1, 'wèi'], ['呂不韋', 2, 'wéi'], ['枯萎', 1, 'wēi'], ['紫微', 1, 'wéi'],
    ['薔薇', 1, 'wéi'], ['昴宿', 0, 'mǎo'], ['王寶釧', 2, 'chuàn'], ['苫小牧', 0, 'shān'],
    ['海岬', 1, 'jiǎ'], ['東莞', 1, 'guǎn'], ['脂肪', 0, 'zhī'], ['嫵媚', 0, 'wǔ'],
  ]
  for (const [term, offset, expected] of cases) {
    assertEquals(readings(term, 'standard_guoyu')[offset], expected)
    assertEquals(readings(term, 'taiwanese')[offset], expected)
  }
  assertEquals(readings('法國', 'putonghua')[0], '')
})

Deno.test('phrase rules do not leak into an unrelated polyphonic word', () => {
  assertEquals(readings('會不會', 'standard_guoyu'), ['', '', ''])
  assertEquals(readings('卡片', 'putonghua'), ['', ''])
})

Deno.test('TTS instructions and Bopomofo conversion use the same selected standard', () => {
  const taiwan = regionalPronunciationInstruction('操行', 'standard_guoyu')
  const mainland = regionalPronunciationInstruction('操行', 'putonghua')
  const france = regionalPronunciationInstruction('法國', 'standard_guoyu')
  if (!taiwan.includes('xìng') || taiwan.includes('xíng')) throw new Error(taiwan)
  if (!mainland.includes('xíng') || mainland.includes('xìng')) throw new Error(mainland)
  if (!france.includes('fǎ') || france.includes('fà')) throw new Error(france)
  assertEquals(pinyinToBopomofo('xìng'), 'ㄒㄧㄥˋ')
  assertEquals(pinyinToBopomofo('xíng'), 'ㄒㄧㄥˊ')
  assertEquals(pinyinToBopomofo('fǎ'), 'ㄈㄚˇ')
})
