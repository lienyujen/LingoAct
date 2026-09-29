import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const main = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8')
const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8')

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

console.log('Electron platform guards and packaged macOS smoke test are present.')
