import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowsClockwise, BookOpen, ChartLineUp, ChatText, CircleNotch, Clock, DownloadSimple, ListChecks, Users } from '@phosphor-icons/react'
import { getPresenterToken } from '../lib/presenterAuth'
import { useSessionReportBack } from '../lib/sessionReportNavigation'
import { requireSupabase } from '../lib/supabase'
import type { AiSummary, Answer, AudioResponse, CaptionSegment, ExitTicket, Message, Participant, Question, Screenshot, Session, SessionAnalysis, SessionCustomQuizResults, SessionMetrics, SessionEvent, SessionReportData, SharedContent, FileResponse } from '../types'
import { useParams, useSearchParams } from 'react-router-dom'
import { PresenterLocaleContext, presenterLocaleFor, presenterLookup, usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey, PresenterT } from '../lib/presenterI18n'

const PAGE_SIZE = 1000

type ReportThinkingLevel = 'LOW' | 'MEDIUM' | 'HIGH'

const reportModes: { level: ReportThinkingLevel; label: PresenterMessageKey; hint: PresenterMessageKey }[] = [
  { level: 'LOW', label: 'reportModeFast', hint: 'reportModeFastHint' },
  { level: 'MEDIUM', label: 'reportModeStandard', hint: 'reportModeStandardHint' },
  { level: 'HIGH', label: 'reportModeDeep', hint: 'reportModeDeepHint' },
]

const questionTypeLabels: Record<Question['type'], PresenterMessageKey> = {
  send_screen: 'typeSendScreen',
  poll: 'typePoll',
  multiple_choice: 'typeMultipleChoice',
  true_false: 'typeTrueFalse',
  short_answer: 'typeShortAnswer',
  pronunciation: 'typePronunciation',
  oral_response: 'typeOralResponse',
  custom_quiz: 'typeCustomQuiz',
  file_upload: 'typeFileUpload',
  listening: 'typeListening',
}

async function fetchAllRows<T>(table: string, sessionId: string, orderColumn: string) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await requireSupabase()
      .from(table)
      .select('*')
      .eq('session_id', sessionId)
      .order(orderColumn)
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data || []) as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

async function edgeFunctionMessage(error: unknown, t: PresenterT) {
  if (!(error instanceof Error)) return t('sessionAnalysisFailed')
  const context = (error as Error & { context?: Response }).context
  if (context) {
    try {
      const body = await context.clone().json()
      if (typeof body?.message === 'string') return body.message
    } catch {
      // Fall back to the SDK error message.
    }
  }
  return error.message
}

function formatPercent(value: number | null, t: PresenterT) {
  return value === null ? t('notDetermined') : `${value.toFixed(1)}%`
}

