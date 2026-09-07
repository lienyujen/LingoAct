import { useEffect, useRef, useState } from 'react'
import { Camera, CircleNotch, DownloadSimple, FileArrowUp, Sparkle, UploadSimple } from '@phosphor-icons/react'
import { requireSupabase } from '../lib/supabase'
import { participantText } from '../lib/participantI18n'
import type { ParticipantLocale } from '../lib/participantI18n'
import { downloadHref, publicFileUrl } from '../lib/fileLinks'
import { PhotoCaptionCard } from './PhotoCaptionCard'
import type { SharedFile } from '../types'

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
