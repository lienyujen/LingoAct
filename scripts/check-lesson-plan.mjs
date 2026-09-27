// 授課錦囊 has to be able to start everything the activity menu can start.
//
// It drifted once already: the menu grew to thirteen activities while the plan
// still listed eight of the names it had been born with, so a teacher who
// planned a lesson could not plan the reading, the pronunciation or the
// matching they had just used. The plan now builds its list from ACTIVITIES, so
// the names cannot disagree — but a name in a list is not an activity that
// opens. That is what this checks: every id in the library, and every tool the
// plan offers, reaches a case in openActivity.
import fs from 'node:fs'

// Read with line endings normalised. A Windows checkout writes CRLF, so a
// pattern containing "\n" matches locally and not on the runner — which is
// exactly how this file failed a release while passing on the machine that
// wrote it.
const read = (path) => fs.readFileSync(path, 'utf8').split('\r\n').join('\n')

const library = read('src/lib/activities.tsx')
const plan = read('src/components/LessonPlan.tsx')
const presenter = read('src/routes/PresenterPage.tsx')

const problems = []

// Every id the menu can show.
const ids = [...library.matchAll(/\{\s*id:\s*'([a-zA-Z]+)',\s*label:/g)].map((match) => match[1])
if (ids.length < 5) problems.push(`could not read ACTIVITIES from src/lib/activities.tsx (found ${ids.length})`)

// Every tool the plan adds on top of them.
const toolBlock = plan.match(/export type ToolKind =([^\n]*(?:\n\s*\|[^\n]*)*)/)
const tools = toolBlock ? [...toolBlock[1].matchAll(/'([a-zA-Z]+)'/g)].map((match) => match[1]) : []
if (!tools.length) problems.push('could not read ToolKind from src/components/LessonPlan.tsx')

// Every kind openActivity actually handles.
const switchBlock = presenter.match(/function openActivity\([\s\S]*?\n  \}\n/)
if (!switchBlock) {
  problems.push('could not find openActivity in src/routes/PresenterPage.tsx')
} else {
  const handled = new Set([...switchBlock[0].matchAll(/case '([a-zA-Z]+)':/g)].map((match) => match[1]))
  for (const id of [...ids, ...tools]) {
    if (!handled.has(id)) problems.push(`openActivity has no case for '${id}' — the plan can list it but not open it`)
  }
  for (const id of handled) {
    if (!ids.includes(id) && !tools.includes(id)) problems.push(`openActivity handles '${id}', which is neither an activity nor a tool`)
  }
}

// The plan's own list has to come from the library rather than a second copy.
if (!plan.includes('ACTIVITIES.map((activity) => activity.id)')) {
  problems.push('LessonPlan no longer derives its kinds from ACTIVITIES — the two lists can drift again')
}

if (problems.length) {
  console.error('lesson plan:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`lesson plan: ${ids.length} activities and ${tools.length} tools, every one of them opens.`)
