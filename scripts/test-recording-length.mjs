import assert from 'node:assert/strict'
import { test } from 'node:test'
import { recordingToWav } from '../src/lib/audio.ts'
import { inspectRecording } from '../supabase/functions/_shared/recording-validation.ts'
import { recordingLimitMs } from '../supabase/functions/_shared/recording-limits.ts'

test('the optional five-minute limit trims the last recorder chunk and fits the upload cap', async (context) => {
  assert.equal(recordingLimitMs(null), 180_000)
  assert.equal(recordingLimitMs(90), 90_000)
  assert.equal(recordingLimitMs(300), 300_000)
  const previousContext = globalThis.AudioContext
  context.after(() => { globalThis.AudioContext = previousContext })
  const sampleRate = 16_000
  const samples = new Float32Array(sampleRate * 301).fill(0.1)
  globalThis.AudioContext = class {
    async decodeAudioData() {
      return { length: samples.length, sampleRate, numberOfChannels: 1, getChannelData: () => samples }
    }
    async close() {}
  }
  const wav = await recordingToWav(new Blob(), recordingLimitMs(300))
  assert.equal(wav.size, 9_600_044)
  assert.ok(wav.size < 10 * 1024 * 1024)
  assert.deepEqual(inspectRecording(await wav.arrayBuffer()), { audible: true, durationMs: 300_000 })
})
