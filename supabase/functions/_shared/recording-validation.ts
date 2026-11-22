/** Validate the mono PCM16 WAV produced by the classroom recorder. */
export function inspectRecording(bytes: ArrayBuffer) {
  if (bytes.byteLength < 44) return null
  const view = new DataView(bytes)
  const format = view.getUint32(0) === 0x52494646 && view.getUint32(8) === 0x57415645
    && view.getUint32(12) === 0x666d7420 && view.getUint32(16, true) === 16
    && view.getUint16(20, true) === 1 && view.getUint16(22, true) === 1
    && view.getUint32(24, true) === 16000 && view.getUint16(34, true) === 16
    && view.getUint32(36) === 0x64617461
  const size = view.getUint32(40, true)
  if (!format || size !== bytes.byteLength - 44 || size % 2 !== 0 || size < 8000) return null

  // Ignore isolated clicks and numerical noise. Speech detection is left to
  // the transcription model so quiet speech is not mistaken for silence.
  let audible = 0
  for (let offset = 44; offset < bytes.byteLength; offset += 2) {
    if (Math.abs(view.getInt16(offset, true)) >= 16) audible++
  }
  return { durationMs: Math.round(size / 32), audible: audible >= 320 }
}

export function hasRecordingTranscript(value: unknown) {
  return typeof value === 'string' && /[\p{L}\p{N}]/u.test(value)
}
