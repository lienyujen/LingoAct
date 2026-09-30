import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')
const presenterNew = readFileSync(new URL('../src/routes/PresenterNewPage.tsx', import.meta.url), 'utf8')
const createSession = readFileSync(new URL('../supabase/functions/create-session/index.ts', import.meta.url), 'utf8')

// BrowserWindow.setAppDetails does not exist on macOS. Keeping the only call
// inside one guarded helper makes a future secondary window unable to bring
// back the launch-time crash fixed after v1.0.5.
assert.equal(
  (main.match(/\.setAppDetails\s*\(/g) || []).length,
  1,
  'setAppDetails must only be called by the platform-guarded helper.',
)
assert.match(
  main,
  /function applyTaskbarIdentity[\s\S]*?process\.platform !== 'win32'[\s\S]*?\.setAppDetails\s*\(/,
  'The setAppDetails helper must return on every non-Windows platform.',
)
assert.match(
  workflow,
  /Contents\/MacOS\/\$PRODUCT" --smoke-test/,
  'The release workflow must launch the packaged Mac app, not only its Node runtime.',
)
assert.match(
  presenterNew,
  /'x-lingoact-client': 'desktop-app'/,
  'Creating a class must identify the presenter as a cross-platform desktop app.',
)
assert.doesNotMatch(
  createSession,
  /LingoAct Windows App/,
  'The create-session refusal must not tell macOS teachers to use Windows.',
)
assert.match(
  createSession,
  /\['desktop-app', 'windows-app', 'macos-app'\]/,
  'The backend must accept the current desktop identity and both released legacy identities.',
)

console.log('Electron platform guards, desktop session identity and packaged macOS smoke test are present.')
