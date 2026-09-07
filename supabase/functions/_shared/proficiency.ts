// The level a class is working at, in the vocabulary its teacher already uses.
//
// Every framework here is widely published and the model knows them by name, so
// the prompt names the level rather than translating it into CEFR first. That
// translation is where accuracy goes: TBCL levels 1 and 2 sit *below* CEFR A1
// for listening, reading and writing, so rendering them as "A1" would silently
// ask for material too hard for the very learners who need it easiest.

export type Framework = 'tbcl' | 'tocfl' | 'guoyu108' | 'en108' | 'gept' | 'toeic' | 'cefr' | 'jlpt' | 'topik' | 'ivpt'

export type Level = {
  code: string
  label: string
  // A coarse ordinal, 0 (below CEFR A1) to 6 (CEFR C2). Used only to decide how
  // strict the answer-leak rule can reasonably be — not as a claim that any two
  // frameworks line up exactly at the same number.
  band: number
  // What a learner at this level can actually read, in terms the model can hold
  // to and a person can check afterwards: which topics, which structures, and
  // what a sentence looks like.
  //
  // Naming the level alone does not work. Asked for 「TBCL 第1級」 the model
  // produced 「都市化帶來了什麼好處？」 with 「經濟成長與生活便利」 among the
  // options — B1 vocabulary under a label that sits below A1. It knows the
  // framework exists; it does not know where the line is until told.
  ceiling: string
  // The longest a question stem may be at this level — characters for the
  // character-based frameworks, words for the rest. A ceiling in prose is a
  // request; this is checked after generation and sent back if it is broken.
  maxStem: number
}

// 素養導向: what the 108 curriculum asks an item to BE, not merely how hard it
// should be. It applies to the two 課綱 ladders and to nothing else here — a
// class preparing for 多益 or TOCFL wants items in that test's own idiom, and
// dressing a TOEIC item up as a life-situation task would misprepare them.
//
// Taken from the Ministry's own criteria for 素養導向紙筆測驗: the item is set in
// an authentic, contextualised situation; it asks the learner to integrate and
// apply knowledge, skills and attitudes to a real problem; it values the
// reasoning process, not only the answer. What it must not be is recall of a
// fact from the passage, or a "situation" invented as decoration around a
// conventional question.
const COMPETENCY_ORIENTED = [
  'This curriculum is 素養導向 (competency-oriented), which changes what the question must BE and not only how hard it is.',
  'Set each item in a concrete, plausible situation the learner could actually meet — a notice, a message, a conversation, a choice to make — and ask them to DO something with the text: infer, compare, judge, decide, apply it elsewhere, or explain why.',
  'Do not write items that can be answered by locating a fact and copying it back. Do not bolt an invented "situation" onto a recall question as decoration; if removing the situation leaves the question intact, it was decoration.',
  'Where the material allows, reach for the reasoning behind an answer rather than the answer alone.',
].join(' ')

// The teacher screenshots what is on their screen, which is a textbook page, a
// slide or an article — written for whoever wrote it, not for this class. The
// generator's default is to test the material at the material's own difficulty,
// and that default is what produced a 都市化 comprehension question for a class
// three hundred words into Chinese.
const SOURCE_ABOVE_LEVEL = [
  'The material is very often written well above this class. That does not license a question at the material\'s level: the level above governs, and the material is only where the content comes from.',
  'Build each item out of the part of the material a learner at this level can actually read, and say it in words at this level. A term from the material that sits above the level may not appear in the stem, in the options, or in the answer — not even quoted.',
  'Where almost nothing in the material is within reach, ask about what it plainly shows or names — a place, a number, an object, a person, what someone is doing — in the simplest words at this level. A short, easy, honest item is worth more to this class than a faithful one they cannot read.',
].join(' ')

// Both ends are worth guarding. Asked for a high level the model also drifts —
// down, into the same plain comprehension question it writes for everyone —
// because nothing in the prompt says the item is too easy.
const STAY_AT_LEVEL = 'Do not aim below the level either: at the upper levels an item that merely locates a fact in the passage is too easy to be worth asking, however correct it is.'

