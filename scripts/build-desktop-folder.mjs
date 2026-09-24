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
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profiles = {
  full: 'LingoAct',
  huayu: 'LingoAct-Huayu',
  english: 'LingoAct-English',
  guoyu: 'LingoAct-Guoyu',
  ncacls: 'LingoAct-NCACLS',
}
const profileId = Object.hasOwn(profiles, process.env.APP_PROFILE) ? process.env.APP_PROFILE : 'full'
const productName = profiles[profileId]
const target = path.join(root, productName)
// Built outside the project, because the project is inside a synced Dropbox
// folder. electron-builder extracts Electron to win-unpacked.tmp and renames
// it, and Dropbox indexing those two hundred megabytes as they land holds the
// directory long enough for the rename to fail with EPERM. Temp is on the same
// volume, so moving the finished folder into place is still a rename.
const staging = path.join(os.tmpdir(), 'lingoact-desktop-build')

const run = (command, args, env = process.env) => execFileSync(command, args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })

fs.rmSync(staging, { recursive: true, force: true })
run('pnpm', ['build'], { ...process.env, VITE_APP_PROFILE: profileId })
// --dir stops at the unpacked folder: no portable exe, no zip, no installer.
run('npx', ['electron-builder', '--win', '--x64', '--dir', '-c.directories.output', staging], { ...process.env, APP_PROFILE: profileId })

const unpacked = path.join(staging, 'win-unpacked')
if (!fs.existsSync(unpacked)) throw new Error(`electron-builder produced no ${unpacked}`)

// Replaced rather than merged: a stale file left behind from an older build is
// the kind of thing that only shows up in front of a class.
try {
  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(unpacked, target)
} catch (error) {
  // Dropbox sometimes keeps the just-emptied directory handle alive. The old
  // files are already gone at that point, so copying the completed build into
  // that exact empty directory is equivalent to the rename. Never merge into a
  // non-empty target: that would reintroduce the stale-file problem above.
  if (error?.code !== 'EPERM' || !fs.existsSync(target) || fs.readdirSync(target).length) throw error
  fs.cpSync(unpacked, target, { recursive: true })
}
fs.rmSync(staging, { recursive: true, force: true })

console.log(`\nready: ${path.join(target, `${productName}.exe`)}`)
