import { GUOYU_CLASSICS } from './guoyu-classics.ts'

export const GUOYU_CLASSICS_CURRICULUM = 'https://stv.naer.edu.tw/data/course_outline/pta_18510_4703638_59125.pdf'

const peachBlossom = {
  source: 'https://zh.wikisource.org/w/index.php?title=桃花源記&oldid=2620894',
  edition: '維基文庫《桃花源記并詩》正文讀法，取記文，略去校記與詩',
  teacherReferences: [
    { label: '官廷森老師課文朗讀', url: 'https://market.cloud.edu.tw/resources/web/1574241' },
    { label: '陳怡樺老師課文朗讀與課文', url: 'https://podcasts.apple.com/tw/podcast/id1711163922?i=1000630797655' },
    { label: '郭元倩老師課文補充講義', url: 'https://learn.hshs.tyc.edu.tw/ischool/publish_page/444/?cid=9632' },
  ],
  collationSource: 'https://zh.wikisource.org/wiki/箋註陶淵明集_(四部叢刊本)/卷第五',
  paragraphs: [
    '晉太元中，武陵人捕魚爲業。緣溪行，忘路之遠近。忽逢桃花林，夾岸數百步，中無雜樹，芳草鮮美，落英繽紛。漁人甚異之。復前行，欲窮其林。',
    '林盡水源，便得一山，山有小口，髣髴若有光。便捨船，從口入，初極狹，纔通人。復行數十步，豁然開朗。土地平曠，屋舍儼然。有良田、美池、桑竹之屬。阡陌交通，鷄犬相聞。其中往來種作，男女衣著，悉如外人。黃髮垂髫，並怡然自樂。',
    '見漁人，乃大驚，問所從來，具答之。便要還家，爲設酒殺鷄作食。村中聞有此人，咸來問訊。自云先世避秦時亂，率妻子邑人來此絶境，不復出焉，遂與外人間隔。問今是何世，乃不知有漢，無論魏晉。此人一一爲具言所聞，皆歎惋。餘人各復延至其家，皆出酒食。停數日，辭去。此中人語云：「不足爲外人道也。」',
    '既出，得其船，便扶向路，處處誌之。及郡下，詣太守，説如此。太守即遣人隨其往，尋向所誌，遂迷，不復得路。',
    '南陽劉子驥，高尚士也。聞之，欣然規往。未果，尋病終。後遂無問津者。',
  ],
  variants: [
    '太元：校記另列「太康」。',
    '緣溪行：校記另列「從溪而行」。',
    '雜樹：《藝文類聚》作「雜木」，前後句也有異文。',
    '復行數十步：校記另列「行四五十步」。',
    '爲設酒：校記指李本、焦本無「爲」，取曾本、蘇寫本所見讀法。',
    '與外人間隔：《藝文類聚》所載作「與外隔絕」，《太平御覽》所載作「與外隔」。',
    '便要還家：陳怡樺老師所附課文接「設酒」，本版接「爲設酒」，不可直接混用音檔。',
    '篇末：依底本保留劉子驥一段。其刪節本不得搭配本教材的篇末題。',
    '規往：校記指出紹興本、李注本作「親」。',
  ],
  readings: [
    { phrase: '夾岸', pronunciation: 'ㄐㄧㄚˊ ㄢˋ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=89607' },
    { phrase: '髣髴', pronunciation: 'ㄈㄤˇ ㄈㄨˊ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=36533' },
    { phrase: '衣著', pronunciation: 'ㄧ ㄓㄨㄛˊ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=150074' },
    { phrase: '黃髮', pronunciation: 'ㄏㄨㄤˊ ㄈㄚˇ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=86430' },
    { phrase: '垂髫', pronunciation: 'ㄔㄨㄟˊ ㄊㄧㄠˊ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=125688' },
    { phrase: '間隔', pronunciation: 'ㄐㄧㄢˋ ㄍㄜˊ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=93642' },
    { phrase: '屋舍', pronunciation: 'ㄨ ㄕㄜˋ' },
    { phrase: '便要還家', pronunciation: 'ㄅㄧㄢˋ ㄧㄠ ㄏㄨㄢˊ ㄐㄧㄚ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=10962&ver=4' },
    { phrase: '此中人語云', pronunciation: 'ㄘˇ ㄓㄨㄥ ㄖㄣˊ ㄩˋ ㄩㄣˊ', source: 'https://dict.revised.moe.edu.tw/dictView.jsp?ID=11740' },
    { phrase: '不足爲外人道也', pronunciation: 'ㄅㄨˋ ㄗㄨˊ ㄨㄟˋ ㄨㄞˋ ㄖㄣˊ ㄉㄠˋ ㄧㄝˇ' },
  ],
  pauseNotes: ['「率妻子邑人／來此絶境」內不拆開「妻子邑人」。', '「南陽劉子驥／高尚士也」在人名後停連。'],
  questions: [{
    prompt: '村民為何來到桃花源？請以原文說明。',
    evidence: '先世避秦時亂，率妻子邑人來此絶境',
    answer: '他們的祖先為躲避秦代戰亂，帶家眷與同鄉遷入此地。',
  }, {
    prompt: '村民對外界歷史知道多少？請說明你的依據。',
    evidence: '問今是何世，乃不知有漢，無論魏晉。',
    answer: '他們連漢朝都不知道，更不用說魏、晉。這顯示他們長期與外界隔絕。',
  }, {
    prompt: '漁人為重返桃花源做了什麼？結果如何？',
    evidence: '便扶向路，處處誌之。',
    additionalEvidence: '尋向所誌，遂迷，不復得路。',
    answer: '他沿原路逐處做記號，但之後按記號尋找仍然迷路，未能找到回去的路。',
  }],
}

