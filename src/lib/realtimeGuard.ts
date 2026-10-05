import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

export function matchesRealtimeFilter(filter: Record<string, unknown>, payload: unknown) {
  if (!payload || typeof payload !== 'object') return false
  const change = payload as Record<string, unknown>
  if (filter.schema && filter.schema !== '*' && change.schema !== filter.schema) return false
  if (filter.table && filter.table !== '*' && change.table !== filter.table) return false
  if (filter.event && filter.event !== '*' && change.eventType !== filter.event) return false
  const match = typeof filter.filter === 'string' ? filter.filter.match(/^(\w+)=eq\.(.+)$/u) : null
  if (match) {
    const row = (change.eventType === 'DELETE' ? change.old : change.new) as Record<string, unknown> | undefined
    // DELETE can carry only the primary key. The table must still match, but
    // absent non-key columns cannot be used to reject a legitimate deletion.
    if (row && match[1] in row && String(row[match[1]]) !== match[2]) return false
    if (change.eventType !== 'DELETE' && (!row || !(match[1] in row))) return false
  }
  return true
}

// Some joins arrive without per-binding IDs. In that state the SDK's '*' event
// handlers accept changes from every table on the channel. A student heartbeat
// then reloads each learner's entire page and inserts non-students into rosters.
// Check the delivered table and row before any classroom callback can run.
export function guardRealtimeTables(client: SupabaseClient) {
  const channel = client.channel.bind(client)
  const guarded = new WeakSet<RealtimeChannel>()
  client.channel = (...args: Parameters<typeof client.channel>) => {
    const next = channel(...args)
    if (guarded.has(next)) return next
    guarded.add(next)
    const on = next.on.bind(next)
    next.on = ((type: string, filter: Record<string, unknown>, callback: (payload: unknown) => void) =>
      on(type as never, filter as never, (type === 'postgres_changes'
        ? (payload: unknown) => { if (matchesRealtimeFilter(filter, payload)) callback(payload) }
        : callback) as never)) as typeof next.on
    return next
  }
  return client
}
