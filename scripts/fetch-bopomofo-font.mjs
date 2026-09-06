// Fetches the Bopomofo IVS font the desktop app subsets per clip.
//
//   node scripts/fetch-bopomofo-font.mjs
//
// Kept out of git deliberately: it is 17 MB of binary that would sit in every
// clone and every history rewrite for ever. The packaging step and anyone
// building the desktop app runs this once; the file lands in resources/fonts/,
// which .gitignore covers.
//
// 字嗨標楷注音體, from ButTaiwan/bpmfvs, Apache License 2.0. The licence and
// NOTICE are downloaded alongside it because Apache 2.0 requires both to travel
// with the binary.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'resources', 'fonts')
const base = 'https://raw.githubusercontent.com/ButTaiwan/bpmfvs/master'

const files = [
  { from: `${base}/fonts/BpmfZihiKaiStd-Regular.ttf`, to: 'BpmfZihiKaiStd-Regular.ttf' },
  { from: `${base}/LICENSE-2.0.txt`, to: 'LICENSE-2.0.txt' },
  { from: `${base}/NOTICE.txt`, to: 'NOTICE.txt' },
]

fs.mkdirSync(outDir, { recursive: true })

for (const file of files) {
  const target = path.join(outDir, file.to)
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`have  ${file.to} (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB)`)
    continue
  }
  process.stdout.write(`fetch ${file.to} ... `)
  const response = await fetch(file.from)
  if (!response.ok) throw new Error(`${response.status} fetching ${file.from}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(target, bytes)
  console.log(`${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
}

console.log(`\nready in ${path.relative(root, outDir)}`)