export const FRAMEWORKS: Record<Framework, { name: string; note: string; levels: Level[]; unit: 'char' | 'word' }> = {
  // 國語文 under Taiwan's 108 curriculum — 國語 in 國小, 國文 from 國中 up.
  // These are native speakers, so the band tracks reading and writing load
  // rather than spoken command: a first-grader converses fluently and reads a
  // few hundred characters, so a question they could answer aloud can still be
  // unreadable on the page. Competencies are defined per 學習階段, which is why
  // each year names the stage it belongs to.
  guoyu108: {
    name: '十二年國民基本教育課程綱要・語文領域－國語文',
    note: [
      'Taiwan\'s 108 curriculum for Mandarin taught as a FIRST language: 國語 in primary school, 國文 from junior high. These are native speakers. Do not simplify the spoken language as though for a foreign learner and never gloss an ordinary word — pitch the difficulty at the characters they can READ and the length and abstraction of what they can WRITE at this stage.',
      COMPETENCY_ORIENTED,
      'The curriculum organises this subject into six 學習表現: 聆聽, 口語表達, 標音符號與運用, 識字與寫字, 閱讀, 寫作. A written quiz lives mostly in 閱讀 — 擷取訊息, 統整解釋, 省思評鑑 — and in 寫作. Prefer those over character recognition drilled in isolation, which the curriculum treats as a means rather than an end.',
    ].join('\n'),
    unit: 'char',
    levels: [
      {
        code: 'g1', label: '國小一年級（第一學習階段）', band: 1, maxStem: 20,
        ceiling: 'Six years old, in their first year of reading. They speak Mandarin fluently and read only a few hundred characters, many of them still with 注音 beside. Keep the stem to about twenty characters of common characters; anything harder should be written in 注音 or avoided. Ask about a story\'s people and order of events, not about theme or technique.',
      },
      {
        code: 'g2', label: '國小二年級（第一學習階段）', band: 2, maxStem: 26,
        ceiling: 'Seven years old. Around a thousand characters. Short stories and simple explanatory text, cause and feeling. Up to about twenty-six characters per stem.',
      },
      {
        code: 'g3', label: '國小三年級（第二學習階段）', band: 2, maxStem: 34,
        ceiling: 'Eight or nine. Reading paragraphs rather than sentences: main idea, sequence, a character\'s reason. Up to about thirty-four characters. 成語 only if very common.',
      },
      {
        code: 'g4', label: '國小四年級（第二學習階段）', band: 3, maxStem: 40,
        ceiling: 'Nine or ten. Summarising a passage, comparing two accounts, using a dictionary and 部首. Up to about forty characters. Everyday 成語 and simple 文言 phrases in context.',
      },
      {
        code: 'g5', label: '國小五年級（第三學習階段）', band: 3, maxStem: 48,
        ceiling: 'Ten or eleven. 統整解釋 across a text: inference, the writer\'s purpose, distinguishing fact from opinion. Up to about forty-eight characters. Short 古典詩文 in context is fair.',
      },
      {
        code: 'g6', label: '國小六年級（第三學習階段）', band: 4, maxStem: 55,
        ceiling: 'Eleven or twelve. 省思評鑑 begins: judging an argument, noticing how a text is put together. Up to about fifty-five characters.',
      },
      {
        code: 'j1', label: '國中七年級（第四學習階段）', band: 4, maxStem: 60,
        ceiling: 'Junior high, first year. 記敘, 抒情 and 說明 texts, basic 文言文, rhetorical devices by name. Up to about sixty characters.',
      },
      {
        code: 'j2', label: '國中八年級（第四學習階段）', band: 5, maxStem: 70,
        ceiling: 'Junior high, second year. 議論文 and longer 文言文, structure and argument, comparing two texts. Up to about seventy characters.',
      },
      {
        code: 'j3', label: '國中九年級（第四學習階段）', band: 5, maxStem: 80,
        ceiling: 'Junior high, third year, working towards 會考. 文言文 read closely, implication and tone, an argument weighed on its evidence. Up to about eighty characters. An item answerable by locating one sentence is below this level.',
      },
      {
        code: 'h1', label: '高中一年級（第五學習階段）', band: 5, maxStem: 90,
        ceiling: 'Senior high, first year. 古典 and 現代 literature side by side, 文化 and 思想 in a text, sustained argument.',
      },
      {
        code: 'h2', label: '高中二年級（第五學習階段）', band: 6, maxStem: 100,
        ceiling: 'Senior high, second year. Literary and philosophical texts, competing readings, 學術 register. The item should turn on interpretation rather than content.',
      },
      {
        code: 'h3', label: '高中三年級（第五學習階段）', band: 6, maxStem: 110,
        ceiling: 'Senior high, third year, working towards 學測 and 分科測驗. Multi-text comparison, 文本互涉, evaluating a position. Nothing in the language is off limits.',
      },
    ],
  },
  // 英語文 under the same curriculum, which starts in 國小三年級. The stage
  // targets are the curriculum's own CEFR references, not a guess.
  en108: {
    name: '十二年國民基本教育課程綱要・語文領域－英語文',
    note: [
      'Taiwan\'s 108 curriculum for English as a foreign language, beginning in the third year of primary school. Write for a Taiwanese classroom: the learners share Mandarin as a first language, and the curriculum expects roughly CEFR A2 by the end of junior high and B1 by the end of senior high.',
      COMPETENCY_ORIENTED,
    ].join('\n'),
    unit: 'word',
    levels: [
      {
        code: 'p34', label: '國小三、四年級（第二學習階段）', band: 1, maxStem: 10,
        ceiling: 'Their first two years of English, eight or nine years old. A few hundred words: greetings, colours, numbers, family, animals, food, school things, classroom instructions. Present simple only, and sentences of about six to ten words. No past tense, no clauses. The curriculum expects them to read words and very short sentences, so an item may lean on a picture.',
      },
      {
        code: 'p56', label: '國小五、六年級（第三學習階段）', band: 1, maxStem: 14,
        ceiling: 'Ten to twelve years old, still primary. Around a thousand words on everyday topics: daily routine, weather, hobbies, places in town, simple feelings. Present simple and present continuous, can/can\'t, there is/are, and the past of common verbs. Up to about fourteen words per sentence, at most one clause.',
      },
      {
        code: 'j', label: '國中（第四學習階段，約 CEFR A2）', band: 2, maxStem: 20,
        ceiling: 'Junior high, working towards roughly CEFR A2 by 九年級. Familiar topics and short texts: a message, a notice, a short article about school or family life. Past, future, comparatives and common phrasal verbs are fair. Up to about twenty words. Idiom and abstract argument are not yet.',
      },
      {
        code: 'h', label: '高中（第五學習階段，約 CEFR B1）', band: 3, maxStem: 28,
        ceiling: 'Senior high, working towards roughly CEFR B1. Articles of general interest, an opinion with a reason, a straightforward narrative. Relative clauses, passives and the perfect aspect are fair. Up to about twenty-eight words. Academic or specialised vocabulary still is not.',
      },
    ],
  },
  // 多益, named by certificate colour because that is how a Taiwanese class
  // talks about a TOEIC target.
  toeic: {
    name: '多益普及測驗 TOEIC',
    note: 'The English test most often sat in Taiwan, scored 10-990 and reported as a certificate colour. It is workplace English: favour offices, travel, correspondence and everyday transactions over academic prose.',
    unit: 'word',
    levels: [
      {
        code: 'orange', label: 'TOEIC 橘色證書（10-215）', band: 1, maxStem: 14,
        ceiling: 'Roughly CEFR A1. Can handle a name badge, a price, a time, a simple form. Present simple, sentences of about eight to fourteen words, high-frequency workplace nouns only (office, meeting, phone, email, order). No conditionals, no passives, no idiom.',
      },
      {
        code: 'brown', label: 'TOEIC 棕色證書（220-465）', band: 2, maxStem: 20,
        ceiling: 'Roughly CEFR A2. Short notices, schedules, simple correspondence. Past and future, modals of request. Up to about twenty words. Business idiom and complex clauses are above this level.',
      },
      {
        code: 'green', label: 'TOEIC 綠色證書（470-725）', band: 3, maxStem: 26,
        ceiling: 'Roughly CEFR B1. Routine correspondence, meeting arrangements, travel and everyday transactions handled independently. Relative clauses and passives are fair. Up to about twenty-six words.',
      },
      {
        code: 'blue', label: 'TOEIC 藍色證書（730-855）', band: 4, maxStem: 34,
        ceiling: 'Roughly CEFR B2. Reports, negotiation, comparing proposals, inferring intent from tone. Common business idiom is fair. Ask for inference rather than retrieval.',
      },
      {
        code: 'gold', label: 'TOEIC 金色證書（860-990）', band: 5, maxStem: 45,
        ceiling: 'Roughly CEFR C1. Nuance, register and implication in professional English; contracts, analyses, indirect refusals. An item answerable by matching a phrase is below this level.',
      },
    ],
  },
  tbcl: {
    name: '臺灣華語文能力基準 (TBCL)',
    note: 'Taiwan\'s national benchmarks for Chinese as a second language, three stages across seven levels: 基礎 (1-3), 進階 (4-5), 精熟 (6-7). Levels 1 and 2 are below CEFR A1; do not treat them as A1.',
    unit: 'char',
    levels: [
      {
        code: '1', label: 'TBCL 第1級（基礎）', band: 0, maxStem: 12,
        ceiling: 'The first weeks of Chinese, a few hundred words. Topics: greetings, one\'s own name and country, numbers, family, food and drink, classroom objects, days and times, prices. Sentences of about five to ten characters, one clause, no subordination. Verbs limited to 是, 有, 在, 叫, 姓, 去, 來, 吃, 喝, 看, 買 and the like. Questions with 嗎, 什麼, 誰, 幾, 哪裡. No 把 or 被, no 雖然…但是, no 因為…所以, no abstract nouns at all — nothing ending in 化, 性, 度, 主義, and no two-character compounds a beginner would not have met (經濟, 環境, 政策, 社會, 效應, 發展 are all far above this level).',
      },
      {
        code: '2', label: 'TBCL 第2級（基礎）', band: 0, maxStem: 18,
        ceiling: 'Still below CEFR A1. Topics: shopping, transport, weather, the day\'s routine, asking the way, ordering food, simple feelings (累, 高興, 忙). Sentences of about ten to eighteen characters, at most two clauses joined by 和, 也, 然後, 可是. 了 and 過 for completed actions, 要 and 會 for the future, 比 for simple comparison. Still no abstract nouns and no academic register.',
      },
      {
        code: '3', label: 'TBCL 第3級（基礎）', band: 1, maxStem: 24,
        ceiling: 'Roughly CEFR A1. Familiar, concrete topics: school and work life, health, travel, a short story about something that happened. Up to about twenty-four characters. 因為…所以, 雖然…但是, 如果…就 are available so long as what they join is concrete. One abstract idea per item at most, and only an everyday one (時間, 問題, 意思, 辦法).',
      },
      {
        code: '4', label: 'TBCL 第4級（進階）', band: 2, maxStem: 32,
        ceiling: 'Roughly CEFR A2. The learner can follow a short article on a familiar subject and give a reason for a preference. Up to about thirty-two characters. Common abstract vocabulary of daily life is fair (環境, 習慣, 影響, 經驗, 文化); specialised or academic terminology is not.',
      },
      {
        code: '5', label: 'TBCL 第5級（進階）', band: 3, maxStem: 40,
        ceiling: 'Roughly CEFR B1. Abstract topics begin: comparing views, explaining a cause, summarising an argument on a subject of general interest. Up to about forty characters. Newspaper vocabulary on everyday public affairs is fair; technical jargon still is not.',
      },
      {
        code: '6', label: 'TBCL 第6級（精熟）', band: 4, maxStem: 52,
        ceiling: 'Roughly CEFR B2. The learner reads argument and commentary and can weigh positions. Written and academic register is fair, including 化/性/度 abstractions and multi-clause sentences. Ask for inference, comparison and judgement rather than retrieval.',
      },
      {
        code: '7', label: 'TBCL 第7級（精熟）', band: 5, maxStem: 70,
        ceiling: 'Roughly CEFR C1. Specialised and academic Chinese, implication and register, ideas held across a whole text. Nothing in the vocabulary is off limits. An item that can be answered by finding one sentence is below this level.',
      },
    ],
  },
  tocfl: {
    name: '華語文能力測驗 (TOCFL)',
    note: 'The test TBCL\'s learners actually sit, in four bands across eight levels, with 準備級 sitting below CEFR A1. Vocabulary is tightly specified at each level, so keep to the words a learner at this level is expected to hold.',
    unit: 'char',
    levels: [
      {
        code: 'novice1', label: 'TOCFL 準備級一級（低於 CEFR A1）', band: 0, maxStem: 12,
        ceiling: 'The published 準備級一級 word list is about three hundred words. Topics: greetings, name, country, numbers, family, food, classroom, time, price. Sentences of five to ten characters, one clause. No abstract nouns whatsoever and no compound a beginner has not met.',
      },
      {
        code: 'novice2', label: 'TOCFL 準備級二級（低於 CEFR A1）', band: 0, maxStem: 18,
        ceiling: 'Still below CEFR A1, roughly the first five hundred words. Shopping, transport, weather, the day\'s routine, feelings named in one word. Ten to eighteen characters, at most two clauses. No abstract or academic vocabulary.',
      },
      {
        code: 'level1', label: 'TOCFL 入門級（CEFR A1，約 500 詞）', band: 1, maxStem: 24,
        ceiling: 'About five hundred words. Familiar concrete topics and short narratives. Up to about twenty-four characters. Keep to the 入門級 word list: a word outside it makes the item untestable however simple the idea behind it.',
      },
      {
        code: 'level2', label: 'TOCFL 基礎級（CEFR A2，約 1,270 詞）', band: 2, maxStem: 32,
        ceiling: 'About 1,270 words. Familiar subjects, reasons for a preference, a short article on daily life. Up to about thirty-two characters. Everyday abstractions are fair; specialised terminology is not.',
      },
      {
        code: 'level3', label: 'TOCFL 進階級（CEFR B1，約 3,245 詞）', band: 3, maxStem: 40,
        ceiling: 'About 3,245 words. Public affairs and general-interest writing, cause and comparison. Up to about forty characters. Newspaper vocabulary is fair; technical jargon is not.',
      },
      {
        code: 'level4', label: 'TOCFL 高階級（CEFR B2，約 4,316 詞）', band: 4, maxStem: 52,
        ceiling: 'About 4,316 words. Argument and commentary, weighing positions, written register. Ask for inference and judgement rather than retrieval.',
      },
      {
        code: 'level5', label: 'TOCFL 流利級（CEFR C1，約 5,456 詞）', band: 5, maxStem: 70,
        ceiling: 'About 5,456 words. Specialised and academic Chinese, implication, register, ideas carried across a whole text. An item answerable from one sentence is below this level.',
      },
      {
        code: 'level6', label: 'TOCFL 精通級（CEFR C2，約 11,092 詞）', band: 6, maxStem: 90,
        ceiling: 'About 11,092 words. Near-native reading: idiom, irony, rhetorical structure, 成語 and literary register. Nothing is off limits, and the item should turn on something a fluent reader could still miss.',
      },
    ],
  },
  cefr: {
    name: 'CEFR',
    note: 'The Common European Framework, used in Taiwan for French, German and Spanish, and as the spine the other frameworks map onto.',
    unit: 'word',
    levels: [
      {
        code: 'A1', label: 'CEFR A1', band: 1, maxStem: 14,
        ceiling: 'Can introduce themselves, ask and answer about where they live, people they know and things they have. Present tense, a few hundred words, sentences of about eight to fourteen words, one clause. No abstract nouns, no subordination, no idiom.',
      },
      {
        code: 'A2', label: 'CEFR A2', band: 2, maxStem: 20,
        ceiling: 'Can handle simple, routine exchanges about familiar matters: family, shopping, local geography, work. Past and future, simple connectors. Up to about twenty words. Abstract argument is above this level.',
      },
      {
        code: 'B1', label: 'CEFR B1', band: 3, maxStem: 28,
        ceiling: 'Can deal with most situations while travelling, describe experiences and give reasons and explanations. Subordinate clauses and common tenses throughout. Up to about twenty-eight words. Specialised vocabulary is still out.',
      },
      {
        code: 'B2', label: 'CEFR B2', band: 4, maxStem: 36,
        ceiling: 'Can follow technical discussion in their own field and argue a viewpoint. The subjunctive, the passive and complex sentences are fair. Ask for inference, comparison and judgement.',
      },
      {
        code: 'C1', label: 'CEFR C1', band: 5, maxStem: 48,
        ceiling: 'Can understand demanding, longer texts and recognise implicit meaning. Idiom and register are in play. An item answerable by locating a phrase is below this level.',
      },
      {
        code: 'C2', label: 'CEFR C2', band: 6, maxStem: 60,
        ceiling: 'Near-native: irony, allusion, rhetorical structure, fine distinctions of register. The item should turn on something a fluent reader could still miss.',
      },
    ],
  },
  gept: {
    name: '全民英語能力分級檢定測驗 (GEPT)',
    note: 'Taiwan\'s own English proficiency ladder, roughly A2 / B1 / B2 / C1.',
    unit: 'word',
    levels: [
      {
        code: 'elementary', label: 'GEPT 初級', band: 2, maxStem: 20,
        ceiling: 'Roughly CEFR A2, the level a Taiwanese junior-high leaver is expected to reach. The published 初級 word list is about two thousand words on everyday topics: school, family, food, shopping, weather, health, travel. Present, past and future, simple connectors, sentences of about twelve to twenty words. No idiom, no abstract argument, no academic vocabulary.',
      },
      {
        code: 'intermediate', label: 'GEPT 中級', band: 3, maxStem: 28,
        ceiling: 'Roughly CEFR B1, around four thousand words. General-interest articles, an opinion with reasons, a narrative. Relative clauses, passives and the perfect aspect are fair. Up to about twenty-eight words.',
      },
      {
        code: 'high-intermediate', label: 'GEPT 中高級', band: 4, maxStem: 36,
        ceiling: 'Roughly CEFR B2. Argument and commentary in a range of fields, inference from tone, weighing a position. Common idiom is fair. Retrieval items are too easy here.',
      },
      {
        code: 'advanced', label: 'GEPT 高級', band: 5, maxStem: 48,
        ceiling: 'Roughly CEFR C1, academic and professional English. Implicit meaning, register, argument sustained across a whole text.',
      },
    ],
  },
  jlpt: {
    name: '日本語能力試験 (JLPT)',
    note: 'Five grades from N5 up to N1. Kanji load is as much of the level as vocabulary is: a word inside the level written in kanji above it is still out of reach.',
    unit: 'char',
    levels: [
      {
        code: 'N5', label: 'JLPT N5', band: 1, maxStem: 20,
        ceiling: 'About 800 words and 100 kanji — the beginner\'s kanji only (日月人山川口手，一二三，学校先生). Topics: greetings, self-introduction, family, food, shopping, time, daily routine. です／ます throughout, は・が・を・に・で particles, い and な adjectives, past and negative. No 敬語 beyond ですます, no causative, no passive, no conditional beyond たら. Anything above N5 kanji must be in kana.',
      },
      {
        code: 'N4', label: 'JLPT N4', band: 2, maxStem: 28,
        ceiling: 'About 1,500 words and 300 kanji. Everyday conversation and simple written passages. て form, potential, volitional, plain form, から／ので, たり, ながら. Up to about twenty-eight characters. Kanji above N4 must be in kana or furigana.',
      },
      {
        code: 'N3', label: 'JLPT N3', band: 3, maxStem: 36,
        ceiling: 'About 3,700 words and 650 kanji — the bridge level. Everyday topics in newspaper headlines and ordinary articles. Passive, causative, keigo in its common forms. Up to about thirty-six characters.',
      },
      {
        code: 'N2', label: 'JLPT N2', band: 4, maxStem: 48,
        ceiling: 'About 6,000 words and 1,000 kanji. Newspapers and commentary on a range of topics, argument followed and weighed. Written register and set expressions are fair. Retrieval items are too easy here.',
      },
      {
        code: 'N1', label: 'JLPT N1', band: 5, maxStem: 65,
        ceiling: 'About 10,000 words and 2,000 kanji. Abstract and logically complex writing, editorials and criticism, implication and nuance of register. Nothing in the language is off limits.',
      },
    ],
  },
  topik: {
    name: '한국어능력시험 (TOPIK)',
    note: 'Six grades; TOPIK I covers grades 1-2 and TOPIK II covers grades 3-6.',
    unit: 'char',
    levels: [
      {
        code: '1', label: 'TOPIK 1급', band: 1, maxStem: 20,
        ceiling: 'About 800 words. Greetings, self-introduction, family, food, shopping, time, transport. 합니다 and 해요 speech levels, the basic particles 은/는, 이/가, 을/를, 에, 에서, present and past. Sentences of one clause, up to about twenty characters. No honorific 시 beyond 하세요, no indirect speech, no 하니까/느라고 style connectives.',
      },
      {
        code: '2', label: 'TOPIK 2급', band: 2, maxStem: 28,
        ceiling: 'About 1,500 to 2,000 words. Daily routine, making arrangements, using public services. 고, 지만, 아서/어서, 려고, 면 connectives; future and progressive. Up to about twenty-eight characters.',
      },
      {
        code: '3', label: 'TOPIK 3급', band: 3, maxStem: 36,
        ceiling: 'About 3,000 words. Familiar social topics handled independently, written and spoken register distinguished. Indirect speech and common honorifics are fair. Up to about thirty-six characters.',
      },
      {
        code: '4', label: 'TOPIK 4급', band: 4, maxStem: 45,
        ceiling: 'About 4,000 words. News and social issues, workplace Korean, an argument followed. Sino-Korean vocabulary and set phrases are fair. Ask for inference rather than retrieval.',
      },
      {
        code: '5', label: 'TOPIK 5급', band: 5, maxStem: 58,
        ceiling: 'Specialised and academic Korean, unfamiliar topics, formal and literary register.',
      },
      {
        code: '6', label: 'TOPIK 6급', band: 6, maxStem: 70,
        ceiling: 'Near-native: nuance, idiom, 사자성어, implication and rhetorical structure. Nothing is off limits.',
      },
    ],
  },
  ivpt: {
    name: 'Khung năng lực tiếng Việt / 越南語能力認證',
    note: 'Vietnam\'s six-level framework across three stages, recognised by Taiwan\'s Ministry of Education. It is built on the CEFR descriptors, so each level means what the CEFR level means. Diacritics are part of the word: write every tone mark.',
    unit: 'word',
    levels: [
      {
        code: 'A1', label: '越南語 A1（基礎級）', band: 1, maxStem: 14,
        ceiling: 'CEFR A1. Greetings, self-introduction, family, numbers, food, prices, time. Present tense with đã/sẽ/đang for time, classifiers, sentences of one clause and about eight to fourteen words. No abstract nouns, no subordination, no idiom.',
      },
      {
        code: 'A2', label: '越南語 A2（初級）', band: 2, maxStem: 20,
        ceiling: 'CEFR A2. Routine exchanges: shopping, transport, weather, work and study, simple feelings. Connectives vì, nên, nhưng, và. Up to about twenty words.',
      },
      {
        code: 'B1', label: '越南語 B1（中級）', band: 3, maxStem: 28,
        ceiling: 'CEFR B1. Familiar topics handled independently, experiences described, reasons given. Relative structures and reported speech are fair. Up to about twenty-eight words.',
      },
      {
        code: 'B2', label: '越南語 B2（中高級）', band: 4, maxStem: 36,
        ceiling: 'CEFR B2. News and commentary, an argued viewpoint, technical discussion in a familiar field. Ask for inference and judgement.',
      },
      {
        code: 'C1', label: '越南語 C1（高級）', band: 5, maxStem: 48,
        ceiling: 'CEFR C1. Long and demanding texts, implicit meaning, register and idiom.',
      },
      {
        code: 'C2', label: '越南語 C2（專業級）', band: 6, maxStem: 60,
        ceiling: 'CEFR C2. Near-native: irony, allusion, thành ngữ and fine distinctions of register.',
      },
    ],
  },
}

