// The level a class is working at, in the vocabulary its teacher already uses.
//
// Every framework here is widely published and the model knows them by name, so
// the prompt names the level rather than translating it into CEFR first. That
// translation is where accuracy goes: TBCL levels 1 and 2 sit *below* CEFR A1
// for listening, reading and writing, so rendering them as "A1" would silently
// ask for material too hard for the very learners who need it easiest.

export type Framework = 'tbcl' | 'grade' | 'cefr' | 'gept' | 'jlpt' | 'topik' | 'ivpt'

export type Level = {
  code: string
  label: string
  // A coarse ordinal, 0 (below CEFR A1) to 6 (CEFR C2). Used only to decide how
  // strict the answer-leak rule can reasonably be — not as a claim that any two
  // frameworks line up exactly at the same number.
  band: number
}

export const FRAMEWORKS: Record<Framework, { name: string; note: string; levels: Level[] }> = {
  // 國語: Mandarin taught to children who already speak it. The band here
  // tracks reading and writing load, not spoken command — a first-grader
  // converses fluently and reads a few hundred characters, so a question they
  // could answer aloud can still be unreadable on the page.
  grade: {
    name: '十二年國民基本教育・國語文（年級）',
    note: 'Taiwan\'s school-year ladder for Mandarin taught as a FIRST language. These are native speakers: do not simplify the spoken language as though for a foreign learner, and never explain what a common word means. What rises with the year is the characters they can read and the length and abstraction of what they can write.',
    levels: [
      { code: 'g1', label: '國小一年級', band: 1 },
      { code: 'g2', label: '國小二年級', band: 2 },
      { code: 'g3', label: '國小三年級', band: 3 },
      { code: 'g4', label: '國小四年級', band: 3 },
      { code: 'g5', label: '國小五年級', band: 4 },
      { code: 'g6', label: '國小六年級', band: 4 },
      { code: 'j1', label: '國中七年級', band: 5 },
      { code: 'j2', label: '國中八年級', band: 5 },
      { code: 'j3', label: '國中九年級', band: 6 },
    ],
  },
  tbcl: {
    name: '臺灣華語文能力基準 (TBCL)',
    note: 'Taiwan\'s national benchmarks for Chinese as a second language, three stages across seven levels. Levels 1 and 2 are below CEFR A1; do not treat them as A1.',
    levels: [
      { code: '1', label: 'TBCL 第1級（基礎）', band: 0 },
      { code: '2', label: 'TBCL 第2級（基礎）', band: 0 },
      { code: '3', label: 'TBCL 第3級（基礎）', band: 1 },
      { code: '4', label: 'TBCL 第4級（進階）', band: 2 },
      { code: '5', label: 'TBCL 第5級（進階）', band: 3 },
      { code: '6', label: 'TBCL 第6級（精熟）', band: 4 },
      { code: '7', label: 'TBCL 第7級（精熟）', band: 5 },
    ],
  },
  cefr: {
    name: 'CEFR',
    note: 'The Common European Framework, used in Taiwan for French, German and Spanish, and as the spine the other frameworks map onto.',
    levels: [
      { code: 'A1', label: 'CEFR A1', band: 1 },
      { code: 'A2', label: 'CEFR A2', band: 2 },
      { code: 'B1', label: 'CEFR B1', band: 3 },
      { code: 'B2', label: 'CEFR B2', band: 4 },
      { code: 'C1', label: 'CEFR C1', band: 5 },
      { code: 'C2', label: 'CEFR C2', band: 6 },
    ],
  },
  gept: {
    name: '全民英語能力分級檢定測驗 (GEPT)',
    note: 'Taiwan\'s own English proficiency ladder, roughly A2 / B1 / B2 / C1.',
    levels: [
      { code: 'elementary', label: 'GEPT 初級', band: 2 },
      { code: 'intermediate', label: 'GEPT 中級', band: 3 },
      { code: 'high-intermediate', label: 'GEPT 中高級', band: 4 },
      { code: 'advanced', label: 'GEPT 高級', band: 5 },
    ],
  },
  jlpt: {
    name: '日本語能力試験 (JLPT)',
    note: 'Five grades from N5 up to N1.',
    levels: [
      { code: 'N5', label: 'JLPT N5', band: 1 },
      { code: 'N4', label: 'JLPT N4', band: 2 },
      { code: 'N3', label: 'JLPT N3', band: 3 },
      { code: 'N2', label: 'JLPT N2', band: 4 },
      { code: 'N1', label: 'JLPT N1', band: 5 },
    ],
  },
  topik: {
    name: '한국어능력시험 (TOPIK)',
    note: 'Six grades; TOPIK I covers grades 1-2 and TOPIK II covers grades 3-6.',
    levels: [
      { code: '1', label: 'TOPIK 1급', band: 1 },
      { code: '2', label: 'TOPIK 2급', band: 2 },
      { code: '3', label: 'TOPIK 3급', band: 3 },
      { code: '4', label: 'TOPIK 4급', band: 4 },
      { code: '5', label: 'TOPIK 5급', band: 5 },
      { code: '6', label: 'TOPIK 6급', band: 6 },
    ],
  },
  ivpt: {
    name: 'Khung năng lực tiếng Việt / 越南語能力認證',
    note: 'Vietnam\'s six-level framework across three stages, recognised by Taiwan\'s Ministry of Education.',
    levels: [
      { code: 'A1', label: '越南語 A1（基礎級）', band: 1 },
      { code: 'A2', label: '越南語 A2（初級）', band: 2 },
      { code: 'B1', label: '越南語 B1（中級）', band: 3 },
      { code: 'B2', label: '越南語 B2（中高級）', band: 4 },
      { code: 'C1', label: '越南語 C1（高級）', band: 5 },
      { code: 'C2', label: '越南語 C2（專業級）', band: 6 },
    ],
  },
}

// Which framework a teacher of each language will already be thinking in.
export const DEFAULT_FRAMEWORK: Record<string, Framework> = {
  'zh-tw': 'tbcl',
  'zh-cn': 'tbcl',
  en: 'gept',
  ja: 'jlpt',
  ko: 'topik',
  vi: 'ivpt',
  fr: 'cefr',
  de: 'cefr',
  es: 'cefr',
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

export function levelInstruction(framework: string | null, code: string | null) {
  const resolved = resolveLevel(framework, code)
  if (!resolved) {
    return 'No proficiency level was set for this class, so write for an intermediate learner and keep the wording plain.'
  }
  const { framework: entry, level } = resolved
  return [
    `The class is working at ${level.label}, on the ${entry.name} scale. ${entry.note}`,
    `Write every question, option and instruction at ${level.label}. Vocabulary and sentence length outside that level make the item untestable even when the listening itself was understood.`,
    answerLeakRule(level.band),
  ].join('\n')
}
