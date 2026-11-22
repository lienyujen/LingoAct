import { Hourglass } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { getPresenterCredential } from '../lib/presenterAuth'
import { usePresenterLocale } from '../lib/presenterI18n'
import { requireSupabase } from '../lib/supabase'
import type { Question } from '../types'

export function AssignmentProgress({ question, active }: { question: Question | null; active: boolean }) {
  const locale = usePresenterLocale()
  const id = question?.id
  const sessionId = question?.session_id
  const visible = active && question?.status === 'active' && !['send_screen', 'reading', 'listening'].includes(question.type)
  const [progress, setProgress] = useState<{ id: string; remaining: number | null } | null>(null)

  useEffect(() => {
    if (!visible || !id || !sessionId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    async function refresh() {
      try {
        const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
          body: { action: 'assignment_progress', sessionId, questionId: id, presenterToken: getPresenterCredential(sessionId!) },
        })
        const value = data?.progress
        if (error || value?.questionId !== id) throw error || new Error('Assignment unavailable')
        const submitted = new Set<string>(value.submittedIds)
        if (!cancelled) setProgress({ id: id!, remaining: value.expectedIds.filter((student: string) => !submitted.has(student)).length })
      } catch {
        if (!cancelled) setProgress({ id: id!, remaining: null })
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 3000)
      }
    }
    void refresh()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [visible, id, sessionId])

  if (!visible) return null
  const count = progress?.id === id ? progress?.remaining ?? '…' : '…'
  const label = locale === 'zh-CN' ? '未提交' : locale === 'ja' ? '未提出' : locale === 'en' ? 'Pending' : '未繳交'
  return <span className="roster-hand assignment-pending" role="status" title={label} aria-label={label + " " + count}><Hourglass size={16} /> {count}</span>
}
