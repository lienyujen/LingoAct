import { ENGLISH_VOCABULARY, ENGLISH_CEFR } from './english-vocabulary.generated.ts'

const index = new Map(ENGLISH_VOCABULARY.map((row) => [row[0].toLowerCase(), row]))
// Optional suffixes such as agree(ment) refer back to the same source row.
// Exact independently listed forms always keep their own authoritative band.
for (const row of ENGLISH_VOCABULARY) {
  const optional = row[0].match(/^([a-z]+)\(([a-z]+)\)$/i)
  if (!optional) continue
  for (const form of [optional[1], optional[1] + optional[2]]) {
    if (!index.has(form.toLowerCase())) index.set(form.toLowerCase(), row)
  }
}

export function englishWord(text: string) {
  const word = text.toLowerCase().replaceAll('’', "'")
  const exact = index.get(word)
  if (exact) return exact
  // These are lookup candidates, not a linguistic claim that all endings have
  // one meaning. The spelling itself must exist in the attributed lexicon.
  const forms = word.endsWith('ies') ? [word.slice(0,-3)+'y']
    : word.endsWith('ing') ? [word.slice(0,-3), word.slice(0,-3)+'e', word.slice(0,-4)]
      : word.endsWith('ed') ? [word.slice(0,-2), word.slice(0,-1), word.slice(0,-3)]
        : word.endsWith('s') ? [word.slice(0,-1), word.slice(0,-2)] : []
  return forms.map((form) => index.get(form)).find(Boolean)
}

export function englishWords(text: string) {
  return [...text.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*|\s+|[^A-Za-z\s]/gu)]
    .map((match) => ({ text:match[0], pinyin:'' }))
}

export function englishVocabularyInstruction(framework: string | null, code: string | null, direction = '') {
  const school = framework === 'en108'
  if (school) code = code?.split('-')[0] || null
  const topics = new Set(direction.toLowerCase().match(/[a-z]+/g) || [])
  const ceiling = school ? (code?.startsWith('h') ? 4 : code === 'v' ? 3 : 2) : 0
  const candidates = ENGLISH_VOCABULARY.filter((row) =>
    (school ? (code?.startsWith('p') ? row[2] : code?.startsWith('j') ? row[2] || row[3] : row[1] > 0 && row[1] <= ceiling) : row[2])
      && (topics.size === 0 || topics.has(row[0]) || row[4].some((topic) => [...topics].some((word) => topic.includes(word)))))
  const examples = topics.size ? candidates.slice(0, 30).map((row) => row[0]) : []
  return [
    'ENGLISH TEACHING: Use the selected framework directly; school stages and CEEC bands are not CEFR, GEPT or Lexile equivalents. CEEC has six reference bands, not six school years. Do not claim an official Lexile measure without licensed measurement.',
    school ? 'Use the Taiwan English curriculum, its common-word reference and CEEC vocabulary. Primary targets are oral use of at least 300 words and writing at least 180 by graduation; junior high at least 1200 words, with the common 2000-word list for extension. These totals are not a ceiling on every child or a CEFR conversion.' : 'CEFR, GEPT and TOEIC difficulty follows the selected ability or exam specification. Do not manufacture an official vocabulary-band conversion.',
    framework === 'cefr' ? `CEFR skill goals (editorial summaries of official descriptors): ${JSON.stringify(ENGLISH_CEFR.find(level => level.code === code)?.skills || {})}` : '',
    examples.length ? `Some source-backed familiar lexical anchors (not an exhaustive allowed list): ${examples.join(', ')}.` : '',
    'Use context, word families, natural collocations, word stress and connected speech. Teacher-selected words and sentence patterns take priority. Keep prompts, answers and scaffolds in English; explanation language is independent. Classroom AI scores are not official exam scores.',
  ].filter(Boolean).join('\n')
}

export function englishReadingTargets(framework: string | null, code: string | null, stretch: number) {
  const difficulty = framework === 'en108' && code?.endsWith('-foundation') ? .8 : framework === 'en108' && code?.endsWith('-advanced') ? 1.15 : 1
  if (framework === 'en108') code = code?.split('-')[0] || null
  const count = framework === 'en108' ? ({p34:40,p56:70,j:140,j7:95,j8:120,j9:150,h:240,h1:180,h2:220,h3:260,v:180}[code || ''] || 140)
    : ({'Pre-A1':35,A1:65,A2:120,B1:210,B2:320,C1:450,C2:550,elementary:120,intermediate:210,'high-intermediate':320,advanced:450,orange:65,brown:120,green:210,blue:320,gold:450}[code || ''] || 200)
  return { min: Math.round(count * .7 * difficulty), max:Math.round(count * difficulty * (1.2 + Math.min(2,Math.max(0,stretch)) * .15)) }
}

export function englishNewWords(text: string, framework: string | null, code: string | null) {
  if (framework === 'en108') code = code?.split('-')[0] || null
  const seen = new Set<string>()
  // Editorial stop words prevent glossing "the" and "we" as new vocabulary.
  // This is a display policy, never an official CEFR/GEPT vocabulary mapping.
  const functionWords = new Set('a an the i me my mine we us our ours you your yours he him his she her hers it its they them their theirs this that these those am is are was were be been being do does did have has had and or but if so as at by for from in into of on to with not no yes can could will would shall should may might must who what when where why how'.split(' '))
  return englishWords(text).filter((token) => /^[A-Za-z]/.test(token.text)).flatMap(({text:word}) => {
    const identity = word.toLowerCase()
    if (seen.has(identity) || functionWords.has(identity)) return []
    seen.add(identity)
    const found = englishWord(word)
    const known = framework === 'en108' && found && (code?.startsWith('p') ? found[2]
      : code?.startsWith('j') ? found[2] || found[3] : found[2] || found[3] || (found[1] > 0 && found[1] < (code?.startsWith('h') ? 4 : 3)))
    return known ? [] : [{word,level:found?.[1] || 0}]
  })
}
