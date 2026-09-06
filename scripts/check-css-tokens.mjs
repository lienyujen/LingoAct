// Fails if src/index.css reads a custom property nothing ever sets.
//
//   node scripts/check-css-tokens.mjs
//
// A var(--x) naming a property with no declaration is not an error anyone sees:
// the whole declaration is discarded and the element inherits instead. A
// background quietly goes transparent, a colour quietly goes black, a shadow
// quietly disappears. Renaming the palette left four of these behind and they
// went unnoticed until a panel turned up flat white on white.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')

const declared = new Set()
for (const match of css.matchAll(/^\s*(--[\w-]+)\s*:/gm)) declared.add(match[1])

// Some properties are set per element from React rather than in the stylesheet.
function collectInlineProperties(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectInlineProperties(full)
    else if (/\.tsx?$/.test(entry.name)) {
      for (const match of fs.readFileSync(full, 'utf8').matchAll(/['"](--[\w-]+)['"]\s*:/g)) {
        declared.add(match[1])
      }
    }
  }
}
collectInlineProperties(path.join(root, 'src'))

// var(--x, fallback) survives a missing --x, so only the bare form can bite.
const used = new Set()
for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) used.add(match[1])

const missing = [...used].filter((name) => !declared.has(name)).sort()
if (!missing.length) {
  console.log(`OK  ${used.size} custom properties referenced, all of them set`)
  process.exit(0)
}

console.error(`${missing.length} custom propert${missing.length === 1 ? 'y is' : 'ies are'} read but never set:`)
const lines = css.split('\n')
for (const name of missing) {
  const at = lines
    .map((line, index) => (line.includes(`var(${name})`) ? index + 1 : 0))
    .filter(Boolean)
  console.error(`  ${name}  src/index.css:${at.join(', ')}`)
}
process.exit(1)
