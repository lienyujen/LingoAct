import { useEffect, useRef, useState } from 'react'
import { Camera, CircleNotch, DownloadSimple, FileArrowUp, Sparkle, UploadSimple } from '@phosphor-icons/react'
import { requireSupabase } from '../lib/supabase'
import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'
import { downloadHref, publicFileUrl } from '../lib/fileLinks'
import { PhotoCaptionCard } from './PhotoCaptionCard'
import type { FileAnalysis, SharedFile } from '../types'

type Props = {
  sessionId: string
  locale: ParticipantLocale
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}


export function ParticipantSharedFiles({ sessionId, locale }: Props) {
  const [files, setFiles] = useState<SharedFile[]>([])

  useEffect(() => {
    if (!sessionId) return
    const supabase = requireSupabase()
    let active = true

    async function load() {
      const { data } = await supabase.from('shared_files')
        .select('*').eq('session_id', sessionId).order('created_at')
      if (active) setFiles((data || []) as SharedFile[])
    }
    void load()

    const channel = supabase.channel(`shared-files:${sessionId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shared_files', filter: `session_id=eq.${sessionId}`,
      }, () => void load())
      .subscribe()

    // A phone suspends the socket as soon as the browser goes to the background,
    // so every change made while the screen was off is missed. Without this the
    // list keeps offering files the teacher has already removed, and tapping one
    // returns a 404 from Storage.
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [sessionId])

  if (!files.length) return null

  return (
    <section className="panel participant-shared-files">
      <h2><DownloadSimple size={17} />{participantText(locale, 'teacherFiles')}</h2>
      <ul>
        {files.map((file) => (
          <li key={file.id}>
            <a
              href={downloadHref(file.file_url || publicFileUrl(file.storage_path), file.name)}
              rel="noreferrer"
              target="_blank"
            >
              {file.name}
            </a>
            <span className="muted">{formatSize(file.file_size)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type UploadProps = {
  sessionId: string
  questionId: string
  participantId: string
  participantToken: string
  promptText: string | null
  // A question dispatched from a screenshot lives on the image, so it belongs
  // inside this panel rather than further down the page under everything else.
  imageUrl?: string | null
  // 拍照描述: the teacher asked for a description with each picture.
  wantsCaption?: boolean
  active: boolean
  locale: ParticipantLocale
}

type Uploaded = { id: string; name: string; previewUrl: string | null }

// What the student is told back about their own upload. Their rows only, read
// through the Edge Function: file_responses is granted to nobody.
type MyResponse = {
  id: string
  name: string
  caption: string | null
  analysis_status: 'pending' | 'analyzing' | 'success' | 'failed' | 'unsupported'
  analysis_json: FileAnalysis | null
  error_message: string | null
}

// 'success' is absent on purpose: a marked row shows the marking, not a
// status line about it.
const statusKeys: Partial<Record<MyResponse['analysis_status'], 'markPending' | 'markRunning' | 'markFailed' | 'markUnsupported'>> = {
  pending: 'markPending',
  analyzing: 'markRunning',
  failed: 'markFailed',
  unsupported: 'markUnsupported',
}

const verdictKeys = {
  correct: 'fileVerdictCorrect',
  partial: 'fileVerdictPartial',
  incorrect: 'fileVerdictIncorrect',
  unscored: 'fileVerdictUnscored',
} as const

// The marking is written in both languages; which one a student reads follows
// the language they are on, the same as every other AI text on this page.
function inLocale(analysis: FileAnalysis, locale: ParticipantLocale) {
  const chinese = locale === 'zh-TW'
  return {
    summary: (chinese ? analysis.summary_zh_tw : analysis.summary_en) || analysis.summary_zh_tw || '',
    strengths: (chinese ? analysis.strengths_zh_tw : analysis.strengths_en)?.length
      ? (chinese ? analysis.strengths_zh_tw : analysis.strengths_en)
      : analysis.strengths_zh_tw || [],
    improvements: (chinese ? analysis.improvements_zh_tw : analysis.improvements_en)?.length
      ? (chinese ? analysis.improvements_zh_tw : analysis.improvements_en)
      : analysis.improvements_zh_tw || [],
  }
}

// The marking never reached the student: it was written to file_responses, read
// by the teacher's panel, and that was the end of it — so pressing AI 批改
// changed nothing the class could see. Polled rather than pushed because it
// arrives when the teacher decides to press the button, which may be minutes
// after the upload or not at all.
function MyUploadMarking({ sessionId, questionId, participantId, participantToken, locale }: {
  sessionId: string
  questionId: string
  participantId: string
  participantToken: string
  locale: ParticipantLocale
}) {
  const [responses, setResponses] = useState<MyResponse[]>([])

  useEffect(() => {
    if (!sessionId || !questionId || !participantId || !participantToken) return
    let active = true
    async function load() {
      const { data } = await requireSupabase().functions.invoke('participant-action', {
        body: { action: 'get_my_file_responses', sessionId, questionId, participantId, participantToken },
      })
      if (active) setResponses((data?.responses || []) as MyResponse[])
    }
    void load()
    const timer = window.setInterval(() => void load(), 8000)
    return () => { active = false; window.clearInterval(timer) }
  }, [sessionId, questionId, participantId, participantToken])

  if (!responses.length) return null

  return (
    <div className="my-upload-marking">
      <h3><Sparkle size={15} />{participantText(locale, 'myUploads')}</h3>
      {responses.map((response) => {
        const analysis = response.analysis_status === 'success' ? response.analysis_json : null
        const text = analysis ? inLocale(analysis, locale) : null
        const verdict = analysis?.verdict
        return (
          <article className="my-upload-row" key={response.id}>
            <div className="my-upload-head">
              <strong>{response.name}</strong>
              {verdict && <span className={`file-verdict is-${verdict}`}>{participantText(locale, verdictKeys[verdict])}</span>}
              {typeof analysis?.score === 'number' && (
                <span className="upload-score">{analysis.score} {participantText(locale, 'points')}</span>
              )}
              {!analysis && (
                <span className="my-upload-status">
                  {participantText(locale, statusKeys[response.analysis_status] || 'markPending')}
                </span>
              )}
            </div>
            {response.caption && <p className="my-upload-caption">{response.caption}</p>}
            {text?.summary && <p className="my-upload-summary">{text.summary}</p>}
            {text && text.strengths.length > 0 && (
              <>
                <h4>{participantText(locale, 'fileDidWell')}</h4>
                <ul>{text.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </>
            )}
            {text && text.improvements.length > 0 && (
              <>
                <h4>{participantText(locale, 'fileCouldImprove')}</h4>
                <ul>{text.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </>
            )}
          </article>
        )
      })}
    </div>
  )
}

export function ParticipantFileUpload({
  sessionId,
  questionId,
  participantId,
  participantToken,
  promptText,
  imageUrl,
  wantsCaption,
  active,
  locale,
}: UploadProps) {
  const [uploaded, setUploaded] = useState<Uploaded[]>([])

  // The previews are object URLs over the files the student just picked; the
  // browser holds the blob until they are handed back.
  useEffect(() => () => {
    for (const item of uploaded) if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }, [uploaded])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  // Phones and tablets get a shortcut straight to the camera. On a mouse-driven
  // machine `capture` is ignored, so the button would just be a second file
  // picker — hide it there rather than offer the same thing twice.
  const [hasCamera] = useState(() => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
  ))

  async function upload(files: File[]) {
    if (!files.length) return
    setBusy(true)
    setError('')
    const supabase = requireSupabase()
    try {
      for (const file of files) {
        const { data: prepared, error: prepareError } = await supabase.functions.invoke('participant-action', {
          body: {
            action: 'prepare_file_upload',
            sessionId,
            participantId,
            participantToken,
            questionId,
            fileName: file.name,
            fileSize: file.size,
          },
        })
        if (prepareError) throw prepareError
        if (!prepared?.uploadToken) throw new Error(prepared?.message || participantText(locale, 'uploadFailed'))

        const { error: uploadError } = await supabase.storage
          .from('lingoact-files')
          .uploadToSignedUrl(prepared.storagePath, prepared.uploadToken, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          })
        if (uploadError) throw uploadError

        const { data: submitted, error: submitError } = await supabase.functions.invoke('participant-action', {
          body: {
            action: 'submit_file_response',
            sessionId,
            participantId,
            participantToken,
            questionId,
            storagePath: prepared.storagePath,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
          },
        })
        if (submitError) throw submitError
        setUploaded((current) => [...current, {
          id: submitted?.response?.id || prepared.fileId,
          name: file.name,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        }])
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : participantText(locale, 'uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel participant-file-upload">
      <h2><FileArrowUp size={17} />{participantText(locale, 'fileUpload')}</h2>
      {imageUrl && <img alt={participantText(locale, 'imageAlt')} className="participant-image participant-file-image" src={imageUrl} />}
      {promptText && <p className="participant-file-prompt">{promptText}</p>}
      {active ? (
        <>
          <div className="participant-upload-actions">
            <button disabled={busy} type="button" onClick={() => inputRef.current?.click()}>
              {busy ? <CircleNotch className="spin" size={17} /> : <UploadSimple size={17} />}
              {busy ? participantText(locale, 'fileUploading') : participantText(locale, 'chooseFile')}
            </button>
            {hasCamera && (
              <button disabled={busy} type="button" onClick={() => cameraRef.current?.click()}>
                <Camera size={17} />
                {participantText(locale, 'takePhoto')}
              </button>
            )}
          </div>
          <input
            accept="image/*,.pdf,.txt,.md,.csv,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip"
            hidden
            multiple
            ref={inputRef}
            type="file"
            onChange={(event) => {
              void upload(Array.from(event.target.files || []))
              event.target.value = ''
            }}
          />
          <input
            accept="image/*"
            capture="environment"
            hidden
            ref={cameraRef}
            type="file"
            onChange={(event) => {
              void upload(Array.from(event.target.files || []))
              event.target.value = ''
            }}
          />
        </>
      ) : <p className="muted">{participantText(locale, 'uploadClosed')}</p>}
      {error && <p className="error">{error}</p>}
      <MyUploadMarking
        locale={locale}
        participantId={participantId}
        participantToken={participantToken}
        questionId={questionId}
        sessionId={sessionId}
      />
      {uploaded.length > 0 && (wantsCaption ? (
        // 拍照描述: one card per picture, so a student who sends two describes
        // each of them rather than writing one description for the pair.
        <div className="photo-caption-list">
          {uploaded.map((item) => (
            <PhotoCaptionCard
              fileName={item.name}
              key={item.id}
              locale={locale}
              participantId={participantId}
              participantToken={participantToken}
              previewUrl={item.previewUrl}
              responseId={item.id}
              sessionId={sessionId}
            />
          ))}
        </div>
      ) : (
        <ul className="participant-uploaded-list">
          {uploaded.map((item) => <li key={item.id}><Sparkle size={13} />{item.name}</li>)}
        </ul>
      ))}
    </section>
  )
}
