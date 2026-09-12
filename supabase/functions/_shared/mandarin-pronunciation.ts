// Regional Mandarin readings shared by the printed annotation and the voice.
//
// The contrast set is the differing entries in the cross-strait comparison at
// https://zh.wikipedia.org/wiki/臺灣海峽兩岸現代標準漢語發音差異列表 (checked 2026-09-12). The
// page is a contrast index, not a dictionary: matching is deliberately on its
// example words so a reading is never forced onto an unrelated sense. 操行 is
// added from Taiwan MOE's dictionary and Mainland China's Xiandai Hanyu Cidian.

export type MandarinAccent = 'standard_guoyu' | 'putonghua' | 'taiwanese'

type RuleSpec = { terms: string[]; offsets: number[]; taiwan: string; mainland: string }
type Rule = RuleSpec & { scope: 'character' | 'phrase' }

const rule = (terms: string, offsets: number | number[], taiwan: string, mainland: string): RuleSpec => ({
  terms: terms.split('|'), offsets: Array.isArray(offsets) ? offsets : [offsets], taiwan, mainland,
})

// Only entries whose two standards differ belong here. Rows in the source table
// where both sides agree need no override and therefore cannot alter another
// word by accident. Traditional and simplified spellings share a rule wherever
// their character positions are the same.
const PHRASE_RULES: RuleSpec[] = [
  rule('操行', 1, 'xìng', 'xíng'),
  // Same entries as the source list, occurring in the teacher's reported text.
  rule('暫時|暂时', 0, 'zhàn', 'zàn'),
  rule('危及', 0, 'wéi', 'wēi'),
]