export function resolveLevel(framework: string | null, code: string | null) {
  const entry = FRAMEWORKS[framework as Framework]
  if (!entry) return null
  const level = entry.levels.find((candidate) => candidate.code === code)
  if (!level) return null
  return { framework: entry, level }
}

// How hard the question may lean on the passage's own wording.
//
// At the bottom of every framework a learner's whole vocabulary is the passage's
// vocabulary, so demanding a paraphrase produces questions they cannot read.
// Insisting on it anyway is how level-blind generators end up testing reading
// comprehension of the question rather than listening comprehension of the clip.
export function answerLeakRule(band: number) {
  if (band <= 1) {
    return [
      'The learners are at the very beginning of this language, so the question may and should reuse the passage\'s own words — asking them to decode a paraphrase would test reading, not listening.',
      'What you must still avoid is placing the answer immediately beside the question word, so that the sentence can be completed without having understood anything. Ask about a different part of the sentence from the one the answer sits in.',
    ].join(' ')
  }
  if (band <= 3) {
    return [
      'Rephrase the question rather than quoting the passage: a stem lifted word for word lets a learner match strings instead of understanding.',
      'Short shared phrases are acceptable where no simpler wording exists, but the clause containing the answer must not appear in the question.',
    ].join(' ')
  }
  return [
    'The question must not contain any content word from the answer, and must require the learner to infer, connect or summarise rather than retrieve.',
    'Quoting the passage in the stem at this level makes the item worthless.',
  ].join(' ')
}

