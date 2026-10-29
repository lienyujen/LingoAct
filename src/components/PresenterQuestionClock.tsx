import { presenterClock, useSecondsLeft } from '../lib/questionTiming'
import { usePresenterText } from '../lib/presenterI18n'
import { uiText } from '../lib/uiText'
import type { Question } from '../types'

export function PresenterQuestionClock({ question }: { question: Question | null }) {
  const t = usePresenterText()
  const clock = presenterClock(question)
  // Tick through the preparation boundary too; the next render then follows
  // the answer phase without restarting either clock on navigation or reload.
  const left = useSecondsLeft(clock?.deadline ?? null)
  if (!clock || left === null) return null
  return <div className={`presenter-question-clock${left === 0 ? ' spent' : ''}`} role="timer" aria-label={t('answerTime')}>
    <span>{clock.phase === 'prepare' ? t('prepareTime') : t('answerTime')}{clock.individual ? ` · ${uiText('全班參考時間')}` : ''}</span>
    <strong>{left === 0 ? t('timeUp') : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</strong>
    {clock.individual && <small>{uiText('錄音由學生各自開始；此倒數為派送後的全班參考。')}</small>}
  </div>
}
