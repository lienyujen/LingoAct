// Anything the AI writes for a class has to be written at that class's level.
//
// This was not true, and it was invisible: the Exit Ticket every student reads
// was generated with no level at all, 下一步教學 sent the class a prompt built
// from a bare level_code with no framework beside it, and a 電寫題 was marked
// against no stated standard unless it happened to carry a 拍照描述. Each looked
// fine in isolation. What they had in common was that nobody could see the list.
//
// So here is the list. Every file that calls the model is either enforcing the
// level or exempt with a reason written down, and a new one is neither until
// someone says which — which is the point: the decision gets made on purpose.
import fs from 'node:fs'
import path from 'node:path'

// Read with line endings normalised. A Windows checkout writes CRLF, so a
// pattern containing "\n" matches locally and not on the runner — which is
// exactly how this file failed a release while passing on the machine that
// wrote it.
const read = (path) => fs.readFileSync(path, 'utf8').split('\r\n').join('\n')

const ROOT = 'supabase/functions'

// Exempt, and why. "It does not generate anything a student reads" is the only
// argument that works here; "it seemed fine" is not one.
const EXEMPT = {
  '_shared/ai.ts': 'the transport itself — it carries prompts, it does not write them',
  '_shared/listening.ts': 'text-to-speech and karaoke timings; the words are decided before it is called',
  '_shared/custom-quiz.ts': 'takes the level from its caller as extraInstruction, and every caller is checked below',
  '_shared/file-analysis.ts': 'marks against the level its caller supplies as classInstruction; presenter-action builds it for every submission',
  '_shared/audio-analysis.ts': 'scores against the level its caller supplies as classInstruction; participant-action builds it for every recording',
  'annotate-reading/index.ts': 'decides how a character is pronounced, which is the same at every level',
  'gemini-caption-relay/index.ts': 'transcribes the teacher speaking live; the words are the teacher’s',
  'analyze-question/index.ts': 'reads the class’s answers back to the teacher; nothing here reaches a student',
  'analyze-session/index.ts': 'the after-class report, written for the teacher',
}

const files = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
}
walk(ROOT)

const problems = []
const enforcing = []

for (const file of files) {
  const source = read(file)
  const callsModel = /callAiJson|requestGemini|generativelanguage/.test(source)
  if (!callsModel) continue

  const key = path.relative(ROOT, file).split(path.sep).join('/')
  const enforces = source.includes('levelInstruction')

  if (enforces) { enforcing.push(key); continue }
  if (key in EXEMPT) continue
  problems.push(`${key} calls the model but neither uses levelInstruction nor is listed as exempt in ${path.basename(import.meta.filename)}`)
}

// An exemption for a file that has since started enforcing, or that no longer
// calls the model at all, is a note that has stopped being true.
for (const key of Object.keys(EXEMPT)) {
  const full = path.join(ROOT, key)
  if (!fs.existsSync(full)) { problems.push(`${key} is listed as exempt but does not exist`); continue }
  const source = read(full)
  if (!/callAiJson|requestGemini|generativelanguage/.test(source)) {
    problems.push(`${key} is listed as exempt but no longer calls the model — drop the entry`)
  } else if (source.includes('levelInstruction')) {
    problems.push(`${key} is listed as exempt but now uses levelInstruction — drop the entry`)
  }
}

// Three modules are exempt only because whoever calls them supplies the level.
// That is a claim about the callers, so it is checked rather than believed: an
// exemption nobody verifies is how 電寫題 came to be marked against nothing.
const DELEGATES = [
  { call: 'generateCustomQuiz(', own: '_shared/custom-quiz.ts', carries: /levelInstruction\(/g },
  { call: 'analyzeFileResponse(', own: '_shared/file-analysis.ts', carries: /classInstruction/g },
  { call: 'analyzeAudioResponse(', own: '_shared/audio-analysis.ts', carries: /classInstruction/g },
]

for (const file of files) {
  const source = read(file)
  const key = path.relative(ROOT, file).split(path.sep).join('/')
  for (const { call, own, carries } of DELEGATES) {
    if (key === own) continue
    const calls = source.split(call).length - 1
    if (!calls) continue
    const supplied = (source.match(carries) || []).length
    if (supplied < calls) {
      problems.push(`${key} calls ${call.slice(0, -1)} ${calls}× but supplies the class level only ${supplied}× — that call would run against no level at all`)
    }
  }
}

if (problems.length) {
  console.error('level enforcement:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`level enforcement: ${enforcing.length} generators hold the class level, ${Object.keys(EXEMPT).length} exempt with a reason.`)
