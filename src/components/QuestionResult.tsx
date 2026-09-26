import { ArrowCounterClockwise, ArrowsOut, CheckCircle, CircleNotch, DiceFive, DownloadSimple, Eye, EyeSlash, Faders, FileArrowUp, Play, Sparkle, Square, Waveform, X, XSquare } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { BoardWall } from './BoardWall'
import { TimingRow } from './TimingRow'
import { boardAction, loadBoard } from '../lib/boardData'
import type { BoardSnapshot } from '../lib/boardData'
import type { BoardPostKind } from '../types'
import { HotspotImage } from './HotspotImage'
import { parsePins, pinColor, pinLabel } from '../lib/hotspot'
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { correctnessStats, countByAnswer } from '../lib/stats'
import { downloadHref } from '../lib/fileLinks'
import { answerDeadline, useSecondsLeft } from '../lib/questionTiming'
import { usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'
import type { Answer, AudioResponse, FileResponse, Question, QuestionAnalysis } from '../types'
import { QuestionActivityStatus } from './QuestionActivityStatus'

type Props = {
  anonymousEnabled: boolean
  question: Question | null
  // The capture a 圖上點選 question was answered on. Null for every other type.
  screenshotUrl?: string | null
  answers: Answer[]
  audioResponses: AudioResponse[]
  fileResponses: FileResponse[]
  // Which upload is being marked right now, and how far a mark-everything run has got.
  fileBusyId: string
  gradeProgress: { done: number; total: number } | null
  analysis: QuestionAnalysis | null
  analysisBusy: boolean
  analysisError: string
  // 造句牆 belongs to a 問答題 but carries its own state and its own calls, so it
  // arrives assembled rather than as six more props to thread through here.
  sentenceWall?: ReactNode
  busy: boolean
  isCurrentQuestion: boolean
  onlineCount: number
  onAnalyze: () => void
  onAnalyzeFile: (responseId: string) => void
  onDrawUnanswered: (questionId: string) => void
  onSetCorrectAnswer: (answer: string) => void
  // Stopping and reopening belong to a question, not to the end of the lesson,
  // so they live in its heading rather than in 課堂收尾.
  onStopQuestion: () => Promise<void>
  onResumeQuestion: () => Promise<void>
}

type AnalysisProps = Pick<Props,
  'question' | 'answers' | 'analysis' | 'analysisBusy' | 'analysisError' | 'onAnalyze' | 'onSetCorrectAnswer'
  | 'fileResponses' | 'gradeProgress'>

function ItemList({ items }: { items: string[] }) {
  const t = usePresenterText()
  if (!items.length) return <p className="muted">{t('nothingToList')}</p>
  return (
    <ul className="analysis-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )
}

function QuestionStatusActions({
  busy,
  isCurrentQuestion,
  onlineCount,
  onDrawUnanswered,
  onStopQuestion,
  onResumeQuestion,
  question,
}: Pick<Props, 'busy' | 'isCurrentQuestion' | 'onlineCount' | 'onDrawUnanswered' | 'onStopQuestion' | 'onResumeQuestion'> & { question: Question }) {
  const t = usePresenterText()
  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState('')

  // Only the question the class is on can be stopped or reopened; an older one
  // in the history is a record, not a control.
  const stoppable = isCurrentQuestion && question.status === 'active'
  const resumable = isCurrentQuestion && question.status === 'stopped'

  async function toggleAnswering() {
    setToggling(true)
    setToggleError('')
    try {
      await (resumable ? onResumeQuestion() : onStopQuestion())
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : t('actionFailed'))
    } finally {
      setToggling(false)
    }
  }

  const canDrawUnanswered = isCurrentQuestion
    && question.type !== 'send_screen'
    && (question.status === 'stopped' || question.status === 'closed')

  // The teacher is running the clock the class is watching, so they need to see
  // the same number: without it they are deciding when to move on blind, which
  // is the whole reason a timed question was set.
  const secondsLeft = useSecondsLeft(isCurrentQuestion && question.status === 'active' ? answerDeadline(question) : null)

  return (
    <div className="question-heading-actions">
      {secondsLeft !== null && (
        <span className={secondsLeft === 0 ? 'question-clock spent' : 'question-clock'}>
          {secondsLeft === 0 ? t('timeUp') : t('secondsLeft', { n: secondsLeft })}
        </span>
      )}
      {canDrawUnanswered && (
        <button
          aria-label={t('drawUnanswered')}
          className="question-unanswered-draw"
          disabled={busy || !onlineCount}
          title={onlineCount ? t('drawUnansweredHint') : t('noStudentsOnline')}
          type="button"
          onClick={() => onDrawUnanswered(question.id)}
        >
          <DiceFive size={20} />
        </button>
      )}
      {(stoppable || resumable) && (
        <button
          className={resumable ? 'question-answering-toggle is-resume' : 'question-answering-toggle'}
          disabled={busy || toggling}
          title={toggleError || (resumable ? t('resumeHint') : t('stopHint'))}
          type="button"
          onClick={() => void toggleAnswering()}
        >
          {resumable ? <Play size={15} weight="fill" /> : <Square size={15} />}
          {resumable ? t('resumeAnswering') : t('stopAnswering')}
        </button>
      )}
      <QuestionActivityStatus question={question} />
    </div>
  )
}

function AiAnalysisPanel({
  question, answers, analysis, analysisBusy, analysisError, fileResponses, gradeProgress, onAnalyze, onSetCorrectAnswer,
}: AnalysisProps) {
  const t = usePresenterText()
  if (!question || ['send_screen', 'pronunciation', 'oral_response'].includes(question.type)) return null

  // 電寫題 hands in the same thing an upload does — one image per student,
  // through the same rows — so it reads back through the same panel.
  const isUpload = question.type === 'file_upload' || question.type === 'drawing'
  // Counted in students, because that is what a press costs: one call covers
  // every page one student sent.
  const unmarked = isUpload
    ? new Set(fileResponses
      .filter((response) => ['pending', 'failed'].includes(response.analysis_status))
      .map((response) => response.participant_id)).size
    : 0
  const canAnalyze = question.status !== 'active'
    && (isUpload ? fileResponses.length > 0 : answers.length > 0)
  const suggestion = analysis?.question_understanding.suggested_correct_answer
  const canApplySuggestion = Boolean(
    suggestion
    && (question.type === 'multiple_choice' || question.type === 'true_false')
    && !question.allow_multiple
    && question.options.includes(suggestion),
  )

  return (
    <section className="panel ai-analysis-panel">
      <div className="panel-heading">
        <h2><Sparkle size={18} />{t('fullAnalysis')}</h2>
        <button disabled={!canAnalyze || analysisBusy} type="button" onClick={onAnalyze}>
          <Sparkle size={16} />
          {analysisBusy
            ? gradeProgress ? t('marking', { done: gradeProgress.done, total: gradeProgress.total }) : t('analysing')
            : isUpload
              ? unmarked ? t('markRestAndAnalyse', { n: unmarked }) : analysis ? t('analyseAgain') : t('analyseClass')
              : analysis ? t('analyseAgain') : t('aiAnalyse')}
        </button>
      </div>
      {!canAnalyze && (
        <p className="muted">{t('analysisNeedsStop')}</p>
      )}
      {canAnalyze && isUpload && (
        // Marking is the expensive half, so say plainly what this button will and
        // will not spend: work already paid for is never redone.
        <p className="muted">
          {unmarked
            ? t('markRestNote', { n: unmarked })
            : t('allMarkedNote')}
        </p>
      )}
      {analysisError && <p className="error">{analysisError}</p>}
      {analysis && (
        <div className="analysis-content">
          <section>
            <h3>{t('questionRead')}</h3>
            <p>{analysis.question_understanding.detected_question}</p>
            <p className="muted">
              {analysis.question_understanding.subject} · {analysis.question_understanding.concepts.join('、')}
            </p>
            {suggestion && (
              <div className="ai-suggestion">
                <span>{t('suggestedAnswer')}<strong>{suggestion}</strong></span>
                <span>{t('confidence')}{analysis.question_understanding.confidence}</span>
                {canApplySuggestion && (
                  <button className="ghost-button" type="button" onClick={() => onSetCorrectAnswer(suggestion)}>
                    <CheckCircle size={16} />{t('useAsAnswer')}
                  </button>
                )}
              </div>
            )}
            <p>{analysis.question_understanding.reasoning}</p>
          </section>

          <details open>
            <summary>{t('responseUnderstanding')}</summary>
            <p>{analysis.response_analysis.understanding_summary}</p>
            <p className="muted">
              {t('answeredCount', { n: analysis.response_analysis.response_count })} · {t('responseRate', { rate: analysis.response_analysis.response_rate })}
            </p>
            <h4>{t('grasped')}</h4>
            <ItemList items={analysis.response_analysis.strengths} />
            <h4>{t('misconceptions')}</h4>
            <ItemList items={analysis.response_analysis.misconceptions} />
            <h4>{t('responsePatterns')}</h4>
            <ItemList items={analysis.response_analysis.representative_patterns} />
          </details>

          <details open>
            <summary>{t('teachingAdvice')}</summary>
            <h4>{t('immediateActions')}</h4>
            <ItemList items={analysis.teaching_recommendations.immediate_actions} />
            <h4>{t('explanationPoints')}</h4>
            <ItemList items={analysis.teaching_recommendations.explanation_points} />
            <h4>{t('followUpQuestions')}</h4>
            <ItemList items={analysis.teaching_recommendations.follow_up_questions} />
          </details>

          {analysis.limitations.length > 0 && (
            <details>
              <summary>{t('analysisLimits')}</summary>
              <ItemList items={analysis.limitations} />
            </details>
          )}
        </div>
      )}
    </section>
  )
}

const verdictLabels: Record<string, PresenterMessageKey> = {
  correct: 'verdictCorrect',
  partial: 'verdictPartial',
  incorrect: 'verdictIncorrect',
  unscored: 'verdictUnscored',
}

const uploadStatusLabels: Record<FileResponse['analysis_status'], PresenterMessageKey> = {
  pending: 'statusPending',
  analyzing: 'statusAnalyzing',
  success: 'statusSuccess',
  failed: 'statusFailed',
  unsupported: 'statusUnsupported',
}

function isImageFile(mimeType: string, name: string) {
  return mimeType.startsWith('image/') || /.(png|jpe?g|webp|gif|heic|heif)$/i.test(name)
}

// One row per student, not per file: an essay photographed as three pages is
// one answer, and the marker treats it that way too.
function UploadResults({
  anonymousEnabled, fileBusyId, fileResponses, question, onAnalyzeFile,
}: Pick<Props, 'anonymousEnabled' | 'fileBusyId' | 'fileResponses' | 'onAnalyzeFile'> & { question: Question }) {
  const t = usePresenterText()
  const [expanded, setExpanded] = useState('')

  const submissions = useMemo(() => {
    const groups = new Map<string, FileResponse[]>()
    for (const response of fileResponses) {
      const existing = groups.get(response.participant_id)
      if (existing) existing.push(response)
      else groups.set(response.participant_id, [response])
    }
    // A student's own files are ordered so the one carrying the mark leads:
    // a stray .docx first would otherwise present the whole submission as
    // unreadable and hide the button that would have marked their photo.
    const rank = (response: FileResponse) => response.analysis_status === 'success' ? 0
      : response.analysis_status === 'unsupported' ? 2 : 1
    return [...groups.values()].map((files) => [...files].sort((left, right) => rank(left) - rank(right)))
  }, [fileResponses])

  const marked = submissions.filter((files) => files[0].analysis_status === 'success').length

  if (!submissions.length) {
    return (
      <p className="muted">
        {question.status === 'active' ? t('noUploadsYet') : t('noUploadsAtAll')}
      </p>
    )
  }

  return (
    <>
      <p className="muted">{t('uploadedCount', { n: submissions.length })} · {t('markedCount', { n: marked })}</p>
      <ul className="file-list upload-answer-list">
        {submissions.map((files, index) => {
          const lead = files[0]
          const result = lead.analysis_json
          const verdict = result?.verdict || ''
          const busy = files.some((file) => fileBusyId === file.id || file.analysis_status === 'analyzing')
          const preview = files.find((file) => isImageFile(file.mime_type, file.name) && file.file_url)
          const failure = files.find((file) => file.error_message && file.analysis_status !== 'success')
          return (
            <li key={lead.participant_id}>
              <div className="file-response-row">
                {preview ? (
                  <a href={preview.file_url} rel="noreferrer" target="_blank">
                    <img alt={preview.name} className="file-response-thumb" src={preview.file_url} />
                  </a>
                ) : <span className="file-response-thumb is-placeholder"><FileArrowUp size={18} /></span>}
                <div className="file-list-meta">
                  <strong>{anonymousEnabled ? t('anonymousUpload', { n: index + 1 }) : lead.participant_name}</strong>
                  <span className="muted">
                    {files.map((file) => file.name).join('、')}
                    {files.length > 1 && ` · ${t('fileCount', { n: files.length })}`}
                  </span>
                  <span className="upload-verdict-line">
                    {verdict && <span className={`file-verdict is-${verdict}`}>{verdictLabels[verdict] ? t(verdictLabels[verdict]) : verdict}</span>}
                    {typeof result?.score === 'number' && <span className="upload-score">{t('points', { n: result.score })}</span>}
                    {!verdict && (
                      <span className={`file-analysis-status is-${lead.analysis_status}`}>
                        {t(uploadStatusLabels[lead.analysis_status])}
                      </span>
                    )}
                  </span>
                </div>
                <div className="file-list-actions">
                  {files.filter((file) => file.file_url).map((file, fileIndex) => (
                    <a
                      className="ghost-button"
                      href={downloadHref(file.file_url as string, file.name)}
                      key={file.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <DownloadSimple size={15} />{t('download')}{files.length > 1 ? ` ${fileIndex + 1}` : ''}
                    </a>
                  ))}
                  {lead.analysis_status !== 'unsupported' && (
                    <button disabled={busy} type="button" onClick={() => onAnalyzeFile(lead.id)}>
                      {busy ? <CircleNotch className="spin" size={15} /> : <Sparkle size={15} />}
                      {lead.analysis_status === 'success' ? t('markAgain') : t('aiMark')}
                    </button>
                  )}
                  {lead.analysis_status === 'success' && (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setExpanded(expanded === lead.participant_id ? '' : lead.participant_id)}
                    >
                      {expanded === lead.participant_id ? t('collapse') : t('seeMarking')}
                    </button>
                  )}
                </div>
              </div>
              {/* 拍照描述: the description belongs beside its own picture, and
                  it is what the teacher actually reads here — the photograph is
                  only what the student had to talk about. */}
              {files.filter((file) => file.caption || file.caption_audio_url).map((file) => (
                <div className="photo-caption-review" key={`caption-${file.id}`}>
                  {files.length > 1 && <span className="muted">{file.name}</span>}
                  {file.caption && <p>{file.caption}</p>}
                  {file.caption_audio_url && <audio controls preload="metadata" src={file.caption_audio_url} />}
                </div>
              ))}
              {failure && <p className="muted file-analysis-error">{failure.error_message}</p>}
              {expanded === lead.participant_id && result && (
                <div className="file-analysis-detail">
                  <p>{result.summary_zh_tw}</p>
                  {result.strengths_zh_tw.length > 0 && (
                    <>
                      <h4>{t('didWell')}</h4>
                      <ul>{result.strengths_zh_tw.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
                    </>
                  )}
                  {result.improvements_zh_tw.length > 0 && (
                    <>
                      <h4>{t('couldImprove')}</h4>
                      <ul>{result.improvements_zh_tw.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

// Every tap the class made, back on the picture they were looking at. What a
// teacher wants here is not how many were wrong but where they all went —
// eighteen pins in one place is the next thing to explain.
function HotspotResults(props: Props & { question: Question }) {
  const { anonymousEnabled, answers, question, screenshotUrl } = props
  const t = usePresenterText()
  const [expanded, setExpanded] = useState(false)

  const pins = answers.flatMap((entry, index) => parsePins(entry.answer_values).map((point) => ({
    ...point,
    label: pinLabel(entry.participant_name, anonymousEnabled, index),
    color: pinColor(entry.participant_id),
  })))

  // The panel is a column beside the class list, so the picture in it is a
  // thumbnail. Same gesture as 自訂測驗: a real window in the desktop app, a
  // full-screen overlay everywhere else.
  function enlarge() {
    if (window.lingoActDesktop) {
      void window.lingoActDesktop.openHotspotReview(question.session_id, question.id)
      return
    }
    setExpanded(true)
  }

  return (
    <section className="panel result-panel hotspot-results-panel">
      <div className="panel-heading">
        <h2>{question.title}</h2>
        {screenshotUrl && (
          <span className="hotspot-heading-actions">
            <button aria-label={t('hotspotEnlarge')} className="icon-button" title={t('hotspotEnlarge')} type="button" onClick={enlarge}>
              <ArrowsOut size={20} />
            </button>
          </span>
        )}
      </div>
      {question.prompt_text && <p className="detected-question">{question.prompt_text}</p>}
      <p className="muted">{t('hotspotTally', { people: answers.length, pins: pins.length })}</p>
      {screenshotUrl
        ? (
          <button className="hotspot-thumb-button" title={t('hotspotEnlarge')} type="button" onClick={enlarge}>
            <HotspotImage alt={t('hotspotEnlarge')} imageUrl={screenshotUrl} pins={pins} />
          </button>
        )
        : <p className="muted">{t('hotspotNobody')}</p>}
      {expanded && screenshotUrl && createPortal(
        <div className="custom-quiz-review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExpanded(false) }}>
          <section aria-label={t('hotspotEnlarge')} aria-modal="true" className="hotspot-review-modal" role="dialog">
            <header>
              <h2>{question.prompt_text || question.title}</h2>
              <button aria-label={t('close')} className="icon-button" title={t('close')} type="button" onClick={() => setExpanded(false)}><X size={22} /></button>
            </header>
            <div className="hotspot-review-stage">
              <HotspotImage alt={t('hotspotEnlarge')} imageUrl={screenshotUrl} pins={pins} />
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}

const BOARD_FORMAT_LABELS: Array<[BoardPostKind, PresenterMessageKey]> = [
  ['text', 'boardFormatText'], ['link', 'boardFormatLink'], ['image', 'boardFormatImage'],
  ['file', 'boardFormatFile'], ['audio', 'boardFormatAudio'], ['drawing', 'boardFormatDrawing'],
]

// The wall as the presenter sees it, beside the class list.
function BoardResults(props: Props & { question: Question }) {
  const { question } = props
  const t = usePresenterText()
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)

  // Polled rather than subscribed: the presenter's copy comes through the edge
  // function on the service role, because before the reveal the table is closed
  // even to them through the ordinary client, and realtime obeys the same
  // policy. Ten seconds is well inside the pace a teacher reads a wall at.
  useEffect(() => {
    let live = true
    const read = async () => {
      try {
        const next = await loadBoard(question.session_id, question.id)
        if (live) { setSnapshot(next); setError('') }
      } catch (caught) {
        if (live) setError(caught instanceof Error ? caught.message : t('boardLoadFailed'))
      }
    }
    void read()
    const timer = window.setInterval(() => void read(), 10_000)
    return () => { live = false; window.clearInterval(timer) }
  }, [question.id, question.session_id, t])

  const live = snapshot?.question
  const revealed = Boolean(live?.board_revealed_at ?? question.board_revealed_at)
  const open = (live?.status ?? question.status) === 'active'
  const formats = (live?.board_formats ?? question.board_formats ?? []) as BoardPostKind[]
  const maxPosts = live?.board_max_posts ?? question.board_max_posts
  const cards = (snapshot?.posts || []).filter((post) => !post.reply_to)
  const contributors = new Set(cards.filter((post) => !post.deleted_at).map((post) => post.participant_id)).size

  async function run(body: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      await boardAction(question.session_id, body)
      setSnapshot(await loadBoard(question.session_id, question.id))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('boardActionFailed'))
    } finally {
      setBusy(false)
    }
  }

  function enlarge() {
    if (!window.lingoActDesktop?.openBoardReview) return
    window.lingoActDesktop.openBoardReview(question.session_id, question.id)
      .catch((caught: unknown) => {
        setError(t('boardEnlargeFailed', { message: caught instanceof Error ? caught.message : '' }))
      })
  }

  return (
    <section className="panel result-panel board-results-panel">
      <div className="panel-heading">
        <h2>{question.title}</h2>
        <span className="hotspot-heading-actions">
          {window.lingoActDesktop?.openBoardReview && (
            <button aria-label={t('boardEnlarge')} className="icon-button" title={t('boardEnlarge')} type="button" onClick={enlarge}>
              <ArrowsOut size={20} />
            </button>
          )}
        </span>
      </div>
      {question.prompt_text && <p className="detected-question">{question.prompt_text}</p>}
      <p className="muted">
        {t('boardTally', { cards: cards.filter((post) => !post.deleted_at).length, people: contributors })}
        {maxPosts === null ? t('boardCapNone') : t('boardCapSome', { n: maxPosts })}
      </p>
      {error && <p className="error">{error}</p>}

      <div className="board-results-actions">
        {/* Both ways. A presenter may want the class to think alone and then
            look together, or to share from the start and then close the wall
            again to settle the room. */}
        <button className="ghost-button" disabled={busy} type="button"
          onClick={() => void run({ action: 'set_board_visibility', questionId: question.id, shared: !revealed })}>
          {revealed ? <><EyeSlash size={16} />{t('boardMakeSelfPaced')}</> : <><Eye size={16} />{t('boardReveal')}</>}
        </button>
        <button className="ghost-button" disabled={busy} type="button"
          onClick={() => void run({ action: 'set_board_open', questionId: question.id, open: !open })}>
          {open ? <><XSquare size={16} />{t('boardClose')}</> : <><ArrowCounterClockwise size={16} />{t('boardReopen')}</>}
        </button>
        <button className="ghost-button" disabled={busy} type="button" onClick={() => setEditing((current) => !current)}>
          <Faders size={16} />{t('boardAdjust')}
        </button>
      </div>
      {editing && (
        <div className="board-settings">
          {/* A discussion that has started is exactly when a presenter finds
              out that words were not enough, or that one card each was too
              few. Changing either does not disturb what is already up. */}
          <div className="board-format-grid">
            {BOARD_FORMAT_LABELS.map(([kind, label]) => {
              const on = formats.includes(kind)
              return (
                <button
                  aria-pressed={on}
                  className={`board-format-chip${on ? ' is-selected' : ''}`}
                  disabled={busy}
                  key={kind}
                  type="button"
                  onClick={() => {
                    const next = on ? formats.filter((item) => item !== kind) : [...formats, kind]
                    if (!next.length) return
                    void run({ action: 'update_board_settings', questionId: question.id, boardFormats: next })
                  }}
                >
                  <strong>{t(label)}</strong>
                </button>
              )
            })}
          </div>
          <TimingRow
            formatValue={(value: number) => t('boardPostCount', { n: value })}
            label={t('boardPerStudent')}
            offLabel={t('boardUnlimitedShort')}
            presets={[1, 2, 3, 5, null]}
            value={maxPosts}
            onChange={(value: number | null) => void run({ action: 'update_board_settings', questionId: question.id, boardMaxPosts: value })}
          />
        </div>
      )}
      {!revealed && <p className="muted">{t('boardOnlyOwn')}</p>}
      {!open && <p className="muted">{t('boardEnded')}</p>}

      <BoardWall
        anonymous={Boolean(snapshot?.posts.some((post) => post.anonymous_at_display))}
        busy={busy}
        posts={snapshot?.posts || []}
        reactions={snapshot?.reactions || []}
        onSetState={(postId, patch) => void run({ action: 'set_board_post_state', postId, ...patch })}
      />
    </section>
  )
}

export function QuestionResult(props: Props) {
  const t = usePresenterText()
  const { anonymousEnabled, question, answers, audioResponses, analysis, onSetCorrectAnswer } = props

  if (!question) {
    return (
      <section className="panel">
        <h2>{t('noQuestionYet')}</h2>
        <p className="muted">{t('noQuestionHint')}</p>
      </section>
    )
  }

  if (question.type === 'send_screen') {
    return (
      <section className="panel result-panel">
        <div className="panel-heading">
          <h2>{t('typeSendScreen')}</h2>
          <QuestionActivityStatus question={question} />
        </div>
        <p className="muted">{t('screenOnly')}</p>
      </section>
    )
  }

  if (question.type === 'short_answer') {
    return (
      <>
        <section className="panel result-panel">
          <div className="panel-heading">
            <h2>{t('typeShortAnswer')}</h2>
            <QuestionStatusActions {...props} question={question} />
          </div>
          <p className="muted">{t('answeredPeople', { n: answers.length })}</p>
          <div className="answer-list">
            {answers.map((answer, index) => (
              <article className="answer-item" key={answer.id}>
                <strong>{anonymousEnabled ? t('anonymousAnswer', { n: index + 1 }) : answer.participant_name}</strong>
                <p>{answer.answer_text}</p>
              </article>
            ))}
          </div>
        </section>
        {props.sentenceWall}
        <AiAnalysisPanel {...props} />
      </>
    )
  }

  // 電寫題 hands in the same thing an upload does — one image per student,
  // through the same rows — so it reads back through the same panel.
  // 圖上點選 hands back coordinates rather than answers, so it reads nothing
  // like the other panels and gets its own.
  if (question.type === 'board') return <BoardResults {...props} question={question} />

  if (question.type === 'hotspot') return <HotspotResults {...props} question={question} />

  if (question.type === 'file_upload' || question.type === 'drawing') {
    return (
      <>
        <section className="panel result-panel upload-results-panel">
          <div className="panel-heading">
            <h2><FileArrowUp size={20} />{question.title}</h2>
            <QuestionStatusActions {...props} question={question} />
          </div>
          {question.prompt_text && <p className="detected-question">{question.prompt_text}</p>}
          <UploadResults
            anonymousEnabled={anonymousEnabled}
            fileBusyId={props.fileBusyId}
            fileResponses={props.fileResponses}
            question={question}
            onAnalyzeFile={props.onAnalyzeFile}
          />
        </section>
        <AiAnalysisPanel {...props} />
      </>
    )
  }

  if (question.type === 'pronunciation' || question.type === 'oral_response') {
    return (
      <section className="panel result-panel audio-results-panel">
        <div className="panel-heading">
          <h2><Waveform size={20} />{question.title}</h2>
          <QuestionStatusActions {...props} question={question} />
        </div>
        {question.prompt_text && <p className="detected-question">{question.prompt_text}</p>}
        <p className="muted">{t('recordedPeople', { n: answers.length })}</p>
        {question.status === 'active' ? (
          <p className="muted">{t('audioAfterStop')}</p>
        ) : audioResponses.length ? (
          <div className="audio-result-list">
            {audioResponses.map((response, index) => {
              const result = response.analysis_json
              return (
                <article className="audio-result-item" key={response.id}>
                  <div className="audio-result-heading">
                    <strong>{anonymousEnabled ? t('anonymousAnswer', { n: index + 1 }) : response.participant_name}</strong>
                    {typeof response.score === 'number' && <span className="audio-result-score">{t('points', { n: response.score })}</span>}
                  </div>
                  {response.signed_url && <audio controls preload="metadata" src={response.signed_url} />}
                  {response.analysis_status === 'success' && result ? (
                    <>
                      <p className="audio-feedback-summary">{result.summary}</p>
                      <div className="audio-analysis-grid">
                        <div><strong>{t('audioRelevance')}</strong><p>{result.relevance}</p></div>
                        <div><strong>{t('audioClarity')}</strong><p>{result.clarity}</p></div>
                        <div><strong>{t('audioCompleteness')}</strong><p>{result.completeness}</p></div>
                      </div>
                      <div className="audio-feedback-section"><strong>{t('audioStrengths')}</strong><ul>{result.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div className="audio-feedback-section"><strong>{t('audioImprovements')}</strong><ul>{result.improvements.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <details><summary>{t('seeTranscript')}</summary><p>{result.transcript || t('noSpeechFound')}</p></details>
                    </>
                  ) : response.analysis_status === 'failed' ? (
                    <p className="error">{t('audioMarkFailed')}</p>
                  ) : (
                    <p className="muted">{t('audioMarking')}</p>
                  )}
                </article>
              )
            })}
          </div>
        ) : (
          <p className="muted">{t('noRecordings')}</p>
        )}
      </section>
    )
  }

  const counts = countByAnswer(answers, t('blankAnswer'))
  const correctness = correctnessStats(question, answers)
  const correctAnswers = question.correct_answers?.length
    ? question.correct_answers
    : question.correct_answer
      ? [question.correct_answer]
      : []

  return (
    <>
      <section className="panel result-panel">
        <div className="panel-heading">
          <h2>{question.title}</h2>
          <QuestionStatusActions {...props} question={question} />
        </div>
        {(analysis?.question_understanding.detected_question || question.prompt_text) && (
          <p className="detected-question">{analysis?.question_understanding.detected_question || question.prompt_text}</p>
        )}
        <p className="muted">{t('answeredPeople', { n: answers.length })}</p>
        <div className="option-results">
          {question.options.map((option) => {
            const count = counts[option] || 0
            const rate = answers.length ? Math.round((count / answers.length) * 100) : 0
            const canSetCorrectAnswer = question.status !== 'active'
              && (question.type === 'multiple_choice' || question.type === 'true_false')

            return (
              <div className="bar-row" key={option}>
                <button
                  className={correctAnswers.includes(option) ? 'correct-option' : 'ghost-button'}
                  disabled={!canSetCorrectAnswer}
                  type="button"
                  onClick={() => onSetCorrectAnswer(option)}
                >
                  {option}
                </button>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${rate}%` }} />
                </div>
                <span>{count} / {rate}%</span>
              </div>
            )
          })}
        </div>
        {correctness ? (
          <div className="correctness">
            <strong>{t('correctRate', { rate: correctness.correctRate })}</strong>
            <span>{t('incorrectRate', { rate: correctness.incorrectRate })}</span>
          </div>
        ) : (
          <p className="muted">
            {question.type === 'poll'
              ? t('pollNeedsNoAnswer')
              : question.status === 'active'
                ? t('answerAfterStop')
                : question.allow_multiple
                  ? t('pickMultipleCorrect')
                  : t('pickCorrect')}
          </p>
        )}
      </section>
      <AiAnalysisPanel {...props} />
    </>
  )
}
