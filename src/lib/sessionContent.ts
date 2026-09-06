import { contentLocaleKey } from './participantI18n'
import type { ParticipantLocale } from './participantI18n'
import type { Session } from '../types'

// The generated Exit Ticket prompt has always been stored in the teaching
// language with one English translation beside it, because English was the only
// other language a student could be reading in.
//
// Reading through a locale-keyed map first means the column stops being special
// the moment the backend writes one: nothing here has to change again when a
// seventh language arrives. Until then an unknown language sees the original
// prompt rather than one it did not ask for.
export function exitTicketPrompt(
  session: Pick<Session, 'exit_ticket_prompt' | 'exit_ticket_prompt_en' | 'exit_ticket_prompt_translations'>,
  locale: ParticipantLocale,
) {
  const translated = session.exit_ticket_prompt_translations?.[contentLocaleKey(locale)]
  if (translated) return translated
  if (locale === 'en' && session.exit_ticket_prompt_en) return session.exit_ticket_prompt_en
  return session.exit_ticket_prompt
}
