import {
  applyRegionalPinyin,
  applyRegionalWordPinyin,
  pinyinToBopomofo,
  regionalPronunciationInstruction,
  regionalSpeechText,
} from './mandarin-pronunciation.ts'
import { buildVoicePlan } from './listening.ts'

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
  const character = regionalPronunciationInstruction('品行端正', 'standard_guoyu')
  const france = regionalPronunciationInstruction('法國', 'standard_guoyu')
  if (!taiwan.includes('xìng') || taiwan.includes('xíng')) throw new Error(taiwan)
  if (!mainland.includes('xíng') || mainland.includes('xìng')) throw new Error(mainland)
  if (!character.includes('In 「品行」, pronounce 「行」 as xìng.')) throw new Error(character)
  if (!france.includes('fǎ') || france.includes('fà')) throw new Error(france)
  assertEquals(pinyinToBopomofo('xìng'), 'ㄒㄧㄥˋ')
  assertEquals(pinyinToBopomofo('xíng'), 'ㄒㄧㄥˊ')
  assertEquals(pinyinToBopomofo('fǎ'), 'ㄈㄚˇ')
})

Deno.test('standalone conjunction 和 follows the selected regional standard in word pinyin', () => {
  const text = '他希望每天都能和家人朋友在一起玩。'
  const words = [
    { text: '他', pinyin: 'Tā' }, { text: '希望', pinyin: 'xīwàng' },
    { text: '每天', pinyin: 'měitiān' }, { text: '都', pinyin: 'dōu' },
    { text: '能', pinyin: 'néng' }, { text: '和', pinyin: 'hé' },
    { text: '家人', pinyin: 'jiārén' }, { text: '朋友', pinyin: 'péngyou' },
    { text: '在', pinyin: 'zài' }, { text: '一起', pinyin: 'yìqǐ' },
    { text: '玩', pinyin: 'wán' }, { text: '。', pinyin: '' },
  ]
  const picked = (accent: 'standard_guoyu' | 'putonghua' | 'taiwanese') => (
    applyRegionalWordPinyin(text, words, accent).find((word) => word.text === '和')?.pinyin
  )
  assertEquals(picked('standard_guoyu'), 'hàn')
  assertEquals(picked('taiwanese'), 'hàn')
  assertEquals(picked('putonghua'), 'hé')

  const compounds = [{ text: '和平', pinyin: 'hépíng' }, { text: '溫和', pinyin: 'wēnhé' }]
  assertEquals(applyRegionalWordPinyin('和平溫和', compounds, 'standard_guoyu'), compounds)
})

Deno.test('Taiwan accent keeps MOE readings and asks for an unmistakable natural Taiwan cadence', () => {
  const standard = buildVoicePlan('passage', 'zh-tw', 'standard_guoyu', [], [], '我和你').instruction
  const taiwanese = buildVoicePlan('passage', 'zh-tw', 'taiwanese', [], [], '我和你').instruction
  const mainland = buildVoicePlan('passage', 'zh-tw', 'putonghua', [], [], '我和你').instruction
  if (!standard.includes('formal broadcasting in Taiwan') || !standard.includes('hàn')) throw new Error(standard)
  if (!taiwanese.includes('unmistakably Taiwanese cadence') || taiwanese.includes('do not exaggerate') || !taiwanese.includes('hàn')) throw new Error(taiwanese)
  if (!mainland.includes('Mainland China') || !mainland.includes('hé')) throw new Error(mainland)
  if (standard === taiwanese) throw new Error('Standard Guoyu and Taiwanese prompts must stay distinct.')
})

Deno.test('speech copy forces reported Taiwan readings without changing the learner transcript', () => {
  const sentence = '他希望每天都能和家人朋友在一起玩。'
  assertEquals(regionalSpeechText(sentence, 'standard_guoyu'), '他希望每天都能漢家人朋友在一起玩。')
  assertEquals(regionalSpeechText(sentence, 'taiwanese'), '他希望每天都能漢家人朋友在一起玩。')
  assertEquals(regionalSpeechText(sentence, 'putonghua'), sentence)
  assertEquals(regionalSpeechText('他的品行很好，也去過法國。', 'standard_guoyu'), '他的品姓很好，也去過髮國。')
})

Deno.test('speech copy does not mistake lexical 和 compounds for conjunctions', () => {
  const text = '他個性溫和，喜歡和平，也會和家人商量。'
  assertEquals(regionalSpeechText(text, 'standard_guoyu'), '他個性溫和，喜歡和平，也會漢家人商量。')
  assertEquals(regionalSpeechText('今天要和麵，也要攪和一下。', 'standard_guoyu'), '今天要和麵，也要攪和一下。')
})

