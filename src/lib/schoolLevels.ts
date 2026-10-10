export const SCHOOL_STAGES = [
  { code: 'p34', label: '國小三、四年級' }, { code: 'p56', label: '國小五、六年級' },
  { code: 'j', label: '國中' }, { code: 'h', label: '普通高中' }, { code: 'v', label: '技術型高中' },
]
export const SCHOOL_GRADES: Record<string, { code: string; label: string }[]> = {
  j: [{ code: 'j7', label: '七年級' }, { code: 'j8', label: '八年級' }, { code: 'j9', label: '九年級' }],
  h: [{ code: 'h1', label: '高一' }, { code: 'h2', label: '高二' }, { code: 'h3', label: '高三' }],
}
export function schoolStage(code: string) {
  const base = code.split('-')[0]
  return /^j[789]$/.test(base) ? 'j' : /^h[123]$/.test(base) ? 'h' : base
}
export function schoolDifficulty(code: string) {
  return code.endsWith('-foundation') ? 'foundation' : code.endsWith('-advanced') ? 'advanced' : 'standard'
}
export function schoolLevelCode(base: string, difficulty: string) {
  return difficulty === 'standard' ? base : `${base}-${difficulty}`
}