// These two source tables are organised by character, but the example word is
// still essential context: 會 in 會稽 cannot be applied to 會不會, nor 卡 in
// 關卡 to 卡片. The general regional-standard instruction covers unseen
// vocabulary; these entries make every published contrast deterministic.
const CHARACTER_RULES: RuleSpec[] = [
  // Different initials or finals.
  rule('血液', 0, 'xiě', 'xuè'), rule('曝光', 0, 'pù', 'bào'),
  rule('暴露', 0, 'pù', 'bào'),
  rule('丘壑', 1, 'huò', 'hè'), rule('蝸牛|蜗牛', 0, 'guā', 'wō'),
  rule('混淆', 1, 'yáo', 'xiáo'), rule('山崖', 1, 'yái', 'yá'),
  rule('暫停|暂停', 0, 'zhàn', 'zàn'), rule('發酵|发酵', 1, 'xiào', 'jiào'),
  rule('攜帶|携带', 0, 'xī', 'xié'), rule('賞賜|赏赐', 1, 'sì', 'cì'),
  rule('河堤', 1, 'tí', 'dī'), rule('垃圾', 0, 'lè', 'lā'), rule('垃圾', 1, 'sè', 'jī'),
  rule('震懾|震慑', 1, 'zhé', 'shè'), rule('挾持|挟持', 0, 'xiá', 'xié'),
  rule('謅謊|诌谎', 0, 'zōu', 'zhōu'), rule('步驟|步骤', 1, 'zòu', 'zhòu'),
  rule('隼質|隼质', 0, 'zhǔn', 'sǔn'), rule('戲謔|戏谑', 1, 'nüè', 'xuè'),
  rule('採擷|采撷', 1, 'jié', 'xié'), rule('拎包', 0, 'līng', 'līn'),
  rule('劊子手|刽子手', 0, 'kuài', 'guì'), rule('檜木|桧木', 0, 'kuài', 'guì'),
  rule('秦檜|秦桧', 1, 'kuài', 'huì'), rule('會稽|会稽', 0, 'guì', 'kuài'),
  rule('圳溝|圳沟', 0, 'zùn', 'zhèn'), rule('蟄伏|蛰伏', 0, 'zhí', 'zhé'),
  rule('瑯琊|琅琊', 1, 'yé', 'yá'), rule('關卡|关卡', 1, 'kǎ', 'qiǎ'),
  rule('艘船', 0, 'sāo', 'sōu'), rule('幀數|帧数', 0, 'zhèng', 'zhēn'),
  rule('搖曳', 1, 'yì', 'yè'), rule('褪色', 0, 'tùn', 'tuì'),
  rule('角色', 0, 'jiǎo', 'jué'), rule('液態|液态', 0, 'yì', 'yè'),
  rule('乳酪', 1, 'luò', 'lào'), rule('聒噪', 0, 'guā', 'guō'),

  // Different tones.
  rule('成績|成绩', 1, 'jī', 'jì'), rule('古蹟|古迹', 1, 'jī', 'jì'),
  rule('行跡|行迹', 1, 'jī', 'jì'), rule('鑲嵌|镶嵌', 1, 'qiān', 'qiàn'),
  rule('窗框', 1, 'kuāng', 'kuàng'), rule('期待', 0, 'qí', 'qī'),
  rule('微小', 0, 'wéi', 'wēi'), rule('薔薇', 1, 'wéi', 'wēi'),
  rule('突破', 0, 'tú', 'tū'), rule('揚帆|扬帆', 1, 'fán', 'fān'),
  rule('藩籬|藩篱', 0, 'fán', 'fān'), rule('射擊|射击', 1, 'jí', 'jī'),
  rule('夾道|夹道', 0, 'jiá', 'jiā'), rule('鞠躬', 0, 'jú', 'jū'),
  rule('掬水', 0, 'jú', 'jū'), rule('拈取', 0, 'nián', 'niān'),
  rule('夕陽|夕阳', 0, 'xì', 'xī'), rule('往昔', 1, 'xí', 'xī'),
  rule('珍惜', 1, 'xí', 'xī'), rule('熄燈|熄灯', 0, 'xí', 'xī'),
  rule('作息', 1, 'xí', 'xī'), rule('危險|危险', 0, 'wéi', 'wēi'),
  rule('椰奶', 0, 'yé', 'yē'), rule('拙劣', 0, 'zhuó', 'zhuō'),
  rule('叔伯', 0, 'shú', 'shū'), rule('波濤|波涛', 1, 'táo', 'tāo'),
  rule('跌倒', 0, 'dié', 'diē'), rule('寂靜|寂静', 0, 'jí', 'jì'),
  rule('寧可|宁可', 0, 'níng', 'nìng'), rule('建築|建筑', 1, 'zhú', 'zhù'),
  rule('馴服|驯服', 0, 'xún', 'xùn'), rule('傳播|传播', 1, 'bò', 'bō'),
  rule('究竟', 0, 'jiù', 'jiū'), rule('蹬腳|蹬脚', 0, 'dèng', 'dēng'),
  rule('剽竊|剽窃', 0, 'piào', 'piāo'), rule('細菌|细菌', 1, 'jùn', 'jūn'),
  rule('幾噸|几吨', 1, 'dùn', 'dūn'), rule('穴道', 0, 'xuè', 'xué'),
  rule('蒸餾|蒸馏', 1, 'liù', 'liú'), rule('常識|常识', 1, 'shì', 'shí'),
  rule('企業|企业', 0, 'qì', 'qǐ'), rule('辱罵|辱骂', 0, 'rù', 'rǔ'),
  rule('署名', 0, 'shù', 'shǔ'), rule('諷刺|讽刺', 0, 'fèng', 'fěng'),
  rule('舞蹈', 1, 'dào', 'dǎo'), rule('偽鈔|伪钞', 0, 'wèi', 'wěi'),
  rule('樸素|朴素', 0, 'pú', 'pǔ'), rule('儲備|储备', 0, 'chú', 'chǔ'),
  rule('頭髮|头发', 1, 'fǎ', 'fà'), rule('悄悄', [0, 1], 'qiǎo', 'qiāo'),
  rule('茶坊', 1, 'fāng', 'fáng'), rule('綏靖|绥靖', 0, 'suī', 'suí'),
  rule('縛雞|缚鸡', 0, 'fú', 'fù'), rule('斂財|敛财', 0, 'liàn', 'liǎn'),
  rule('矽谷|硅谷', 0, 'xì', 'xī'), rule('綜合|综合', 0, 'zòng', 'zōng'),
  rule('偏頗|偏颇', 1, 'pǒ', 'pō'), rule('擁抱|拥抱', 0, 'yǒng', 'yōng'),
  rule('姣好', 0, 'jiǎo', 'jiāo'), rule('檔案|档案', 0, 'dǎng', 'dàng'),
  rule('菽麥|菽麦', 0, 'shú', 'shū'), rule('掇拾', 0, 'duó', 'duō'),
  rule('銻|锑', 0, 'tì', 'tī'), rule('銨|铵', 0, 'ān', 'ǎn'),
  rule('貯藏|贮藏', 0, 'zhǔ', 'zhù'),
  rule('投擲|投掷', 1, 'zhí', 'zhì'), rule('亳州', 0, 'bò', 'bó'),
  rule('剖析', 0, 'pǒu', 'pōu'), rule('惋惜', 0, 'wàn', 'wǎn'),

]

