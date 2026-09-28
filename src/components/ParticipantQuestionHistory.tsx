import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretUp, CheckCircle, Clock, ClockCounterClockwise, MicrophoneStage } from '@phosphor-icons/react'
import type { ParticipantLocale } from '../lib/participantI18n'
import { participantText } from '../lib/participantI18n'
import { listSeparator, localizedFeedback, localizedFields } from '../lib/localizedContent'
import type { Answer, AudioResponse, ListeningClip, ParticipantQuizData, Question, QuestionAnalysis, ReadingPassage, Screenshot } from '../types'
import { ReadingPassageView } from './ReadingPassageView'
import { MyUploadMarking } from './ParticipantFilePanel'
import { ParticipantFlashcards } from './ParticipantFlashcards'
import { ListeningPlayer } from './ListeningPlayer'
import { ParticipantTeachingContext } from './ParticipantTeachingContext'
import { participantQuizPayload } from '../lib/participantQuizPayload'
import { InteractionReadout } from './InteractionReadout'
import { RevisedWriting } from './RevisedWriting'

type Props = {
  // What the AI read the question as, and what it thought the answer was.
  // Kept per question so it stays with the answer it belongs to.
  analyses: Record<string, QuestionAnalysis>
  teachingCredentials?: { sessionId: string; participantId: string; participantToken: string }
  activeQuestionId?: string | null
  answers: Answer[]
  audioResponses: Record<string, AudioResponse | null>
  defaultExpandAll?: boolean
  loadingQuestionIds: Set<string>
  listeningClips: Record<string, ListeningClip | null>
  locale: ParticipantLocale
  onLoadDetails: (question: Question) => Promise<void>
  questions: Question[]
  quizData: Record<string, ParticipantQuizData | null>
  screenshots: Record<string, Screenshot>
  // The article behind a reading, kept so the class can go back to it. Nothing
  // is locked here: history only holds questions that are over, and the words
  // and grammar notes are the entire reason to return to a passage.
  passages: Record<string, ReadingPassage>
  unlimitedListening?: boolean
}

function answerText(question: Question, answer: Answer, locale: ParticipantLocale) {
  const translation = localizedFields(question.translations, locale)
  const translatedOptions = translation?.options?.length === question.options.length
    ? translation.options
    : question.options
  const display = (value: string) => {
    const index = question.options.indexOf(value)
    return index >= 0 ? translatedOptions[index] : value
  }
  if (answer.answer_values?.length) return answer.answer_values.map(display).join(listSeparator(locale))
  if (answer.answer_value) return display(answer.answer_value)
  return answer.answer_text || ''
}

function questionTitle(question: Question, locale: ParticipantLocale) {
  // Audio-only questions now carry the whole transcript for the optional KTV
  // view. Putting that paragraph in the collapsed history row would turn the
  // navigation label into a wall of text.
  if (question.type === 'listening') return participantText(locale, 'listening')
  const translation = localizedFields(question.translations, locale)
  return translation?.prompt_text || translation?.title || question.prompt_text || translation?.title || question.title
}

