import type { Question } from '../types'
import { uiText } from '../lib/uiText'

function isAudioActivity(question: Question) {
  return question.type === 'listening'
    || question.type === 'pronunciation'
    || Boolean(question.listening_clip_id)
}

export function QuestionActivityStatus({ question, audioOnly = false }: { question: Question; audioOnly?: boolean }) {
  const audioActivity = isAudioActivity(question)
  if (audioOnly && !audioActivity) return null
  const onAir = audioActivity && question.status === 'active'
  return (
    <span className={`status ${onAir ? 'on-air' : question.status}`}>
      {onAir && <span className="status-live-dot" />}
      {onAir ? uiText('播放中') : uiText({ active: '作答中', stopped: '已停止作答', closed: '已結束', draft: '草稿' }[question.status])}
    </span>
  )
}
