// Builds the app into ./LingoAct/ as a plain folder you can run directly:
// double-click LingoAct/LingoAct.exe and it starts in about two seconds.
//
//   pnpm desktop:folder
//
// Deliberately NOT a release. The portable .exe and the .zip that release.yml
// ships are built without a .env so each teacher supplies their own project;
// this one bakes in whatever .env holds, which is the development backend, and
// is gitignored so it never leaves the machine.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'LingoAct')
const staging = path.join(root, 'release')

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

run('pnpm', ['build'])
// --dir stops at the unpacked folder: no portable exe, no zip, no installer.
run('npx', ['electron-builder', '--win', '--x64', '--dir'])

const unpacked = path.join(staging, 'win-unpacked')
if (!fs.existsSync(unpacked)) throw new Error(`electron-builder produced no ${unpacked}`)

// Replaced rather than merged: a stale file left behind from an older build is
// the kind of thing that only shows up in front of a class.
fs.rmSync(target, { recursive: true, force: true })
fs.renameSync(unpacked, target)
fs.rmSync(staging, { recursive: true, force: true })

console.log(`\nready: ${path.join(target, 'LingoAct.exe')}`)