// A polyphonic contrast is meaning-dependent and must remain phrase-scoped.
const POLYPHONE_RULES: RuleSpec[] = [
  rule('我和你', 1, 'hàn', 'hé'), rule('攪和', 1, 'huò', 'huo'),
  rule('和麵|和面', 0, 'huò', 'huó'), rule('傍晚', 0, 'bāng', 'bàng'),
  rule('嘵咋|晓咋', 1, 'zhà', 'zǎ'), rule('咋呼', 0, 'zé', 'zhā'),
  rule('勝任|胜任', 0, 'shēng', 'shèng'), rule('老撾|老挝', 1, 'zhuā', 'wō'),
  rule('品質|品质', 1, 'zhí', 'zhì'), rule('弛緩|弛缓', 0, 'shǐ', 'chí'),
  rule('肉燥', 1, 'sào', 'zào'), rule('俄羅斯|俄罗斯', 0, 'è', 'é'),
  rule('女巫', 1, 'wú', 'wū'), rule('海參崴|海参崴', 2, 'wēi', 'wǎi'),
  rule('崴腳|崴脚', 0, 'wēi', 'wǎi'), rule('古玩|珍玩', 1, 'wàn', 'wán'),
  rule('玩世不恭', 0, 'wàn', 'wán'),
  rule('法國|法国|法蘭西|法兰西|法語|法语', 0, 'fà', 'fǎ'),
  rule('通緝|通缉', 1, 'qì', 'jī'),
  rule('緝麻|缉麻|緝拿歸案|缉拿归案', 0, 'qì', 'jī'),
  rule('戕害', 0, 'qiáng', 'qiāng'), rule('朝鮮|朝鲜', 1, 'xiān', 'xiǎn'),
  rule('一會|一会|一會兒|一会儿', 1, 'huǐ', 'huì'),
  rule('大乘佛教|上乘', 1, 'shèng', 'chéng'), rule('口吃', 1, 'jí', 'chī'),
  rule('車轍|车辙', 1, 'chè', 'zhé'), rule('南轅北轍|南辕北辙', 3, 'chè', 'zhé'),
  rule('包括', 1, 'guā', 'kuò'), rule('括號|括号', 0, 'guā', 'kuò'),
]

const CROSS_STRAIT_RULES: Rule[] = [
  ...PHRASE_RULES.map((entry) => ({ ...entry, scope: 'phrase' as const })),
  ...CHARACTER_RULES.map((entry) => ({ ...entry, scope: 'phrase' as const })),
  ...POLYPHONE_RULES.map((entry) => ({ ...entry, scope: 'phrase' as const })),
]

export function usesMainlandStandard(accent: MandarinAccent | null) {
  return accent === 'putonghua'
}

export function regionalStandardInstruction(accent: MandarinAccent | null) {
  return usesMainlandStandard(accent)
    ? 'Use the official Mainland China Putonghua dictionary reading of every word, including region-specific initials, finals, tones, neutral tones and polyphonic-word choices. Do not substitute Taiwan Guoyu readings.'
    : 'Use the official Taiwan Ministry of Education Guoyu dictionary reading of every word, including region-specific initials, finals, tones and polyphonic-word choices. Do not substitute Mainland Putonghua readings.'
}

function matchingRules(text: string) {
  return CROSS_STRAIT_RULES.flatMap((entry) => {
    if (entry.scope === 'phrase') {
      return entry.terms.filter((term) => text.includes(term)).map((term) => ({ ...entry, term }))
    }
    const characters = new Set(entry.terms.flatMap((term) => entry.offsets.map((offset) => [...term][offset])))
    return [...characters].filter((character) => text.includes(character)).map((character) => ({
      ...entry, term: character, offsets: [0],
    }))
  })
}

export function regionalPronunciationInstruction(text: string, accent: MandarinAccent | null) {
  const mainland = usesMainlandStandard(accent)
  const details = matchingRules(text).flatMap((entry) => entry.offsets.map((offset) => {
    const reading = mainland ? entry.mainland : entry.taiwan
    return `In 「${entry.term}」, pronounce 「${[...entry.term][offset]}」 as ${reading}.`
  }))
  const standard = regionalStandardInstruction(accent)
  return details.length ? `${standard} Mandatory readings for this text: ${[...new Set(details)].join(' ')}` : standard
}

export function applyRegionalPinyin(text: string, syllables: string[], accent: MandarinAccent | null) {
  const output = [...syllables]
  const mainland = usesMainlandStandard(accent)
  for (const entry of matchingRules(text)) {
    let from = 0
    while (from <= text.length) {
      const found = text.indexOf(entry.term, from)
      if (found < 0) break
      const start = [...text.slice(0, found)].length
      for (const offset of entry.offsets) output[start + offset] = mainland ? entry.mainland : entry.taiwan
      from = found + entry.term.length
    }
  }
  return output
}

