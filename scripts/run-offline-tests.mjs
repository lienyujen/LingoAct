import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
const live = new Set(['test-reading-review.mjs', 'test-teaching-cycles.mjs', 'test-screenshot-interactions.mjs', 'test-mandarin-speech.mjs', 'test-mandarin-accents.mjs', 'test-english-live.mjs'])
const files = (await readdir(new URL('.', import.meta.url)))
  .filter(name => /^test-.*\.mjs$/.test(name) && !live.has(name))
  .sort().map(name => `scripts/${name}`)
const child = spawn(process.execPath, ['--test', ...files], { stdio: 'inherit' })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
