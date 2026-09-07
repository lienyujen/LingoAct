import { useEffect, useState } from 'react'
import { ArrowsClockwise, CardsThree, Crop, Image as ImageIcon, Microphone, PaperPlaneTilt, PencilSimpleLine, Sparkle, X } from '@phosphor-icons/react'
import { TimingRow } from './TimingRow'
import { dispatchPictureOrdering, describePicture, generatePicture } from '../lib/picture'
import type { GeneratedPicture, PictureStoryboard } from '../lib/picture'
import { usePresenterText } from '../lib/presenterI18n'
import type { QuestionDraft } from './QuestionEditor'

type Props = {
  open: boolean
  sessionId: string
  presenterToken: string
  // A picture the teacher grabbed off their own screen — a textbook page, a
  // photograph in a slide. Read by the AI rather than drawn by it, so it comes
  // with prompts but no storyboard.
  // Kept mounted but out of sight while the drag-select capture is running.
  suspended?: boolean
  capturedScreen?: File | null
  onCapturedScreenRead?: () => void
  // The desktop app's drag-select capture, absent in the browser.
  onCaptureScreen?: () => void
  onClose: () => void
  onDispatch: (file: File, draft: QuestionDraft) => Promise<void>
}

// What to do with the picture. 口說 and 打字 send it whole as an ordinary
// question that happens to carry an image; 排順序 cuts it into its four panels
// and sends them shuffled as a 故事排序 quiz, so the intact picture — which is
// the answer — never reaches the class at all.
type Mode = 'written' | 'spoken' | 'ordering'

const ANSWER_PRESETS: Array<number | null> = [null, 60, 120, 180]
const PREPARE_PRESETS: Array<number | null> = [null, 10, 20, 30]

function promptFor(mode: Mode, storyboard: PictureStoryboard) {
  if (mode === 'spoken') return storyboard.spokenPrompt
  if (mode === 'written') return storyboard.writtenPrompt
  return storyboard.orderPrompt
}