Deno.test('the reported road-name sentence has one pronunciation plan in annotation and speech', () => {
  const text = '中和的得和路得和永和的福和路接著，我和你暫時不會走錯路。'
  const words = [
    { text: '中和', pinyin: 'Zhōnghé' }, { text: '的', pinyin: 'de' },
    { text: '得和路', pinyin: 'Déhé Lù' }, { text: '得', pinyin: 'děi' },
    { text: '和', pinyin: 'hé' }, { text: '永和', pinyin: 'Yǒnghé' },
    { text: '的', pinyin: 'de' }, { text: '福和路', pinyin: 'Fúhé Lù' },
    { text: '接著', pinyin: 'jiēzhe' }, { text: '，', pinyin: '' },
    { text: '我', pinyin: 'wǒ' }, { text: '和', pinyin: 'hé' },
    { text: '你', pinyin: 'nǐ' }, { text: '暫時', pinyin: 'zànshí' },
    { text: '不會', pinyin: 'bùhuì' }, { text: '走', pinyin: 'zǒu' },
    { text: '錯路', pinyin: 'cuòlù' }, { text: '。', pinyin: '' },
  ]
  const pinyin = (accent: 'standard_guoyu' | 'putonghua' | 'taiwanese') => (
    applyRegionalWordPinyin(text, words, accent).map((word) => word.pinyin)
  )
  const taiwan = pinyin('standard_guoyu')
  const taiwanese = pinyin('taiwanese')
  const mainland = pinyin('putonghua')
  assertEquals(taiwan[2], 'Déhé Lù')
  assertEquals(taiwan[4], 'hàn')
  assertEquals(taiwan[11], 'hàn')
  assertEquals(taiwan[13], 'zhànshí')
  assertEquals(taiwan[14], 'búhuì')
  assertEquals(taiwanese, taiwan)
  assertEquals(mainland[4], 'hé')
  assertEquals(mainland[11], 'hé')
  assertEquals(mainland[13], 'zànshí')
  assertEquals(mainland[14], 'búhuì')

  const characterPinyin = [...text].map((character) => character === '和' ? 'hé' : '')
  assertEquals(
    [...text].flatMap((character, at) => character === '和'
      ? [applyRegionalPinyin(text, characterPinyin, 'standard_guoyu')[at]] : []),
    ['hé', 'hé', 'hàn', 'hé', 'hé', 'hàn'],
  )

  assertEquals(
    regionalSpeechText(text, 'standard_guoyu'),
    '中河的得河路得漢永河的福河路接著，我漢你站時不會走錯路。',
  )
  assertEquals(
    regionalSpeechText(text, 'putonghua'),
    '中河的得河路得和永河的福河路接著，我和你讚時不會走錯路。',
  )
})

Deno.test('surface-tone annotation follows each regional sandhi standard', () => {
  const text = '一杯一個七天七次八本八號不會很好展覽館'
  const base = ['yī', 'bēi', 'yī', 'gè', 'qī', 'tiān', 'qī', 'cì', 'bā', 'běn', 'bā', 'hào', 'bù', 'huì', 'hěn', 'hǎo', 'zhǎn', 'lǎn', 'guǎn']
  assertEquals(
    applyRegionalPinyin(text, base, 'standard_guoyu'),
    ['yì', 'bēi', 'yí', 'gè', 'qì', 'tiān', 'qí', 'cì', 'bà', 'běn', 'bá', 'hào', 'bú', 'huì', 'hén', 'háo', 'zhán', 'lán', 'guǎn'],
  )
  assertEquals(
    applyRegionalPinyin(text, base, 'putonghua'),
    ['yì', 'bēi', 'yí', 'gè', 'qī', 'tiān', 'qī', 'cì', 'bā', 'běn', 'bā', 'hào', 'bú', 'huì', 'hén', 'háo', 'zhán', 'lán', 'guǎn'],
  )
  assertEquals(
    applyRegionalWordPinyin('展覽館很好勇敢', [
      { text: '展覽館', pinyin: 'zhǎnlǎnguǎn' },
      { text: '很', pinyin: 'hěn' },
      { text: '好', pinyin: 'hǎo' },
      { text: '勇敢', pinyin: 'yǒnggǎn' },
    ], 'standard_guoyu').map((word) => word.pinyin),
    ['zhánlánguǎn', 'hén', 'hǎo', 'yónggǎn'],
  )
})
