// Every modal has to tell the desktop window to grow.
//
//   node scripts/check-presenter-modals.mjs
//
// The presenter window is 194x242 while it is collapsed. A modal opened without
// setPresenterExpanded being told about it is rendered into that, which is not
// a small dialog — it is a column three characters wide with its own scrollbars,
// and 閱讀與測驗 shipped that way.
//
// The condition is one boolean OR of every *Open state, and adding a state
// without adding it there is invisible until someone opens the thing on a
// desktop. So the states are counted instead.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const file = path.join(root, 'src/routes/PresenterPage.tsx')
const source = fs.readFileSync(file, 'utf8')

// States that deliberately do not grow the window. selectionMode is the screen
// capture, which takes over the whole screen by itself.
const EXEMPT = new Set([])

const states = [...source.matchAll(/const \[([a-zA-Z]+Open), set[A-Za-z]+\] = useState/g)].map((m) => m[1])
const call = source.match(/setPresenterExpanded\(([\s\S]*?)\n {4}\)/)
if (!call) {
  console.error('check-presenter-modals: setPresenterExpanded call not found — this check needs updating.')
  process.exit(1)
}

const missing = states.filter((state) => !EXEMPT.has(state) && !call[1].includes(state))
if (missing.length) {
  console.error(`PresenterPage: ${missing.length} modal state(s) that never grow the window.\n`)
  for (const state of missing) {
    console.error(`  ${state} is not in the setPresenterExpanded condition.`)
  }
  console.error('\nA modal opened while the window is collapsed renders into 194x242.')
  process.exit(1)
}
console.log(`PresenterPage: ${states.length} modal states, every one of them grows the window.`)
