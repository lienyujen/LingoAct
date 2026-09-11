import type { Question } from '../types'

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
      {audioActivity ? (onAir ? 'ON AIR' : question.status.toUpperCase()) : question.status}
    </span>
  )
}
