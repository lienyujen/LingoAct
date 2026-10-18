// Realtime and retry timers may fire while the snapshot is still loading.
// Finish that snapshot before starting one follow-up, rather than continually
// invalidating slow responses with newer request IDs.
export function createSerializedReload() {
  let running: Promise<void> | null = null
  let pending: (() => Promise<void>) | null = null
  return (load: () => Promise<void>): Promise<void> => {
    pending = load
    if (!running) {
      running = Promise.resolve().then(async () => {
        try {
          let failure: unknown
          while (pending) {
            const next = pending
            pending = null
            try { await next() } catch (error) { failure = error }
          }
          if (failure) throw failure
        } finally { running = null; pending = null }
      })
    }
    return running
  }
}