// What the generator is told, and what it is checked against afterwards. The
// stem limit is returned rather than only described because a limit stated in
// prose is a request: see stemLengthComplaint below.
export function levelCeiling(framework: string | null, code: string | null) {
  const resolved = resolveLevel(framework, code)
  if (!resolved) return null
  return { unit: resolved.framework.unit, maxStem: resolved.level.maxStem, label: resolved.level.label }
}

export function levelInstruction(framework: string | null, code: string | null) {
  const resolved = resolveLevel(framework, code)
  if (!resolved) {
    return 'No proficiency level was set for this class, so write for an intermediate learner and keep the wording plain.'
  }
  const { framework: entry, level } = resolved
  const unit = entry.unit === 'char' ? 'characters' : 'words'
  return [
    `LEVEL. The class is working at ${level.label}, on the ${entry.name} scale. This is the hardest constraint on the whole task: an item above the level is worthless to this class however good a question it is, because they cannot read it.`,
    entry.note,
    `What a learner at ${level.label} can read: ${level.ceiling}`,
    `Keep every question stem to at most ${level.maxStem} ${unit}, and keep each option shorter than the stem.`,
    SOURCE_ABOVE_LEVEL,
    STAY_AT_LEVEL,
    `Before you answer, read each item back and ask whether a learner at ${level.label} — and no higher — could read every word of the stem, the options and the answer. Rewrite any item that fails, and rewrite it downwards rather than trimming it.`,
    answerLeakRule(level.band),
  ].join('\n')
}

