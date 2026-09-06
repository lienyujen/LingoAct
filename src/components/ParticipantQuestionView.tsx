import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { PaperPlaneTilt } from '@phosphor-icons/react'
import { AudioRecorder } from './AudioRecorder'
import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale, ParticipantMessageKey } from '../lib/participantI18n'
import { listSeparator, localizedFields } from '../lib/localizedContent'
import { useReadingFont } from '../lib/readingFont'
import { answerDeadline, useSecondsLeft } from '../lib/questionTiming'
import type { Answer, AudioResponse, Question } from '../types'

type Props = {
  question: Question | null
  answer: Answer | null
  audioBusy: boolean
  audioResponse: AudioResponse | null
  onSubmit: (value: string | string[]) => void
  onSubmitAudio: (file: File, durationMs: number) => Promise<void>
  locale?: ParticipantLocale
}

export function ParticipantQuestionView({ question, answer, audioBusy, audioResponse, onSubmit, onSubmitAudio, locale = 'zh-TW' }: Props) {
  const [textAnswer, setTextAnswer] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])

  useEffect(() => {
    setTextAnswer('')
    setSelectedOptions([])
  }, [question?.id])

  // Above the early return below: a hook that runs only on some renders changes
  // the hook order between them, which React refuses outright.
  const readingFamily = useReadingFont(question?.reading_font_url)
  const deadline = question ? answerDeadline(question) : null
  const secondsLeft = useSecondsLeft(deadline)

  // file_upload has its own panel further up the page, carrying the same prompt
  // and the screenshot; rendering here as well would print the question twice.
  if (!question || ['send_screen', 'custom_quiz', 'file_upload', 'listening'].includes(question.type)) return null
  const isAudioQuestion = question.type === 'pronunciation' || question.type === 'oral_response'
  // The clock having run out is a separate thing from the teacher having stopped
  // the question: both close answering, and the student is told which happened.
  const timeUp = secondsLeft === 0
  const acceptingAnswers = question.status === 'active' && !timeUp
  const translation = localizedFields(question.translations, locale)
  // A question with no title of its own is described by its kind, and that
  // description belongs to whoever is reading rather than to English.
  const typeTitles: Partial<Record<Question['type'], ParticipantMessageKey>> = {
    poll: 'typePoll',
    multiple_choice: 'typeMultipleChoice',
    true_false: 'typeTrueFalse',
    short_answer: 'typeShortAnswer',
    pronunciation: 'typePronunciation',
    oral_response: 'typeOralResponse',
  }
  const typeKey = typeTitles[question.type]
  const fallbackTitle = question.title || (typeKey ? participantText(locale, typeKey) : '')
  const prompt = translation?.prompt_text || translation?.title || question.prompt_text || fallbackTitle || participantText(locale, 'interactiveQuestion')
  const translatedOptions = translation?.options?.length === question.options.length ? translation.options : question.options
  const displayAnswer = (value: string) => {
    const index = question.options.indexOf(value)
    return index >= 0 ? translatedOptions[index] : value
  }

  function submitShortAnswer(event: FormEvent) {
    event.preventDefault()
    const value = textAnswer.trim()
    if (value) onSubmit(value)
  }

  return (
    <section className="panel participant-question">
      {readingFamily
        ? <h2 className="reading-text" style={{ fontFamily: readingFamily }}>{prompt}</h2>
        : <h2>{prompt}</h2>}
      {question.status !== 'active' && <p className="muted">{participantText(locale, 'questionEnded')}</p>}
      {question.status === 'active' && secondsLeft !== null && !answer && (
        <p className={timeUp ? 'answer-countdown spent' : 'answer-countdown'} aria-live="off">
          <span>{participantText(locale, timeUp ? 'answerClosed' : 'answerTimeLeft')}</span>
          {!timeUp && <strong>{secondsLeft}</strong>}
        </p>
      )}
      {isAudioQuestion && (
        <AudioRecorder busy={audioBusy} locale={locale} question={question} response={audioResponse} onSubmit={onSubmitAudio} />
      )}
      {answer && !isAudioQuestion && <p className="success">{participantText(locale, 'submittedAnswer')}{answer.answer_values?.map(displayAnswer).join(listSeparator(locale)) || (answer.answer_value ? displayAnswer(answer.answer_value) : answer.answer_text)}</p>}
      {!answer && acceptingAnswers && question.type === 'short_answer' && (
        <form className="short-answer-form" onSubmit={submitShortAnswer}>
          <textarea
            maxLength={1000}
            value={textAnswer}
            onChange={(event) => setTextAnswer(event.target.value)}
            placeholder={participantText(locale, 'answerPlaceholder')}
          />
          <button type="submit"><PaperPlaneTilt size={18} />{participantText(locale, 'submitAnswer')}</button>
        </form>
      )}
      {!answer && !isAudioQuestion && acceptingAnswers && question.type !== 'short_answer' && question.allow_multiple && (
        <form
          className="multi-choice-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (selectedOptions.length) onSubmit(selectedOptions)
          }}
        >
          <div className="multi-choice-list">
            {question.options.map((option, index) => {
              const selected = selectedOptions.includes(option)
              return (
                <label className={`multi-choice-option${selected ? ' selected' : ''}`} key={option}>
                  <input
                    checked={selected}
                    type="checkbox"
                    onChange={() => {
                      setSelectedOptions((current) =>
                        current.includes(option) ? current.filter((value) => value !== option) : [...current, option],
                      )
                    }}
                  />
                  <span>{translatedOptions[index]}</span>
                </label>
              )
            })}
          </div>
          <button disabled={!selectedOptions.length} type="submit"><PaperPlaneTilt size={18} />{participantText(locale, 'submitAnswer')}</button>
        </form>
      )}
      {!answer && !isAudioQuestion && acceptingAnswers && question.type !== 'short_answer' && !question.allow_multiple && (
        <div className="choice-list">
          {question.options.map((option, index) => (
            <button key={option} type="button" onClick={() => onSubmit(option)}>
              {translatedOptions[index]}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
