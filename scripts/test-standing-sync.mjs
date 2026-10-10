import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
test('145-student bursts, stale snapshots, reconnect and authenticated hand synchronization', async () => {
 await promisify(execFile)(process.execPath,['scripts/test-live-standing-sync.cjs'],{timeout:30000})
})