export function PictureStudioModal({
  open,
  sessionId,
  presenterToken,
  suspended = false,
  capturedScreen,
  onCapturedScreenRead,
  onCaptureScreen,
  onClose,
  onDispatch,
}: Props) {
  const t = usePresenterText()
  const [direction, setDirection] = useState('')
  const [picture, setPicture] = useState<GeneratedPicture | null>(null)
  const [mode, setMode] = useState<Mode>('spoken')
  const [promptText, setPromptText] = useState('')
  // The teacher may have rewritten the instruction; flipping between speaking
  // and writing should not silently throw that away.
  const [promptTouched, setPromptTouched] = useState(false)
  const [prepareSeconds, setPrepareSeconds] = useState<number | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  // A captured picture is one image, so there are no four panels to cut apart:
  // 排順序 needs the 2x2 grid the drawing prompt produces.
  const [drawn, setDrawn] = useState(true)
  const [caution, setCaution] = useState('')

  useEffect(() => {
    if (open) return
    setDirection('')
    setPicture(null)
    setMode('spoken')
    setPromptText('')
    setPromptTouched(false)
    setPrepareSeconds(null)
    setAnswerSeconds(null)
    setBusy('')
    setError('')
    setSent(false)
    setDrawn(true)
    setCaution('')
  }, [open])

  useEffect(() => {
    if (!picture || promptTouched) return
    setPromptText(promptFor(mode, picture.storyboard))
  }, [mode, picture, promptTouched])

  // readCapture is a hoisted function declaration, so it is in scope here even
  // though it is written below the early return.
  useEffect(() => {
    if (!capturedScreen) return
    onCapturedScreenRead?.()
    void readCapture(capturedScreen)
    // readCapture is redefined every render; the captured file is what changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedScreen])

  if (!open) return null

  async function readCapture(file: File) {
    setError('')
    setSent(false)
    setCaution('')
    setBusy(t('readingPicture'))
    try {
      const read = await describePicture({ sessionId, presenterToken, direction: direction.trim(), file }, t)
      setPicture(read)
      setDrawn(false)
      setCaution(read.caution)
      // 排順序 is not available for a captured picture, so a teacher who was on
      // it lands somewhere that works rather than on a tab that has gone.
      const next = mode === 'ordering' ? 'spoken' : mode
      setMode(next)
      setPromptTouched(false)
      setPromptText(promptFor(next, read.storyboard))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('pictureReadFailed'))
    } finally {
      setBusy('')
    }
  }

  async function draw() {
    setError('')
    setSent(false)
    setCaution('')
    setBusy(t('drawing'))
    try {
      const made = await generatePicture({ sessionId, presenterToken, direction: direction.trim() }, t)
      setPicture(made)
      setDrawn(true)
      setPromptTouched(false)
      setPromptText(promptFor(mode, made.storyboard))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('generateFailed'))
    } finally {
      setBusy('')
    }
  }

  async function dispatch() {
    if (!picture) return
    setError('')
    setBusy(mode === 'ordering' ? t('cuttingPanels') : t('sending'))
    try {
      if (mode === 'ordering') {
        await dispatchPictureOrdering({
          sessionId,
          presenterToken,
          file: picture.file,
          promptText: promptText.trim(),
          title: picture.storyboard.title,
        }, t)
        setSent(true)
        return
      }
      await onDispatch(picture.file, {
        type: mode === 'spoken' ? 'oral_response' : 'short_answer',
        options: [],
        allowMultiple: false,
        promptText: promptText.trim(),
        prepareSeconds: mode === 'spoken' ? prepareSeconds : null,
        answerSeconds,
      })
      setSent(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('sendFailed'))
    } finally {
      setBusy('')
    }
  }

  const storyboard = picture?.storyboard

  return (
    <div
      className="modal-backdrop picture-studio-backdrop"
      role="presentation"
      style={suspended ? { display: 'none' } : undefined}
    >
      <div className="picture-studio">
        <header className="ps-head">
          <span className="ps-mark"><ImageIcon size={19} /></span>
          <h2>{t('pictureTalk')}</h2>
          <span className="ps-spacer" />
          {sent && <span className="ps-sent">{t('sent')}</span>}
          <button className="ps-close" type="button" aria-label={t('close')} onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="ps-body">
          <div className="ps-direction">
            <input
              maxLength={200}
              placeholder={t('pictureTopicPlaceholder')}
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            />
            <button className="ps-draw" disabled={Boolean(busy)} type="button" onClick={() => void draw()}>
              {picture && drawn ? <ArrowsClockwise size={17} /> : <Sparkle size={17} />}
              {busy || (picture && drawn ? t('anotherPicture') : t('generatePicture'))}
            </button>
            {/* Two ways to get a picture, side by side: let the AI draw one, or
                grab what is already on the screen. */}
            {onCaptureScreen && (
              <button className="ps-capture" disabled={Boolean(busy)} type="button" onClick={onCaptureScreen}>
                <Crop size={17} />{t('captureFromScreen')}
              </button>
            )}
          </div>
          <p className="ps-note">{onCaptureScreen ? t('pictureHintBoth') : t('pictureHint')}</p>
          {caution && <p className="ps-note is-caution">{caution}</p>}

          {storyboard && picture && (
            <div className={drawn ? 'ps-result' : 'ps-result is-captured'}>
              <img alt={t('picturePreviewAlt')} className="ps-preview" src={picture.previewUrl} />
              <div className="ps-plan">
                <h3>{storyboard.title}</h3>
                {storyboard.targetWords.length > 0 && (
                  <p className="ps-words">
                    {storyboard.targetWords.map((word) => <span key={word}>{word}</span>)}
                  </p>
                )}
                {storyboard.pattern && <p className="ps-pattern">{storyboard.pattern}</p>}
                {storyboard.panels.length > 0 && (
                  <ol className="ps-panels">
                    {storyboard.panels.map((panel, index) => <li key={index}>{panel}</li>)}
                  </ol>
                )}
                <p className="ps-plan-note">{t('planPrivate')}</p>
              </div>
            </div>
          )}

          {picture && (
            <>
              <div className="ps-modes" role="tablist">
                <button
                  aria-selected={mode === 'spoken'}
                  className={mode === 'spoken' ? 'is-on' : ''}
                  role="tab"
                  type="button"
                  onClick={() => setMode('spoken')}
                >
                  <Microphone size={16} />{t('modeSpoken')}
                </button>
                <button
                  aria-selected={mode === 'written'}
                  className={mode === 'written' ? 'is-on' : ''}
                  role="tab"
                  type="button"
                  onClick={() => setMode('written')}
                >
                  <PencilSimpleLine size={16} />{t('modeWritten')}
                </button>
                {drawn && (
                  <button
                    aria-selected={mode === 'ordering'}
                    className={mode === 'ordering' ? 'is-on' : ''}
                    role="tab"
                    type="button"
                    onClick={() => setMode('ordering')}
                  >
                    <CardsThree size={16} />{t('modeOrdering')}
                  </button>
                )}
              </div>

              {mode === 'ordering' && (
                <p className="ps-note">{t('pictureOrderingHint')}</p>
              )}

              <label className="ps-prompt">
                {t('questionLabel')}
                <textarea
                  maxLength={300}
                  rows={2}
                  value={promptText}
                  onChange={(event) => { setPromptTouched(true); setPromptText(event.target.value) }}
                />
              </label>

              {/* An ordering quiz is answered through the attempt flow, which
                  has no clock of its own to set here. */}
              <div className="ps-timing" hidden={mode === 'ordering'}>
                {mode === 'spoken' && (
                  <TimingRow
                    label={t('prepareTime')}
                    offLabel={t('noPrepare')}
                    presets={PREPARE_PRESETS}
                    value={prepareSeconds}
                    onChange={setPrepareSeconds}
                  />
                )}
                <TimingRow
                  label={t('answerTime')}
                  offLabel={t('noTimeLimit')}
                  presets={ANSWER_PRESETS}
                  value={answerSeconds}
                  onChange={setAnswerSeconds}
                />
              </div>
            </>
          )}

          {error && <p className="ps-error">{error}</p>}
        </div>

        <footer className="ps-foot">
          <button className="ps-secondary" type="button" onClick={onClose}>{t('close')}</button>
          <button className="ps-primary" disabled={!picture || Boolean(busy)} type="button" onClick={() => void dispatch()}>
            <PaperPlaneTilt size={17} />{t('send')}
          </button>
        </footer>
      </div>
    </div>
  )
}
