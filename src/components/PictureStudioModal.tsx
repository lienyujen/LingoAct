import { useEffect, useState } from 'react'
import { ArrowsClockwise, CardsThree, Image as ImageIcon, Microphone, PaperPlaneTilt, PencilSimpleLine, Sparkle, X } from '@phosphor-icons/react'
import { TimingRow } from './TimingRow'
import { dispatchPictureOrdering, generatePicture } from '../lib/picture'
import type { GeneratedPicture, PictureStoryboard } from '../lib/picture'
import type { QuestionDraft } from './QuestionEditor'

type Props = {
  open: boolean
  sessionId: string
  presenterToken: string
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

export function PictureStudioModal({ open, sessionId, presenterToken, onClose, onDispatch }: Props) {
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
  }, [open])

  useEffect(() => {
    if (!picture || promptTouched) return
    setPromptText(promptFor(mode, picture.storyboard))
  }, [mode, picture, promptTouched])

  if (!open) return null

  async function draw() {
    setError('')
    setSent(false)
    setBusy('AI 正在畫四格圖…')
    try {
      const drawn = await generatePicture({ sessionId, presenterToken, direction: direction.trim() })
      setPicture(drawn)
      setPromptTouched(false)
      setPromptText(promptFor(mode, drawn.storyboard))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成失敗，請再試一次。')
    } finally {
      setBusy('')
    }
  }

  async function dispatch() {
    if (!picture) return
    setError('')
    setBusy(mode === 'ordering' ? '正在切開四格並派送…' : '派送中…')
    try {
      if (mode === 'ordering') {
        await dispatchPictureOrdering({
          sessionId,
          presenterToken,
          file: picture.file,
          promptText: promptText.trim(),
          title: picture.storyboard.title,
        })
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
      setError(caught instanceof Error ? caught.message : '派送失敗。')
    } finally {
      setBusy('')
    }
  }

  const storyboard = picture?.storyboard

  return (
    <div className="modal-backdrop picture-studio-backdrop" role="presentation">
      <div className="picture-studio">
        <header className="ps-head">
          <span className="ps-mark"><ImageIcon size={19} /></span>
          <h2>看圖說話</h2>
          <span className="ps-spacer" />
          {sent && <span className="ps-sent">已派送</span>}
          <button className="ps-close" type="button" aria-label="關閉" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        <div className="ps-body">
          <div className="ps-direction">
            <input
              maxLength={200}
              placeholder="主題（選填），例如：在夜市買東西、幫忙做家事"
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            />
            <button className="ps-draw" disabled={Boolean(busy)} type="button" onClick={() => void draw()}>
              {picture ? <ArrowsClockwise size={17} /> : <Sparkle size={17} />}
              {busy || (picture ? '換一張' : '生成四格圖')}
            </button>
          </div>
          <p className="ps-note">留空由 AI 依這堂課的語言和程度自己想一個情境。圖裡不會有任何文字，學生看圖說或寫。</p>

          {storyboard && picture && (
            <div className="ps-result">
              <img alt="四格圖預覽" className="ps-preview" src={picture.previewUrl} />
              <div className="ps-plan">
                <h3>{storyboard.title}</h3>
                {storyboard.targetWords.length > 0 && (
                  <p className="ps-words">
                    {storyboard.targetWords.map((word) => <span key={word}>{word}</span>)}
                  </p>
                )}
                {storyboard.pattern && <p className="ps-pattern">{storyboard.pattern}</p>}
                <ol className="ps-panels">
                  {storyboard.panels.map((panel, index) => <li key={index}>{panel}</li>)}
                </ol>
                <p className="ps-plan-note">以上只有你看得到，學生端只會收到圖和題目。</p>
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
                  <Microphone size={16} />口說
                </button>
                <button
                  aria-selected={mode === 'written'}
                  className={mode === 'written' ? 'is-on' : ''}
                  role="tab"
                  type="button"
                  onClick={() => setMode('written')}
                >
                  <PencilSimpleLine size={16} />打字
                </button>
                <button
                  aria-selected={mode === 'ordering'}
                  className={mode === 'ordering' ? 'is-on' : ''}
                  role="tab"
                  type="button"
                  onClick={() => setMode('ordering')}
                >
                  <CardsThree size={16} />排順序
                </button>
              </div>

              {mode === 'ordering' && (
                <p className="ps-note">四格會被切開、打亂後送到學生端，學生拖成正確順序。完整的圖不會派出去。</p>
              )}

              <label className="ps-prompt">
                題目
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
                    label="準備時間"
                    offLabel="不準備"
                    presets={PREPARE_PRESETS}
                    value={prepareSeconds}
                    onChange={setPrepareSeconds}
                  />
                )}
                <TimingRow
                  label="作答時間"
                  offLabel="不限時"
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
          <button className="ps-secondary" type="button" onClick={onClose}>關閉</button>
          <button className="ps-primary" disabled={!picture || Boolean(busy)} type="button" onClick={() => void dispatch()}>
            <PaperPlaneTilt size={17} />派送
          </button>
        </footer>
      </div>
    </div>
  )
}
