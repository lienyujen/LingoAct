import type { Message, Participant } from '../types'

// An ID is admitted once, not once per poll or CSS remount. Keep a bounded
// backlog so a burst can finish without replaying old comments or growing RAM.
export function createDanmakuQueue() {
  const seen = new Set<string>()
  let waiting: Message[] = [], active: Array<{ message: Message; expires: number }> = []
  const fill = (now: number) => {
    while (active.length < 12 && waiting.length) active.push({ message: waiting.shift()!, expires: now + 34_000 })
  }
  return {
    offer(messages: Message[], enabled: boolean, now = Date.now()) {
      for (const message of messages) {
        if (seen.has(message.id)) continue
        seen.add(message.id)
        if (enabled) waiting.push(message)
      }
      if (!enabled) { waiting = []; active = [] }
      if (waiting.length > 200) waiting = waiting.slice(-200)
      fill(now)
    },
    finish(id: string, now = Date.now()) { active = active.filter(item => item.message.id !== id); fill(now) },
    tick(now = Date.now()) { active = active.filter(item => item.expires > now); fill(now) },
    messages: () => active.map(item => item.message),
  }
}

export function sentencePages<T extends { answer_text: string | null }>(answers: T[]) {
  const pages: T[][] = []
  let page: T[] = [], cost = 0
  for (const answer of answers) {
    if (!(answer.answer_text || '').trim()) continue
    const size = Math.max(70, [...(answer.answer_text || '')].length)
    if (page.length && (page.length >= 12 || cost + size > 800)) { pages.push(page); page = []; cost = 0 }
    page.push(answer); cost += size
  }
  if (page.length) pages.push(page)
  return pages
}

// Presence can drop during Wi-Fi changes. A recent authenticated heartbeat is
// also evidence of being online; removed participants must never count.
export function onlineClassIds(participants: Participant[], presenceIds: string[], now = Date.now()) {
  const live = new Set(presenceIds)
  return participants.filter(p => !p.removed_at && (live.has(p.id)
    || now - Date.parse(p.last_seen_at) >= -30_000 && now - Date.parse(p.last_seen_at) < 90_000)).map(p => p.id)
}
