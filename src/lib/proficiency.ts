// The level pickers, in the vocabulary each teacher already uses.
//
// Labels only. How a level should shape a generated question lives in
// supabase/functions/_shared/proficiency.ts and stays there: it is prompt
// material, the client never needs it, and one copy cannot drift from itself.

export type Framework = 'tbcl' | 'tocfl' | 'guoyu108' | 'en108' | 'gept' | 'toeic' | 'cefr' | 'jlpt' | 'topik' | 'ivpt'

export const FRAMEWORKS: { id: Framework; name: string; short: string; levels: { code: string; label: string }[] }[] = [
  {
    // 國語文 under the 108 curriculum: 國語 in 國小, 國文 from 國中 up. The pupils
    // already speak the language, so what moves year to year is what they can
    // read and write, which is why this is a year ladder and not a test.
    id: 'guoyu108',
    name: '十二年國教・國語文',
    short: '108課綱',
    levels: [
      { code: 'g1', label: '國小一年級' },
      { code: 'g2', label: '國小二年級' },
      { code: 'g3', label: '國小三年級' },
      { code: 'g4', label: '國小四年級' },
      { code: 'g5', label: '國小五年級' },
      { code: 'g6', label: '國小六年級' },
      { code: 'j1', label: '國中七年級' },
      { code: 'j2', label: '國中八年級' },
      { code: 'j3', label: '國中九年級' },
      { code: 'h1', label: '高中一年級' },
      { code: 'h2', label: '高中二年級' },
      { code: 'h3', label: '高中三年級' },
    ],
  },
  {
    id: 'tbcl',
    name: '臺灣華語文能力基準 TBCL',
    short: 'TBCL',
    levels: [
      { code: '1', label: '第1級・基礎' },
      { code: '2', label: '第2級・基礎' },
      { code: '3', label: '第3級・基礎' },
      { code: '4', label: '第4級・進階' },
      { code: '5', label: '第5級・進階' },
      { code: '6', label: '第6級・精熟' },
      { code: '7', label: '第7級・精熟' },
    ],
  },
  {
    // The test TBCL's learners actually sit: 四等八級, with 準備級 below A1 for
    // people who have only just started.
    id: 'tocfl',
    name: '華語文能力測驗 TOCFL',
    short: 'TOCFL',
    levels: [
      { code: 'novice1', label: '準備級一級' },
      { code: 'novice2', label: '準備級二級' },
      { code: 'level1', label: '入門級・A1' },
      { code: 'level2', label: '基礎級・A2' },
      { code: 'level3', label: '進階級・B1' },
      { code: 'level4', label: '高階級・B2' },
      { code: 'level5', label: '流利級・C1' },
      { code: 'level6', label: '精通級・C2' },
    ],
  },
  {
    // 英語文 under the 108 curriculum, which begins in 國小三年級.
    id: 'en108',
    name: '十二年國教・英語文',
    short: '108課綱',
    levels: [
      { code: 'p34', label: '國小三、四年級' },
      { code: 'p56', label: '國小五、六年級' },
      { code: 'j', label: '國中' },
      { code: 'h', label: '高中' },
    ],
  },
  {
    id: 'gept',
    name: '全民英檢 GEPT',
    short: 'GEPT',
    levels: [
      { code: 'elementary', label: '初級' },
      { code: 'intermediate', label: '中級' },
      { code: 'high-intermediate', label: '中高級' },
      { code: 'advanced', label: '高級' },
    ],
  },
  {
    // Named by the certificate colours, which is how a Taiwanese class talks
    // about a TOEIC target.
    id: 'toeic',
    name: '多益 TOEIC',
    short: 'TOEIC',
    levels: [
      { code: 'orange', label: '橘色 10–215' },
      { code: 'brown', label: '棕色 220–465' },
      { code: 'green', label: '綠色 470–725' },
      { code: 'blue', label: '藍色 730–855' },
      { code: 'gold', label: '金色 860–990' },
    ],
  },
  {
    id: 'jlpt',
    name: '日本語能力試驗 JLPT',
    short: 'JLPT',
    levels: [
      { code: 'N5', label: 'N5' },
      { code: 'N4', label: 'N4' },
      { code: 'N3', label: 'N3' },
      { code: 'N2', label: 'N2' },
      { code: 'N1', label: 'N1' },
    ],
  },
  {
    id: 'topik',
    name: '韓國語文能力測驗 TOPIK',
    short: 'TOPIK',
    levels: [
      { code: '1', label: '1급' },
      { code: '2', label: '2급' },
      { code: '3', label: '3급' },
      { code: '4', label: '4급' },
      { code: '5', label: '5급' },
      { code: '6', label: '6급' },
    ],
  },
  {
    id: 'cefr',
    name: 'CEFR',
    short: 'CEFR',
    levels: [
      { code: 'A1', label: 'A1' },
      { code: 'A2', label: 'A2' },
      { code: 'B1', label: 'B1' },
      { code: 'B2', label: 'B2' },
      { code: 'C1', label: 'C1' },
      { code: 'C2', label: 'C2' },
    ],
  },
  {
    id: 'ivpt',
    name: '越南語能力認證',
    short: '越檢',
    levels: [
      { code: 'A1', label: 'A1・基礎級' },
      { code: 'A2', label: 'A2・初級' },
      { code: 'B1', label: 'B1・中級' },
      { code: 'B2', label: 'B2・中高級' },
      { code: 'C1', label: 'C1・高級' },
      { code: 'C2', label: 'C2・專業級' },
    ],
  },
]

export function frameworkById(id: string) {
  return FRAMEWORKS.find((framework) => framework.id === id)
}

export function levelLabel(frameworkId: string | null, code: string | null) {
  if (!frameworkId || !code) return ''
  const framework = frameworkById(frameworkId)
  const level = framework?.levels.find((candidate) => candidate.code === code)
  if (!framework || !level) return ''
  // A year or a certificate colour already says what it is; a test grade needs
  // the test's name in front of it to mean anything on a report.
  if (framework.id === 'guoyu108' || framework.id === 'en108' || framework.id === 'toeic') return level.label
  if (framework.id === 'tbcl') return `TBCL ${level.label.split('・')[0]}`
  if (framework.id === 'tocfl') return `TOCFL ${level.label.split('・')[0]}`
  return `${framework.short} ${level.label}`
}
