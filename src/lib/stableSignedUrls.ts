import { useMemo, useRef } from 'react'

// Keeps a signed URL the same string for as long as it points at the same file.
//
// A private recording reaches the teacher as a signed URL, and the server mints
// a fresh one every time the list is asked for — same file, different token.
// The lists are polled: the review window every four seconds, the results panel
// every ten. So `src` on the <audio> changed on every poll, and a changed src
// makes the browser drop what it has and load the file again, which stops
// playback. A teacher pressed play, got a few seconds, and it went silent.
//
// Nothing about the file changed, so the URL should not either. The first one
// seen for a row is kept and handed back in place of each later one.
//
// Signed URLs do expire, and this one is minted for an hour, so a kept URL is
// let go before that and the next poll's replaces it. The window is nowhere
// near an hour of marking in practice; the four second cut-off was every time.
const LET_GO_AFTER_MS = 45 * 60 * 1000

export function useStableSignedUrls<T extends { id: string }>(rows: T[], field: keyof T): T[] {
  const held = useRef(new Map<string, { url: string; at: number }>())

  return useMemo(() => {
    const now = Date.now()
    const live = new Set<string>()
    const stable = rows.map((row) => {
      live.add(row.id)
      const fresh = row[field]
      if (typeof fresh !== 'string' || !fresh) return row
      const kept = held.current.get(row.id)
      if (kept && now - kept.at < LET_GO_AFTER_MS) {
        return kept.url === fresh ? row : { ...row, [field]: kept.url }
      }
      held.current.set(row.id, { url: fresh, at: now })
      return row
    })
    // A row that has gone is not coming back under the same id.
    for (const id of [...held.current.keys()]) if (!live.has(id)) held.current.delete(id)
    return stable
  }, [rows, field])
}
