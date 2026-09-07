import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DragEvent } from 'react'
import { CircleNotch, DownloadSimple, FileArrowUp, PaperPlaneTilt, Share, Sparkle, Square, Trash, UploadSimple, X } from '@phosphor-icons/react'
import { downloadHref } from '../lib/fileLinks'
import { isAnalyzableFile, quizSettingsFrom } from '../lib/customQuiz'
import { CustomQuizFields } from './CustomQuizFields'
import type { CustomQuizSettings } from '../lib/customQuiz'
import type { FileResponse, Question, QuizRequestedType, SharedFile } from '../types'
import { usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'

type Tab = 'share' | 'collect'

type Props = {
  busy: boolean
  sharedFiles: SharedFile[]
  collectQuestion: Question | null
  fileResponses: FileResponse[]
  fileBusyId: string
  onClose: () => void
  onShareFiles: (files: File[]) => Promise<void>
  onDeleteSharedFile: (fileId: string) => Promise<void>
  onStartCollect: (promptText: string) => Promise<void>
  onStopCollect: () => Promise<void>
  onRefreshResponses: () => Promise<void>
  onAnalyzeResponse: (responseId: string) => Promise<void>
  onCreateFileQuiz: (fileId: string, settings: CustomQuizSettings) => Promise<void>
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isImage(mimeType: string, name: string) {
  return mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name)
}

const analysisLabels: Record<FileResponse['analysis_status'], PresenterMessageKey> = {
  pending: 'statusPending',
  analyzing: 'statusAnalyzing',
  success: 'statusSuccess',
  failed: 'statusFailed',
  unsupported: 'statusUnsupported',
}

const verdictLabels: Record<string, PresenterMessageKey> = {
  correct: 'verdictCorrect',
  partial: 'verdictPartial',
  incorrect: 'verdictIncorrect',
  unscored: 'verdictUnscored',
}

export function FileTransferModal({
  busy,
  sharedFiles,
  collectQuestion,
  fileResponses,
  fileBusyId,
  onClose,
  onShareFiles,
  onDeleteSharedFile,
  onStartCollect,
  onStopCollect,
  onRefreshResponses,
  onAnalyzeResponse,
  onCreateFileQuiz,
}: Props) {
  const t = usePresenterText()
  const [tab, setTab] = useState<Tab>('share')
  const [dragging, setDragging] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [expanded, setExpanded] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [quizFile, setQuizFile] = useState<SharedFile | null>(null)
  const [quizCount, setQuizCount] = useState('auto')
  const [quizType, setQuizType] = useState<QuizRequestedType>('random')
  const [quizCoaching, setQuizCoaching] = useState(false)
  const [quizDirection, setQuizDirection] = useState('')

  const collecting = collectQuestion?.status === 'active'

  useEffect(() => {
    if (tab !== 'collect' || !collectQuestion) return
    void onRefreshResponses()
  }, [collectQuestion, onRefreshResponses, tab])

  const handleFiles = useCallback(async (files: File[]) => {
    if (!files.length) return
    setUploading(true)
    setError('')
    try {
      await onShareFiles(files)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('uploadFailed'))
    } finally {
      setUploading(false)
    }
  }, [onShareFiles, t])

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void handleFiles(Array.from(event.dataTransfer.files))
  }

  async function guard(run: () => Promise<void>) {
    setError('')
    try {
      await run()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('actionFailed'))
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="file-transfer-title" aria-modal="true" className="modal file-transfer-modal" role="dialog">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">LingoAct</p>
            <h2 id="file-transfer-title">{t('fileTransfer')}</h2>
          </div>
          <button aria-label={t('closeFileTransfer')} className="icon-button ghost-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="file-transfer-tabs">
          <button className={tab === 'share' ? 'is-active' : ''} type="button" onClick={() => setTab('share')}>
            <Share size={16} />{t('teacherShare')}
          </button>
          <button className={tab === 'collect' ? 'is-active' : ''} type="button" onClick={() => setTab('collect')}>
            <FileArrowUp size={16} />{t('studentUpload')}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {tab === 'share' ? (
          <div className="file-transfer-body">
            <p className="muted">{t('shareHint')}</p>
            <div
              className={`file-dropzone${dragging ? ' is-dragging' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onDragLeave={() => setDragging(false)}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDrop={onDrop}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click() }}
            >
              {uploading ? <CircleNotch className="spin" size={26} /> : <UploadSimple size={26} />}
              <strong>{uploading ? t('uploadingNow') : t('dragHere')}</strong>
              <span className="muted">{t('orPickFiles')}</span>
            </div>
            <input
              hidden
              multiple
              ref={inputRef}
              type="file"
              onChange={(event) => {
                void handleFiles(Array.from(event.target.files || []))
                event.target.value = ''
              }}
            />

            <h3>{t('sharedCount')} <span>{sharedFiles.length}</span></h3>
            {sharedFiles.length ? (
              <ul className="file-list">
                {sharedFiles.map((file) => (
                  <li key={file.id}>
                    <div className="file-list-meta">
                      <strong>{file.name}</strong>
                      <span className="muted">{formatSize(file.file_size)}</span>
                    </div>
                    <div className="file-list-actions">
                      {file.file_url && (
                        <a className="ghost-button" href={downloadHref(file.file_url, file.name)} rel="noreferrer" target="_blank">
                          <DownloadSimple size={15} />{t('openFile')}
                        </a>
                      )}
                      <button
                        className="danger-ghost-button"
                        disabled={busy}
                        type="button"
                        onClick={() => void guard(() => onDeleteSharedFile(file.id))}
                      >
                        <Trash size={15} />{t('remove')}
                      </button>
                      {/* Only for formats Gemini can actually read: offering it on a
                          .pptx would fail after the question was already dispatched. */}
                      {isAnalyzableFile(file.mime_type, file.name) && (
                        <button
                          className="ghost-button"
                          disabled={busy}
                          type="button"
                          onClick={() => { setQuizFile(file); setQuizCount('auto'); setQuizType('random'); setQuizDirection('') }}
                        >
                          <Sparkle size={15} />{t('typeCustomQuiz')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">{t('noSharedFiles')}</p>}
          </div>
        ) : (
          <div className="file-transfer-body">
            <p className="muted">{t('collectHint')}</p>
            <label>
              {t('promptLabel')}
              <textarea
                disabled={collecting}
                placeholder={t('collectPlaceholder')}
                rows={2}
                value={collecting ? collectQuestion?.prompt_text || '' : prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            </label>
            <div className="file-transfer-controls">
              {collecting ? (
                <button disabled={busy} type="button" onClick={() => void guard(onStopCollect)}>
                  <Square size={16} />{t('stopCollect')}
                </button>
              ) : (
                <button disabled={busy} type="button" onClick={() => void guard(() => onStartCollect(prompt))}>
                  <PaperPlaneTilt size={16} />{t('sendUpload')}
                </button>
              )}
              {collectQuestion && (
                <button className="ghost-button" disabled={busy} type="button" onClick={() => void guard(onRefreshResponses)}>
                  <CircleNotch size={16} />{t('refresh')}
                </button>
              )}
            </div>

            {collectQuestion && (
              <>
                <h3>{t('studentReturns')} <span>{fileResponses.length}</span></h3>
                {fileResponses.length ? (
                  <ul className="file-list">
                    {fileResponses.map((response) => (
                      <li key={response.id}>
                        <div className="file-response-row">
                          {isImage(response.mime_type, response.name) && response.file_url ? (
                            <a href={response.file_url} rel="noreferrer" target="_blank">
                              <img alt={response.name} className="file-response-thumb" src={response.file_url} />
                            </a>
                          ) : <span className="file-response-thumb is-placeholder"><FileArrowUp size={18} /></span>}
                          <div className="file-list-meta">
                            <strong>{response.participant_name}</strong>
                            <span className="muted">{response.name} · {formatSize(response.file_size)}</span>
                            <span className="upload-verdict-line">
                              {response.analysis_json?.verdict && (
                                <span className={`file-verdict is-${response.analysis_json.verdict}`}>
                                  {verdictLabels[response.analysis_json.verdict] ? t(verdictLabels[response.analysis_json.verdict]) : response.analysis_json.verdict}
                                </span>
                              )}
                              {typeof response.analysis_json?.score === 'number' && (
                                <span className="upload-score">{t('points', { n: response.analysis_json.score })}</span>
                              )}
                              {!response.analysis_json?.verdict && (
                                <span className={`file-analysis-status is-${response.analysis_status}`}>
                                  {t(analysisLabels[response.analysis_status])}
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="file-list-actions">
                            {response.file_url && (
                              <a className="ghost-button" href={downloadHref(response.file_url, response.name)} rel="noreferrer" target="_blank">
                                <DownloadSimple size={15} />{t('download')}
                              </a>
                            )}
                            {response.analysis_status !== 'unsupported' && (
                              <button
                                disabled={busy || fileBusyId === response.id || response.analysis_status === 'analyzing'}
                                type="button"
                                onClick={() => void guard(() => onAnalyzeResponse(response.id))}
                              >
                                <Sparkle size={15} />{response.analysis_status === 'success' ? t('markAgain') : t('aiMark')}
                              </button>
                            )}
                            {response.analysis_status === 'success' && (
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => setExpanded(expanded === response.id ? '' : response.id)}
                              >
                                {expanded === response.id ? t('collapse') : t('seeMarking')}
                              </button>
                            )}
                          </div>
                        </div>
                        {response.error_message && response.analysis_status !== 'success' && (
                          <p className="muted file-analysis-error">{response.error_message}</p>
                        )}
                        {expanded === response.id && response.analysis_json && (
                          <div className="file-analysis-detail">
                            <p>{response.analysis_json.summary_zh_tw}</p>
                            {response.analysis_json.strengths_zh_tw.length > 0 && (
                              <>
                                <h4>{t('didWell')}</h4>
                                <ul>{response.analysis_json.strengths_zh_tw.map((item, index) => <li key={index}>{item}</li>)}</ul>
                              </>
                            )}
                            {response.analysis_json.improvements_zh_tw.length > 0 && (
                              <>
                                <h4>{t('couldImprove')}</h4>
                                <ul>{response.analysis_json.improvements_zh_tw.map((item, index) => <li key={index}>{item}</li>)}</ul>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">{t('noStudentFiles')}</p>}
              </>
            )}
          </div>
        )}
      </section>

      {quizFile && createPortal(
        <div className="modal-backdrop is-nested" role="presentation">
          <form
            aria-labelledby="file-quiz-title"
            aria-modal="true"
            className="modal question-editor-modal"
            role="dialog"
            onSubmit={(event) => {
              event.preventDefault()
              const direction = quizDirection.trim()
              if (!direction) return
              const file = quizFile
              setQuizFile(null)
              void guard(() => onCreateFileQuiz(file.id, quizSettingsFrom(quizCount, quizType, direction, quizCoaching)))
            }}
          >
            <h2 id="file-quiz-title">{t('typeCustomQuiz')}</h2>
            <p className="muted">{t('fileQuizSub', { name: quizFile.name })}</p>
            <CustomQuizFields
              coaching={quizCoaching}
              count={quizCount}
              direction={quizDirection}
              quizType={quizType}
              onCoachingChange={setQuizCoaching}
              onCountChange={setQuizCount}
              onDirectionChange={setQuizDirection}
              onTypeChange={setQuizType}
            />
            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => setQuizFile(null)}>
                <X size={17} />{t('cancel')}
              </button>
              <button disabled={busy || !quizDirection.trim()} type="submit">
                <Sparkle size={17} />{t('generateAndSend')}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </div>
  )
}
