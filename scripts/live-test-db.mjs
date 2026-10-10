// CLI OAuth stays in the operating system's credential store. Test runners
// need not copy a personal access token into a shell or the repository.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exec = promisify(execFile)
export async function fixtureSql(project, query) {
  if (!/^[a-z]{20}$/.test(project || '')) throw new Error('Set LINGOACT_TEST_PROJECT to the explicitly selected test project.')
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (token) {
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({query}),
    })
    if (!response.ok) throw new Error(`Fixture query failed (${response.status}).`)
    return response.json()
  }
  const folder = await mkdtemp(join(tmpdir(), 'lingoact-fixture-'))
  try {
    const file = join(folder, 'query.sql')
    await writeFile(file, query, {mode:0o600})
    const args = ['dlx','supabase','db','query','--linked','--project-ref',project,'--file',file,'-o','json']
    const result = process.platform === 'win32'
      ? await exec('powershell.exe', ['-NoProfile','-Command', '& pnpm '+args.map(arg=>"'"+arg.replaceAll("'","''")+"'").join(' ')], {timeout:60000,maxBuffer:4_000_000})
      : await exec('pnpm',args,{timeout:60000,maxBuffer:4_000_000})
    const output = JSON.parse(result.stdout)
    if (!Array.isArray(output.rows)) throw new Error('CLI did not return query rows.')
    return output.rows
  } finally {
    // Only the exact temporary file and newly created empty directory.
    await rm(join(folder,'query.sql'),{force:true})
    await rmdir(folder)
  }
}