function BulletList({ items }: { items: string[] }) {
  const t = usePresenterText()
  if (!items.length) return <p className="muted">{t('notEnoughData')}</p>
  return <ul className="report-list">{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
}

const fileAnalysisLabels: Record<string, PresenterMessageKey> = {
  pending: 'statusPending',
  analyzing: 'statusGrading',
  success: 'statusSuccess',
  failed: 'statusFailed',
  unsupported: 'statusUnsupported',
}

const uploadVerdictLabels: Record<string, PresenterMessageKey> = {
  correct: 'verdictCorrect',
  partial: 'verdictPartial',
  incorrect: 'verdictIncorrect',
  unscored: 'verdictUnscored',
}

export function SessionReportPage() {
  const { sessionId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const generateRequested = searchParams.get('generate') === '1'
  const returnToSessionManager = useSessionReportBack()
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null)
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null)
  const [reportData, setReportData] = useState<SessionReportData | null>(null)
  // Its own window: the locale comes from the class that was taught, not from a
  // provider. The AI wrote this report in Chinese and translated it into
  // English, so a non-Chinese class reads the English one where it exists.
  //
  // Read on its own rather than off reportData, because the first thing this
  // page may have to say is that there is no report — and that sentence needs
  // the language before the report it is refusing to load.
  const [teachingLanguage, setTeachingLanguage] = useState<string | null>(null)
  const locale = presenterLocaleFor(teachingLanguage)
  const t = presenterLookup(locale)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [thinkingLevel, setThinkingLevel] = useState<ReportThinkingLevel>('LOW')
  const automaticLoadKeyRef = useRef('')

  const loadReportData = useCallback(async () => {
    const supabase = requireSupabase()
    const { data: session, error: sessionError } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
    if (sessionError) throw sessionError

    const [participants, messages, sharedContents, captionSegments, screenshots, questions, answers, aiSummaries, exitTickets, sessionEvents] = await Promise.all([
      fetchAllRows<Participant>('participants', sessionId, 'joined_at'),
      fetchAllRows<Message>('messages', sessionId, 'created_at'),
      fetchAllRows<SharedContent>('shared_contents', sessionId, 'created_at'),
      fetchAllRows<CaptionSegment>('caption_segments', sessionId, 'created_at'),
      fetchAllRows<Screenshot>('screenshots', sessionId, 'created_at'),
      fetchAllRows<Question>('questions', sessionId, 'created_at'),
      fetchAllRows<Answer>('answers', sessionId, 'submitted_at'),
      fetchAllRows<AiSummary>('ai_summaries', sessionId, 'created_at'),
      fetchAllRows<ExitTicket>('exit_tickets', sessionId, 'submitted_at'),
      fetchAllRows<SessionEvent>('session_events', sessionId, 'created_at'),
    ])

    const presenterToken = getPresenterToken(sessionId)
    if (!presenterToken) throw new Error(t('noRightsForRecordings'))
    const [recordingResult, customQuizResult, fileResult] = await Promise.all([
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_session_recording_results', sessionId, presenterToken },
      }),
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_session_custom_quiz_results', sessionId, presenterToken },
      }),
      // Session-wide: the presenter analyses uploads per file, and the report
      // has to carry whatever was analysed by the time the class ended.
      supabase.functions.invoke('presenter-action', {
        body: { action: 'get_file_responses', sessionId, presenterToken },
      }),
    ])
    if (recordingResult.error) throw new Error(await edgeFunctionMessage(recordingResult.error, t))
    if (customQuizResult.error) throw new Error(await edgeFunctionMessage(customQuizResult.error, t))

    setReportData({
      session: session as Session,
      participants,
      messages,
      sharedContents,
      captionSegments,
      screenshots,
      questions,
      answers,
      audioResponses: (recordingResult.data?.responses || []) as AudioResponse[],
      fileResponses: (fileResult.data?.responses || []) as FileResponse[],
      customQuizResults: customQuizResult.data as SessionCustomQuizResults,
      aiSummaries,
      exitTickets,
      buzzerEvents: sessionEvents.filter((event) => event.event_type === 'buzzer'),
    })
  }, [sessionId, t])

  const generateReport = useCallback(async (level?: ReportThinkingLevel) => {
    setLoading(true)
    setError('')
    try {
      const presenterToken = getPresenterToken(sessionId)
      if (!presenterToken) throw new Error(t('noRightsForReport'))

      const supabase = requireSupabase()
      const { data, error: functionError } = await supabase.functions.invoke('analyze-session', {
        body: { sessionId, presenterToken, ...(level ? { thinkingLevel: level } : {}) },
      })
      if (functionError) throw new Error(await edgeFunctionMessage(functionError, t))
      if (!data?.analysis || !data?.metrics) throw new Error(data?.message || t('noFullAnalysis'))

      setAnalysis(data.analysis as SessionAnalysis)
      setMetrics(data.metrics as SessionMetrics)
      await loadReportData()
    } catch (caught) {
      setError(await edgeFunctionMessage(caught, t))
    } finally {
      setLoading(false)
    }
  }, [loadReportData, sessionId, t])

  const loadSavedReport = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: summaryError } = await requireSupabase()
        .from('ai_summaries')
        .select('*')
        .eq('session_id', sessionId)
        .eq('type', 'exit_ticket_summary')
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (summaryError) throw summaryError

      const savedSummary = data as AiSummary | null
      const savedMetrics = savedSummary?.input_json?.metrics as SessionMetrics | undefined
      if (!savedSummary || !savedMetrics) {
        throw new Error(t('endedWithoutReport'))
      }

      setAnalysis(savedSummary.output_json as SessionAnalysis)
      setMetrics(savedMetrics)
      await loadReportData()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('reportReadFailed'))
    } finally {
      setLoading(false)
    }
  }, [loadReportData, sessionId, t])

  // One column, before anything else: every message this page can produce is in
  // the language of the class it belongs to.
  useEffect(() => {
    let cancelled = false
    void requireSupabase().from('sessions').select('teaching_language').eq('id', sessionId).maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setTeachingLanguage((data?.teaching_language as string | null) ?? '')
      })
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    // Held until the locale has arrived, so a failure is reported in the right
    // language rather than in whatever the fallback happened to be.
    if (teachingLanguage === null) return
    const loadKey = `${sessionId}:${generateRequested ? 'generate' : 'saved'}`
    if (automaticLoadKeyRef.current === loadKey) return
    automaticLoadKeyRef.current = loadKey
    if (generateRequested) {
      void generateReport()
    } else {
      void loadSavedReport()
    }
  }, [generateReport, generateRequested, loadSavedReport, sessionId, teachingLanguage])

  const questionMeta = useMemo(
    () => new Map((reportData?.questions || []).map((question, index) => [question.id, {
      number: index + 1,
      type: t(questionTypeLabels[question.type]),
    }])),
    [reportData?.questions, t],
  )

  // One row per student per question, the way the mark itself was made.
  const uploadSubmissions = useMemo(() => {
    const groups = new Map<string, FileResponse[]>()
    for (const response of reportData?.fileResponses || []) {
      const key = `${response.question_id}:${response.participant_id}`
      const existing = groups.get(key)
      if (existing) existing.push(response)
      else groups.set(key, [response])
    }
    const rank = (response: FileResponse) => response.analysis_status === 'success' ? 0
      : response.analysis_status === 'unsupported' ? 2 : 1
    return [...groups.entries()].map(([key, files]) =>
      [key, [...files].sort((left, right) => rank(left) - rank(right))] as const)
  }, [reportData?.fileResponses])

  async function exportExcel() {
    if (!reportData || !analysis || !metrics) return
    setExporting(true)
    setError('')
    try {
      const { exportSessionReport } = await import('../lib/exportSessionReport')
      await exportSessionReport(reportData, analysis, metrics)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('excelExportFailed'))
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <main className="session-report-page report-loading">
        <CircleNotch className="spin" size={34} />
        <h1>{generateRequested ? t('analysingWholeClass') : t('readingReport')}</h1>
        <p className="muted">
          {generateRequested ? t('analysingWholeClassHint') : t('readingReportHint')}
        </p>
        <button className="ghost-button" type="button" onClick={() => void returnToSessionManager()}>
          <ArrowLeft size={17} />{t('backToSessions')}
        </button>
      </main>
    )
  }

  if (error && (!analysis || !metrics || !reportData)) {
    return (
      <main className="session-report-page report-loading">
        <h1>{t('reportNotMade')}</h1>
        <p className="error">{error}</p>
        <fieldset className="report-mode-picker">
          <legend>{t('analysisMode')}</legend>
          {reportModes.map((mode) => (
            <label key={mode.level}>
              <input
                checked={thinkingLevel === mode.level}
                name="report-thinking-level"
                type="radio"
                value={mode.level}
                onChange={() => setThinkingLevel(mode.level)}
              />
              <span className="report-mode-label">{t(mode.label)}</span>
              <span className="report-mode-hint">{t(mode.hint)}</span>
            </label>
          ))}
        </fieldset>
        <div className="report-actions">
          <button type="button" onClick={() => void generateReport(thinkingLevel)}>
            <ArrowsClockwise size={17} />{t('makeReport')}
          </button>
          <button className="ghost-button" type="button" onClick={() => void returnToSessionManager()}>
            <ArrowLeft size={17} />{t('backToSessions')}
          </button>
        </div>
      </main>
    )
  }

  if (!analysis || !metrics || !reportData) return null

  // The analysis itself is AI prose, not interface text, so it cannot come from
  // the message table. The report is written in Chinese and translated into
  // English in the same call; anything else falls back to what was written.
  const report = locale === 'zh-TW' ? analysis : { ...analysis, ...(analysis.translations?.en || {}) }
  // 、 reads as a list in Chinese and as a typo in English.
  const listJoin = locale === 'zh-TW' ? '、' : ', '

  return (
    <PresenterLocaleContext.Provider value={locale}>
    <main className="session-report-page">
      <header className="report-header">
        <div>
          <p className="eyebrow">LingoAct Session Report</p>
          <h1><BookOpen size={28} />{t('reportTitle')}</h1>
          <p className="muted">{reportData.session.title}．{new Date(reportData.session.created_at).toLocaleString(locale)}</p>
        </div>
        <div className="report-actions">
          <button className="ghost-button" type="button" onClick={() => void returnToSessionManager()}>
            <ArrowLeft size={17} />{t('backToSessions')}
          </button>
          <button type="button" onClick={exportExcel} disabled={exporting}>
            {exporting ? <CircleNotch className="spin" size={17} /> : <DownloadSimple size={17} />}
            {exporting ? t('exporting') : t('exportExcel')}
          </button>
        </div>
      </header>

      {error && <p className="report-inline-error error">{error}</p>}

      <section className="report-metrics" aria-label={t('reportMetricsLabel')}>
        <article><Users size={20} /><span>{t('metricParticipants')}</span><strong>{metrics.participant_count}</strong></article>
        <article><ChatText size={20} /><span>{t('metricMessages')}</span><strong>{metrics.message_count}</strong></article>
        <article><ListChecks size={20} /><span>{t('metricQuestions')}</span><strong>{metrics.question_count}／{metrics.answer_count}</strong></article>
        <article><ChartLineUp size={20} /><span>{t('metricResponseRate')}</span><strong>{formatPercent(metrics.average_response_rate, t)}</strong></article>
        <article><Clock size={20} /><span>{t('metricDuration')}</span><strong>{t('minutes', { n: metrics.duration_minutes })}</strong></article>
      </section>

      <section className="report-section report-summary-band">
        <div className="report-section-heading">
          <h2>{t('aiClassSummary')}</h2>
          <span className={`engagement-badge ${analysis.engagement_analysis.level}`}>
            {t('engagementLevel', { level: t(analysis.engagement_analysis.level === 'high' ? 'levelHigh' : analysis.engagement_analysis.level === 'medium' ? 'levelMedium' : 'levelLow') })}
          </span>
        </div>
        <p className="report-lead">{report.executive_summary}</p>
        <p>{report.engagement_analysis.summary}</p>
      </section>

      {report.lesson_key_points?.length ? (
        <section className="report-section report-summary-band">
          <div className="report-section-heading">
            <BookOpen size={20} />
            <h2>{t('lessonKeyPoints')}</h2>
          </div>
          <ul>
            {report.lesson_key_points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </section>
      ) : null}

      <section className="report-section">
        <h2>{t('sharedTextAndLinks')}</h2>
        {reportData.sharedContents.length ? (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>{t('colSentAt')}</th><th>{t('colText')}</th><th>{t('colLink')}</th></tr></thead>
              <tbody>
                {reportData.sharedContents.map((content) => (
                  <tr key={content.id}>
                    <td>{new Date(content.created_at).toLocaleString(locale)}</td>
                    <td>{content.body || '—'}</td>
                    <td>
                      {content.url
                        ? <a href={content.url} rel="noreferrer" target="_blank">{content.url}</a>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">{t('noSharedContents')}</p>}
      </section>

      <section className="report-section">
        <h2>{t('recordingResults')}</h2>
        {reportData.audioResponses.length ? (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>{t('colQuestion')}</th><th>{t('colName')}</th><th>{t('colLanguageScore')}</th><th>{t('colAiAnalysis')}</th><th>{t('colStrengths')}</th><th>{t('colImprovements')}</th></tr></thead>
              <tbody>
                {reportData.audioResponses.map((response) => {
                  const stored = response.analysis_json
                  const item = locale === 'zh-TW' || !stored ? stored : { ...stored, ...(stored.translations?.en || {}) }
                  const meta = questionMeta.get(response.question_id)
                  return (
                    <tr key={response.id}>
                      <td>{meta ? `${meta.number}．${meta.type}` : '—'}</td>
                      <td>{response.participant_name}</td>
                      <td>{response.detected_language || '—'}<br />{typeof response.score === 'number' ? t('points', { n: response.score }) : t('analysisIncomplete')}</td>
                      <td>{item?.summary || response.error_message || '—'}</td>
                      <td>{item?.strengths.join(listJoin) || '—'}</td>
                      <td>{item?.improvements.join(listJoin) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">{t('noRecordingResults')}</p>}
      </section>

      <section className="report-section">
        <h2>{t('uploadMarking')}</h2>
        {uploadSubmissions.length ? (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>{t('colQuestion')}</th><th>{t('colName')}</th><th>{t('colFiles')}</th><th>{t('colVerdictScore')}</th><th>{t('colAiMarking')}</th><th>{t('didWell')}</th><th>{t('couldImprove')}</th></tr></thead>
              <tbody>
                {uploadSubmissions.map(([key, files]) => {
                  const lead = files[0]
                  const item = lead.analysis_json
                  const meta = questionMeta.get(lead.question_id)
                  return (
                    <tr key={key}>
                      <td>{meta ? `${meta.number}．${meta.type}` : '—'}</td>
                      <td>{lead.participant_name}</td>
                      <td>{files.map((file) => file.name).join(listJoin)}</td>
                      <td>
                        {item?.verdict
                          ? uploadVerdictLabels[item.verdict] ? t(uploadVerdictLabels[item.verdict]) : item.verdict
                          : fileAnalysisLabels[lead.analysis_status] ? t(fileAnalysisLabels[lead.analysis_status]) : '—'}
                        <br />{typeof item?.score === 'number' ? t('points', { n: item.score }) : '—'}
                      </td>
                      <td>{(locale === 'zh-TW' ? item?.summary_zh_tw : item?.summary_en || item?.summary_zh_tw) || lead.error_message || '—'}</td>
                      <td>{(locale === 'zh-TW' ? item?.strengths_zh_tw : item?.strengths_en?.length ? item.strengths_en : item?.strengths_zh_tw)?.join(listJoin) || '—'}</td>
                      <td>{(locale === 'zh-TW' ? item?.improvements_zh_tw : item?.improvements_en?.length ? item.improvements_en : item?.improvements_zh_tw)?.join(listJoin) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">{t('noUploadResults')}</p>}
      </section>

      <div className="report-two-column">
        <section className="report-section">
          <h2>{t('interactionObserved')}</h2>
          <h3>{t('participation')}</h3>
          <BulletList items={report.engagement_analysis.participation_observations} />
          <h3>{t('danmakuContent')}</h3>
          <BulletList items={report.engagement_analysis.danmaku_observations} />
        </section>
        <section className="report-section">
          <h2>{t('learningUnderstanding')}</h2>
          <p>{report.learning_analysis.overall_understanding}</p>
          <h3>{t('learningStrengths')}</h3>
          <BulletList items={report.learning_analysis.strengths} />
          <h3>{t('commonMisconceptions')}</h3>
          <BulletList items={report.learning_analysis.misconceptions} />
        </section>
      </div>

      <section className="report-section">
        <h2>{t('questionAnalysis')}</h2>
        {report.learning_analysis.question_findings.length ? (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr><th>{t('colType')}</th><th>{t('colNumber')}</th><th>{t('colPrompt')}</th><th>{t('colResult')}</th><th>{t('colEvidence')}</th></tr></thead>
              <tbody>
                {report.learning_analysis.question_findings.map((finding) => (
                  <tr key={finding.question_id}>
                    <td>{questionMeta.get(finding.question_id)?.type || '—'}</td>
                    <td>{questionMeta.get(finding.question_id)?.number || '—'}</td>
                    <td>{finding.detected_question}</td>
                    <td>{finding.result_summary}</td>
                    <td>{finding.evidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">{t('noAnalysableQuestions')}</p>}
      </section>

      <div className="report-two-column">
        <section className="report-section">
          <h2>{t('teachingAdvice')}</h2>
          <h3>{t('immediateActionsHeading')}</h3>
          <BulletList items={report.teaching_recommendations.immediate_actions} />
          <h3>{t('nextLessonActions')}</h3>
          <BulletList items={report.teaching_recommendations.next_lesson_actions} />
        </section>
        <section className="report-section">
          <h2>{t('followUpQuestions')}</h2>
          <BulletList items={report.teaching_recommendations.follow_up_questions} />
          <h3>{t('analysisLimits')}</h3>
          <BulletList items={report.limitations} />
        </section>
      </div>
    </main>
    </PresenterLocaleContext.Provider>
  )
}