export function regionalPinyinOverrides(text: string, accent: MandarinAccent | null) {
  const blank = [...text].map(() => '')
  return new Map(applyRegionalPinyin(text, blank, accent)
    .map((reading, at) => [at, reading] as const)
    .filter((entry) => Boolean(entry[1])))
}

const INITIALS: Array<[string, string]> = [
  ['zh', 'ㄓ'], ['ch', 'ㄔ'], ['sh', 'ㄕ'],
  ['b', 'ㄅ'], ['p', 'ㄆ'], ['m', 'ㄇ'], ['f', 'ㄈ'],
  ['d', 'ㄉ'], ['t', 'ㄊ'], ['n', 'ㄋ'], ['l', 'ㄌ'],
  ['g', 'ㄍ'], ['k', 'ㄎ'], ['h', 'ㄏ'],
  ['j', 'ㄐ'], ['q', 'ㄑ'], ['x', 'ㄒ'],
  ['r', 'ㄖ'], ['z', 'ㄗ'], ['c', 'ㄘ'], ['s', 'ㄙ'],
]

const FINALS: Record<string, string> = {
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ',
  an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ',
  i: 'ㄧ', ia: 'ㄧㄚ', ie: 'ㄧㄝ', iao: 'ㄧㄠ', iu: 'ㄧㄡ',
  ian: 'ㄧㄢ', in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ', iong: 'ㄩㄥ',
  u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ',
  uan: 'ㄨㄢ', un: 'ㄨㄣ', uang: 'ㄨㄤ', ong: 'ㄨㄥ',
  'ü': 'ㄩ', 'üe': 'ㄩㄝ', 'üan': 'ㄩㄢ', 'ün': 'ㄩㄣ',
}

const TONE_MARKS: Record<string, [string, string]> = {
  ā: ['a', ''], á: ['a', 'ˊ'], ǎ: ['a', 'ˇ'], à: ['a', 'ˋ'],
  ē: ['e', ''], é: ['e', 'ˊ'], ě: ['e', 'ˇ'], è: ['e', 'ˋ'],
  ī: ['i', ''], í: ['i', 'ˊ'], ǐ: ['i', 'ˇ'], ì: ['i', 'ˋ'],
  ō: ['o', ''], ó: ['o', 'ˊ'], ǒ: ['o', 'ˇ'], ò: ['o', 'ˋ'],
  ū: ['u', ''], ú: ['u', 'ˊ'], ǔ: ['u', 'ˇ'], ù: ['u', 'ˋ'],
  ǖ: ['ü', ''], ǘ: ['ü', 'ˊ'], ǚ: ['ü', 'ˇ'], ǜ: ['ü', 'ˋ'],
}

// The font's candidate list is Bopomofo, while the shared regional standard is
// written in Hanyu Pinyin. Converting only the mandated reading lets the server
// select the exact glyph instead of hoping the model honours an instruction.
export function pinyinToBopomofo(value: string) {
  let tone = '˙'
  let plain = ''
  for (const character of value.toLowerCase()) {
    const marked = TONE_MARKS[character]
    if (marked) {
      plain += marked[0]
      tone = marked[1]
    } else plain += character === 'v' ? 'ü' : character
  }

  if (plain.startsWith('y')) {
    const rest = plain.slice(1)
    const yFinals: Record<string, string> = {
      i: 'i', a: 'ia', e: 'ie', ai: 'iai', ao: 'iao', ou: 'iu', an: 'ian', in: 'in',
      ang: 'iang', ing: 'ing', ong: 'iong', u: 'ü', ue: 'üe', uan: 'üan', un: 'ün',
    }
    plain = yFinals[rest] || `i${rest}`
  } else if (plain.startsWith('w')) {
    const rest = plain.slice(1)
    const wFinals: Record<string, string> = {
      u: 'u', a: 'ua', o: 'uo', ai: 'uai', ei: 'ui', an: 'uan', en: 'un', ang: 'uang', eng: 'ong',
    }
    plain = wFinals[rest] || `u${rest}`
  }

  const initial = INITIALS.find(([key]) => plain.startsWith(key))
  const initialKey = initial?.[0] || ''
  let final = plain.slice(initialKey.length)
  if (['j', 'q', 'x'].includes(initialKey) && final.startsWith('u')) final = `ü${final.slice(1)}`
  if (['zh', 'ch', 'sh', 'r', 'z', 'c', 's'].includes(initialKey) && final === 'i') final = ''
  const body = `${initial?.[1] || ''}${FINALS[final] || (final === 'iai' ? 'ㄧㄞ' : '')}`
  return tone === '˙' ? `${tone}${body}` : `${body}${tone}`
}
