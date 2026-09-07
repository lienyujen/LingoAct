import { presenterLookup } from './presenterI18n'
import type { PresenterT } from './presenterI18n'
import { getPresenterToken } from './presenterAuth'
import { requireSupabase } from './supabase'
import type { LotterySessionEvent } from '../types'

export async function finalizeLottery(sessionId: string, eventId: string, winnerId: string, t: PresenterT = presenterLookup('zh-TW')) {
  const presenterToken = getPresenterToken(sessionId)
  if (!presenterToken) throw new Error(t('rosterNoRights'))

  const { data, error } = await requireSupabase().functions.invoke('presenter-action', {
    body: {
      action: 'select_lottery_winner',
      sessionId,
      presenterToken,
      eventId,
      winnerId,
    },
  })
  if (error) throw error
  if (!data?.event) throw new Error(data?.message || t('lotteryConfirmFailed'))
  return data.event as LotterySessionEvent
}
