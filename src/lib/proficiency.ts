// The level pickers, in the vocabulary each teacher already uses.
//
// Labels only. How a level should shape a generated question lives in
// supabase/functions/_shared/proficiency.ts and stays there: it is prompt
// material, the client never needs it, and one copy cannot drift from itself.

export type Framework = 'tbcl' | 'cefr' | 'gept' | 'jlpt' | 'topik' | 'ivpt'

export const FRAMEWORKS: { id: Framework; name: string; levels: { code: string; label: string }[] }[] = [
  {
    id: 'tbcl',
    name: '臺灣華語文能力基準 TBCL',
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
    id: 'gept',
    name: '全民英檢 GEPT',
    levels: [
      { code: 'elementary', label: '初級' },
      { code: 'intermediate', label: '中級' },
      { code: 'high-intermediate', label: '中高級' },
      { code: 'advanced', label: '高級' },
    ],
  },
  {
    id: 'jlpt',
    name: '日本語能力試驗 JLPT',
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
    name: 'CEFR（法語・德語・西語）',
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

// Which ladder a teacher of each language is already thinking in, so the picker
// opens on the right one rather than making them find it every time.
const byLanguage: Record<string, Framework> = {
  'zh-tw': 'tbcl',
  en: 'gept',
  ja: 'jlpt',
  ko: 'topik',
  vi: 'ivpt',
  fr: 'cefr',
  de: 'cefr',
  es: 'cefr',
}

export function defaultFramework(teachingLanguage: string): Framework {
  return byLanguage[teachingLanguage] || 'cefr'
}

export function frameworkById(id: string) {
  return FRAMEWORKS.find((framework) => framework.id === id)
}

export function levelLabel(frameworkId: string | null, code: string | null) {
  if (!frameworkId || !code) return ''
  const framework = frameworkById(frameworkId)
  const level = framework?.levels.find((candidate) => candidate.code === code)
  if (!framework || !level) return ''
  return framework.id === 'tbcl' ? `TBCL ${level.label.split('・')[0]}` : `${framework.name.split('（')[0].split(' ').at(-1)} ${level.label}`
}