export function ParticipantQuestionHistory({ analyses,
  teachingCredentials,
  activeQuestionId,
  answers,
  audioResponses,
  defaultExpandAll = false,
  loadingQuestionIds,
  listeningClips,
  locale,
  onLoadDetails,
  questions,
  quizData,
  screenshots,
  passages,
  unlimitedListening = false,
}: Props) {
  const history = useMemo(() => questions.filter((item) => item.status !== 'draft' && item.id !== activeQuestionId).slice().reverse(), [activeQuestionId, questions])
  const [sectionExpanded, setSectionExpanded] = useState(true)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const requestedDetails = useRef(new Set<string>())
  const newestId = history[0]?.id || ''

  useEffect(() => {
    if (!newestId) return
    const visible = defaultExpandAll ? history : history.slice(0, 1)
    setOpenIds(new Set(visible.map((question) => question.id)))
    for (const question of visible) {
      // A teacher edit invalidates this entry in ParticipantPage. Let that
      // missing value through even if this question was loaded before, so the
      // corrected article and comments arrive without a student reload.
      if (question.type === 'custom_quiz' && quizData[question.id] === undefined) {
        requestedDetails.current.delete(question.id)
      }
      if (requestedDetails.current.has(question.id)) continue
      requestedDetails.current.add(question.id)
      void onLoadDetails(question)
    }
  }, [defaultExpandAll, history, newestId, onLoadDetails, quizData])

  if (!history.length) return null

  async function toggleQuestion(question: Question) {
    const opening = !openIds.has(question.id)
    setOpenIds((current) => {
      const next = new Set(current)
      if (opening) next.add(question.id)
      else next.delete(question.id)
      return next
    })
    if (opening) await onLoadDetails(question)
  }

  return (
    <section className="participant-history-section" aria-label={participantText(locale, 'answeredQuestions')}>
      <div className="participant-history-heading">
        <div><ClockCounterClockwise size={19} /><h2>{participantText(locale, 'answeredQuestions')}</h2></div>
        <button className="ghost-button" type="button" aria-expanded={sectionExpanded} onClick={() => setSectionExpanded((current) => !current)}>
          {sectionExpanded ? <CaretUp size={17} /> : <CaretDown size={17} />}
          {sectionExpanded ? participantText(locale, 'collapseShort') : `${participantText(locale, 'expandShort')} ${history.length}`}
        </button>
      </div>
      {sectionExpanded && (
        <div className="participant-history-list">
          {history.map((question, index) => {
            const open = openIds.has(question.id)
            const answer = answers.find((item) => item.question_id === question.id)
            const screenshot = question.screenshot_id ? screenshots[question.screenshot_id] : null
            const passage = passages[question.id] || null
            const audio = audioResponses[question.id]
            const listeningClip = listeningClips[question.id]
            const quiz = participantQuizPayload(quizData[question.id], question.id)
            const writingQuiz = Boolean(quiz && quiz.quiz.graded === false
              && quiz.quiz.requested_type !== 'flashcard'
              && quiz.quiz.requested_type !== 'picture_writing'
              && !quiz.quiz.interaction_mode)
            const loading = loadingQuestionIds.has(question.id)
            return (
              <article className="participant-history-item" key={question.id}>
                <button className="participant-history-toggle" type="button" aria-expanded={open} onClick={() => void toggleQuestion(question)}>
                  <span>{participantText(locale, 'questionNumber', { n: history.length - index })}</span>
                  <strong>{questionTitle(question, locale)}</strong>
                  {open ? <CaretUp size={18} /> : <CaretDown size={18} />}
                </button>
                {open && (
                  <div className="participant-history-body">
                    {question.teaching_mode && teachingCredentials && <ParticipantTeachingContext key={question.id} question={question} {...teachingCredentials} locale={locale} active={false} />}
                    {/* A passage draws its own capture above the text, so
                        showing it here as well is the same picture twice. */}
                    {screenshot && !passage && <img alt={participantText(locale, 'dispatchedQuestion')} src={screenshot.public_url} />}
                    {passage && (
                      <ReadingPassageView
                        imageUrl={screenshot?.public_url || null}
                        locale={locale}
                        passage={passage}
                      />
                    )}
                    {/* What this student handed in, with the marking of it.
                        The upload panel belongs to the question the class is
                        on, so the moment the teacher moved to the next one a
                        student lost the picture they sent and everything the
                        AI said about it — which is the part worth going back
                        to. */}
                    {(question.type === 'file_upload' || question.type === 'drawing') && teachingCredentials && (
                      <MyUploadMarking
                        locale={locale}
                        participantId={teachingCredentials.participantId}
                        participantToken={teachingCredentials.participantToken}
                        poll={false}
                        questionId={question.id}
                        sessionId={teachingCredentials.sessionId}
                      />
                    )}
                    {loading && <p className="muted"><Clock size={16} />{participantText(locale, 'loadingYourAnswer')}</p>}
                    {question.type === 'custom_quiz' && !quiz && !loading && <button className="ghost-button" type="button" onClick={() => void onLoadDetails(question)}>
                      {participantText(locale, 'tryAgain')}
                    </button>}
                    {listeningClip && (
                      <ListeningPlayer
                        clip={listeningClip}
                        questionId={question.id}
                        replayLimit={unlimitedListening ? null : question.replay_limit}
                        variant={question.type === 'pronunciation' ? 'model' : 'listening'}
                        prompt={question.type === 'custom_quiz'
                          ? null
                          : localizedFields(question.translations, locale)?.prompt_text || question.prompt_text}
                        readingFontUrl={question.reading_font_url}
                        readingRuby={question.reading_ruby}
                        readingWords={question.reading_words}
                        karaokeCues={question.karaoke_cues}
                        locale={locale}
                      />
                    )}
                    {question.type === 'custom_quiz' && quiz?.quiz.requested_type === 'flashcard' ? (
                      <ParticipantFlashcards
                        active={false}
                        cardFontUrl={question.card_font_url}
                        data={quiz}
                        locale={locale}
                        onTry={async () => ({ correct: false, correctAnswer: null })}
                      />
                    ) : question.type === 'custom_quiz' && quiz?.attempt ? (
                      <div className="participant-history-quiz">
                        <p><CheckCircle size={17} />{quiz.quiz.interaction_mode && !quiz.quiz.graded ? participantText(locale, 'submittedAnswer') : writingQuiz && quiz.attempt.total_score === null ? participantText(locale, 'writingSubmitted') : <>{participantText(locale, 'submittedScoreLabel')}{quiz.attempt.total_score ?? '-'}/{quiz.attempt.max_score ?? 100}</>}</p>
                        {writingQuiz && quiz.attempt.feedback && <p className="quiz-overall-feedback">{localizedFeedback(quiz.attempt.feedback, locale)}</p>}
                        {writingQuiz && quiz.attempt.composition && (
                          <article className="quiz-graded-item writing-composition-result">
                            <div><strong>{participantText(locale, 'composeHeading')}</strong></div>
                            {quiz.attempt.revision?.zh_tw ? (
                              <RevisedWriting
                                labels={{
                                  added: participantText(locale, 'revisionAdded'),
                                  removed: participantText(locale, 'revisionRemoved'),
                                  unchanged: participantText(locale, 'revisionUnchanged'),
                                  notesHeading: participantText(locale, 'revisionNotes'),
                                }}
                                notes={quiz.attempt.revision.notes}
                                original={quiz.attempt.composition}
                                revised={quiz.attempt.revision.zh_tw}
                              />
                            ) : <p className="quiz-written-back">{quiz.attempt.composition}</p>}
                          </article>
                        )}
                        {quiz.items.map((item, itemIndex) => {
                          const response = quiz.answers.find((entry) => entry.item_id === item.id)
                          const prompt = localizedFields(item.translations, locale)?.prompt_text || item.prompt_text
                          const submitted = response?.answer_values?.join(', ') || response?.answer_text || '-'
                          const feedback = localizedFeedback(response?.feedback, locale)
                          // 圖片排序: the values are panel ids, so the order the
                          // student chose is only legible as the pictures again.
                          const pictures = item.option_images?.length === item.options.length
                            ? (response?.answer_values || []).map((value) => item.option_images[item.options.indexOf(value)])
                            : []
                          let pictureWriting: Array<{ panelId: string; text: string }> = []
                          if (quiz.quiz.requested_type === 'picture_writing') {
                            try { pictureWriting = JSON.parse(response?.answer_text || '[]') } catch { pictureWriting = [] }
                          }
                          return <div key={item.id}><strong>{itemIndex + 1}. {prompt}</strong>
                            {quiz.quiz.interaction_mode ? <InteractionReadout item={item} values={response?.answer_values || []} /> : pictureWriting.length
                              ? <div className="participant-picture-writing-review">{pictureWriting.map((segment, at) => <article key={segment.panelId}><div><b>{at + 1}</b><img alt="" src={item.option_images[item.options.indexOf(segment.panelId)]} /></div><p>{segment.text}</p></article>)}</div>
                              : pictures.length
                              ? <p className="participant-history-panels">{pictures.map((src, at) => <img alt="" key={`${src}-${at}`} src={src} />)}</p>
                              : <p>{participantText(locale, 'yourAnswerLabel')}{submitted}</p>}
                            {feedback && <small>{feedback}</small>}</div>
                        })}
                      </div>
                    ) : question.type === 'pronunciation' || question.type === 'oral_response' ? (
                      audio && <div className="participant-history-audio">
                        <p><MicrophoneStage size={17} />{participantText(locale, 'recordingSubmitted')}{audio.score !== null ? ` · ${audio.score} ${participantText(locale, 'points')}` : ''}</p>
                        {audio.signed_url && <audio controls preload="metadata" src={audio.signed_url} />}
                        {audio.analysis_json?.summary && <p>{localizedFields(audio.analysis_json.translations, locale)?.summary || audio.analysis_json.summary}</p>}
                        {audio.transcript && <small>{participantText(locale, 'transcriptLabel')}{audio.transcript}</small>}
                      </div>
                    ) : answer ? (
                      <p className="participant-history-answer"><CheckCircle size={17} />{participantText(locale, 'yourAnswerLabel')}<strong>{answerText(question, answer, locale)}</strong></p>
                    ) : null}
                    {/* Sits below what the student handed in, never instead of
                        it: this is what the AI made of the question, and it is
                        worth reading precisely because their own answer is
                        still there above it to compare against. */}
                    {(() => {
                      const analysis = analyses[question.id]?.question_understanding
                      if (!analysis || (!analysis.detected_question && !analysis.suggested_correct_answer)) return null
                      return (
                        <div className="participant-ai-answer">
                          <p className="eyebrow">{participantText(locale, 'aiReadingOfQuestion')}</p>
                          {analysis.detected_question && <p>{analysis.detected_question}</p>}
                          {analysis.suggested_correct_answer && (
                            <p className="participant-ai-suggested">
                              <span className="participant-review-label">{participantText(locale, 'aiSuggestedAnswer')}</span>
                              <strong>{analysis.suggested_correct_answer}</strong>
                            </p>
                          )}
                          {analysis.reasoning && <small>{analysis.reasoning}</small>}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