export const GUOYU_CLASSICS_LIBRARY = GUOYU_CLASSICS.map(([title, voice]) => ({
  title,
  voice,
  curriculum: GUOYU_CLASSICS_CURRICULUM,
  draft: title === '桃花源記' ? peachBlossom : null,
}))

export function isUnreviewedClassic(text: string, voices?: { classicalVoice?: unknown } | null) {
  // A preview can exist before editorial sign-off. The classroom must never
  // receive that preview merely because the caller skipped the studio.
  return Boolean(voices?.classicalVoice) || GUOYU_CLASSICS_LIBRARY.some(({ title, draft }) =>
    text.includes(title) || Boolean(draft && draft.paragraphs.some(paragraph => text.includes(paragraph))),
  )
}

export const CLASSICS_REVIEW_REQUIRED = '這份古文仍在校訂。完成底本、音檔與題目審查後才能派送。'

export function classicalReadingNotes(text: string) {
  const draft = GUOYU_CLASSICS_LIBRARY.find(({ draft }) => draft &&
    (text === draft.paragraphs.join('\n\n') || text === '桃花源記\n' + draft.paragraphs.join('\n\n')))?.draft
  if (!draft) return ''
  return [
    'Apply these pronunciation and phrasing directions silently. Never read the directions aloud.',
    ...draft.readings.map(({ phrase, pronunciation }) => `${phrase}: ${pronunciation}`),
    ...draft.pauseNotes,
  ].join(' ')
}

// Audio approval is separate from permission to dispatch the lesson or its quiz.
export function approvedClassicalAudio(text: string) {
  const body = text.trim().replace(/^(?:〈桃花源記〉|桃花源記)[\s\u3000]+/u, '')
  const compact = (value: string) => value.replace(/\s+/gu, '')
  if (compact(body) !== compact(peachBlossom.paragraphs.join(''))) return null
  return {
    title: '桃花源記',
    transcript: peachBlossom.paragraphs.join('\n\n'),
    file: 'peach-blossom-d08a8ce6.wav',
    hash: 'd08a8ce68f9af8da314c1a2b2201cc549bf90d8369cdd0b54b42c0607b86bb11',
    durationMs: 124160,
    voice: 'Orus',
  }
}