// Sent back to the model when the check above fails, naming what broke rather
// than repeating the whole instruction: the second attempt is cheap and it
// lands, where a generic "try again" tends to return the same thing.
export function stemLengthComplaint(
  framework: string | null,
  code: string | null,
  offenders: Array<{ index: number; length: number }>,
) {
  const ceiling = levelCeiling(framework, code)
  if (!ceiling || !offenders.length) return ''
  const unit = ceiling.unit === 'char' ? 'characters' : 'words'
  const list = offenders.map(({ index, length }) => `item ${index + 1} (${length})`).join(', ')
  return [
    `Your previous attempt broke the ${ceiling.maxStem}-${unit.slice(0, -1)} limit for ${ceiling.label}: ${list}.`,
    'A stem that long is a sign the item is pitched above the class, not merely worded at length — so simplify what the item asks, do not just cut words out of the sentence.',
    `Rewrite every item to sit at ${ceiling.label}, with no stem longer than ${ceiling.maxStem} ${unit}.`,
  ].join(' ')
}

// Characters for Chinese, Japanese and Korean; words elsewhere. Punctuation and
// whitespace are not the difficulty, so neither is counted.
export function stemLength(text: string, unit: 'char' | 'word') {
  if (unit === 'word') return text.trim().split(/\s+/).filter(Boolean).length
  return [...text.replace(/[\s\p{P}\p{S}]/gu, '')].length
}
