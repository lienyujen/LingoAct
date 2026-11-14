import type { SupabaseClient } from '@supabase/supabase-js'

// Public classroom sources use fanout. Answers keep their own database
// filters; profile hints are checked against the learner ID before reading.
export const classroomBroadcastTables = new Set([
  'questions', 'screenshots', 'reading_passages', 'ai_summaries', 'shared_contents', 'session_events', 'participants',
])

export function classroomBroadcastHint(value: unknown, sessionId: string, table: string) {
  if (!value || typeof value !== 'object') return null
  const hint = value as Record<string, unknown>
  if (!classroomBroadcastTables.has(table) || hint.session_id !== sessionId || hint.table !== table
    || typeof hint.id !== 'string' || !['INSERT', 'UPDATE', 'DELETE'].includes(String(hint.eventType))) return null
  return hint
}

export function classroomChanges(client: SupabaseClient, sessionId: string, participantId: string, enabled: boolean) {
  const channel = client.channel(enabled ? `classroom-changes:${sessionId}` : `participant:${sessionId}:${participantId}`)
  if (!enabled) return channel
  const on = channel.on.bind(channel)
  channel.on = ((type: string, filter: Record<string, unknown>, callback: (payload: unknown) => void) => {
    if (type !== 'postgres_changes' || !classroomBroadcastTables.has(String(filter.table))) {
      return on(type as never, filter as never, callback as never)
    }
    const table = String(filter.table)
    return on('broadcast', { event: `change:${table}` }, async message => {
      const hint = classroomBroadcastHint(message.payload, sessionId, table)
      if (!hint || (filter.event !== '*' && filter.event !== hint.eventType)) return
      const ownId = typeof filter.filter === 'string' ? filter.filter.match(/^id=eq\.(.+)$/u)?.[1] : undefined
      if (ownId && hint.id !== ownId) return
      // Lottery/buzzer handlers act on a row, so read it through RLS instead of
      // trusting data that another public-channel client could have sent.
      if (table === 'session_events' || table === 'participants') {
        if (hint.eventType === 'DELETE') return
        const { data, error } = await client.from(table).select('*').eq('session_id', sessionId).eq('id', hint.id).maybeSingle()
        if (!error && data) callback({ schema: 'public', table, eventType: hint.eventType, new: data, old: {} })
      } else callback({ schema: 'public', table, eventType: hint.eventType })
    })
  }) as typeof channel.on
  return channel
}

// One catch-up per connection, spread over ten seconds. The first subscription
// only needs to close the initial snapshot/subscribe race; cached material stays.
export function createClassroomReconnect(refresh: (reconnect: boolean) => void, random = Math.random,
  schedule: (run: () => void, delay: number) => ReturnType<typeof setTimeout> = setTimeout,
  cancel: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout) {
  let connected = false
  let timer: ReturnType<typeof setTimeout> | undefined
  return {
    subscribed() {
      if (timer !== undefined) cancel(timer)
      const reconnect = connected
      connected = true
      timer = schedule(() => { timer = undefined; refresh(reconnect) }, reconnect ? 5000 + random() * 10000 : 300 + random() * 1500)
    },
    stop() { if (timer !== undefined) cancel(timer); timer = undefined },
  }
}
