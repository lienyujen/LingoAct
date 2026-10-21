// Runs the real self-deploy schema on a disposable local PostgreSQL cluster.
// Set LINGOACT_POSTGRES_BIN to a PostgreSQL bin folder and LINGOACT_PG_MODULE
// to a node-postgres module entry. No hosted project or credentials are used.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

const bin = process.env.LINGOACT_POSTGRES_BIN, pgModule = process.env.LINGOACT_PG_MODULE
if (!bin || !pgModule) throw new Error('Set LINGOACT_POSTGRES_BIN and LINGOACT_PG_MODULE for a disposable local PostgreSQL test.')
const require = createRequire(import.meta.url)
const { Client } = require(pgModule)
const run = promisify(execFile)
const folder = await mkdtemp(path.join(tmpdir(), 'lingoact-japanese-schema-'))
const data = path.join(folder, 'data')
const reservation = createServer()
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
const port = reservation.address().port
await new Promise(resolve => reservation.close(resolve))
const executable = name => path.join(bin, name + (process.platform === 'win32' ? '.exe' : ''))
const execute = (name, args) => run(executable(name), args, { windowsHide: true, timeout: 60000, maxBuffer: 2_000_000 })
let started = false, client
try {
  await execute('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'])
  await execute('pg_ctl', ['-D', data, '-l', path.join(folder, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c wal_level=logical`, '-w', 'start'])
  started = true
  client = new Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'})
  await client.connect()
  await client.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create publication supabase_realtime;
    create schema storage;
    create table storage.buckets(id text primary key, name text not null, public boolean, file_size_limit bigint, allowed_mime_types text[]);`)
  const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
  for (const pass of [1, 2]) {
    await client.query('begin')
    try { await client.query(schema); await client.query('commit') }
    catch (error) { await client.query('rollback'); throw error }
    console.log(`Real schema.sql: pass ${pass} succeeded`)
  }
  const { rows: [session] } = await client.query(`insert into sessions(title,code,teaching_language,guidance_language,level_framework,level_code,reading_annotation)
    values('Japanese schema QA','japanese-schema-qa','ja','ja','jf','A1','furigana') returning id`)
  for (const framework of ['kana','jf','jlpt']) await client.query('update sessions set level_framework=$1 where id=$2', [framework, session.id])
  await assert.rejects(client.query('update sessions set level_framework=$1 where id=$2', ['invalid-framework', session.id]), /check constraint/)
  const constraints = (await client.query(`select conrelid::regclass::text as name, pg_get_constraintdef(oid) as definition from pg_constraint where conname in
    ('sessions_reading_annotation_check','listening_clips_annotation_check','reading_passages_annotation_check')`)).rows
  assert.equal(constraints.length, 3)
  assert.ok(constraints.every(row => row.definition.includes('furigana')))
  const migration = await readFile(new URL('../supabase/migrations/20261020064500_japanese_teaching.sql', import.meta.url), 'utf8')
  await client.query(migration)
  await client.query(migration)
  assert.equal((await client.query('select count(*)::int as n from sessions where id=$1', [session.id])).rows[0].n, 1)
  console.log('Japanese modes, annotation constraints, repeated migration and existing data verified')
} finally {
  await client?.end()
  if (started) await execute('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'])
  const resolved = path.resolve(folder)
  if (path.dirname(resolved) === path.resolve(tmpdir()) && path.basename(resolved).startsWith('lingoact-japanese-schema-')) await rm(resolved, {recursive:true,force:true})
  else console.error('Retaining an unexpected schema fixture directory:', resolved)
}
