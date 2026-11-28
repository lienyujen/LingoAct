export const DEFAULT_RECORDING_SECONDS = 180
export const MAX_RECORDING_SECONDS = 300

export function recordingLimitMs(answerSeconds: number | null | undefined) {
  return Math.min(answerSeconds ?? DEFAULT_RECORDING_SECONDS, MAX_RECORDING_SECONDS) * 1000
}
