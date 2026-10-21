// Retain the ID across a failed acknowledgement. A retry must not create a
// second row after the first request was committed but its reply was lost.
export function createMessageSubmission() {
  let pending: { content: string; id: string } | null = null
  let busy = false
  return async (content: string, write: (id: string) => Promise<void>) => {
    if (busy) return false
    busy = true
    if (!pending || pending.content !== content) pending = { content, id: crypto.randomUUID() }
    try { await write(pending.id); pending = null; return true }
    finally { busy = false }
  }
}
