import { Image, NotePencil, PaperPlaneTilt, Plus, Sparkle, Trash, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { BoardPostKind, QuestionType, QuizRequestedType } from '../types'
import { CustomQuizFields } from './CustomQuizFields'
import { quizSettingsFrom } from '../lib/customQuiz'
import { usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'
import { TimingRow } from './TimingRow'
import type { CustomQuizSettings } from '../lib/customQuiz'
import { useWorkspaceText } from '../lib/workspaceText'
import { InteractionEditor } from './InteractionEditor'
import type { InteractionDraft, InteractionGenerated } from '../lib/screenshotInteraction'

export type { CustomQuizSettings }

// One object rather than a growing list of positional arguments: with timing
// added, the non-quiz call would have had to pass undefined for quizSettings
// just to reach the fields after it.
export type QuestionDraft = {
  interaction?: InteractionDraft
  type: QuestionType
  options: string[]
  allowMultiple: boolean
  promptText: string
  quizSettings?: CustomQuizSettings
  // Null on both means untimed, which stays the default.
  prepareSeconds: number | null
  answerSeconds: number | null
  // 討論板. Ticking any format turns a 派送畫面 into a board, which is why
  // there is no separate type to choose on the way in — the board is that same
  // dispatch with replies switched on.
  boardFormats?: BoardPostKind[]
  boardMaxPosts?: number | null
  boardSelfPaced?: boolean
  // 圖上點選 only: how many taps one student gets.
  maxPins?: number | null
}

type Props = {
  onGenerateInteraction?: (request: Record<string, unknown>) => Promise<InteractionGenerated>
  // 單字卡 has its own 課堂活動 button, which captures the screen and then opens
  // this editor already on the right setting.
  preset?: QuizRequestedType | null
  initialDraft?: Partial<QuestionDraft> | null
  // 看圖說話 leaves the editor for the picture studio, taking the crop with it:
  // choosing what to do with a picture is a page of its own, not a row of
  // fields under a type button.
  onPictureTalk?: () => void
  error?: string
  open: boolean
  previewUrl: string | null
  onCancel: () => void
  onCreate: (draft: QuestionDraft) => void
}

const TIMED_TYPES: QuestionType[] = ['poll', 'multiple_choice', 'true_false', 'short_answer', 'pronunciation', 'oral_response']
// Only a spoken answer has anything to prepare. A vocabulary race is all clock.
const SPOKEN_TYPES: QuestionType[] = ['pronunciation', 'oral_response']
const ANSWER_PRESETS: Array<number | null> = [null, 30, 60, 90, 180]
const PREPARE_PRESETS: Array<number | null> = [null, 10, 20, 30]

const boardFormatChoices: Array<{ kind: BoardPostKind; label: PresenterMessageKey; hint: PresenterMessageKey }> = [
  { kind: 'text', label: 'boardFormatText', hint: 'boardFormatTextHint' },
  { kind: 'link', label: 'boardFormatLink', hint: 'boardFormatLinkHint' },
  { kind: 'image', label: 'boardFormatImage', hint: 'boardFormatImageHint' },
  { kind: 'file', label: 'boardFormatFile', hint: 'boardFormatFileHint' },
  { kind: 'audio', label: 'boardFormatAudio', hint: 'boardFormatAudioHint' },
  { kind: 'drawing', label: 'boardFormatDrawing', hint: 'boardFormatDrawingHint' },
]

const questionTypes: Array<{ type: QuestionType; label: PresenterMessageKey }> = [
  { type: 'send_screen', label: 'typeSendScreen' },
  { type: 'custom_quiz', label: 'typeCustomQuiz' },
  { type: 'poll', label: 'typePoll' },
  { type: 'multiple_choice', label: 'typeMultipleChoice' },
  { type: 'file_upload', label: 'typeFileUpload' },
  { type: 'drawing', label: 'typeDrawing' },
  { type: 'hotspot', label: 'typeHotspot' },
  { type: 'short_answer', label: 'typeShortAnswer' },
  { type: 'oral_response', label: 'typeOralResponse' },
  { type: 'pronunciation', label: 'typePronunciation' },
]

export function QuestionEditor({ preset, initialDraft, error, open, previewUrl, onCancel, onCreate, onPictureTalk, onGenerateInteraction }: Props) {
  const t = usePresenterText()
  const w = useWorkspaceText()
  const [type, setType] = useState<QuestionType>('multiple_choice')
  const [options, setOptions] = useState(['A', 'B', 'C', 'D'])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [maxPins, setMaxPins] = useState(1)
  const [boardFormats, setBoardFormats] = useState<BoardPostKind[]>([])
  const [boardMaxPosts, setBoardMaxPosts] = useState<number | null>(1)
  // Whether the class thinks alone before seeing each other. Off by default,
  // because a wall nobody can see is not a wall; the presenter can turn it on
  // and off from the board itself once the class is going.
  const [boardSelfPaced, setBoardSelfPaced] = useState(false)
  // Ticking any format is what makes this a board rather than a plain dispatch.
  const isBoard = type === 'send_screen' && boardFormats.length > 0
  const [quizCount, setQuizCount] = useState('auto')
  const [quizType, setQuizType] = useState<QuizRequestedType>('random')
  const [quizDirection, setQuizDirection] = useState('')
  const [quizCoaching, setQuizCoaching] = useState(false)
  const [prepareSeconds, setPrepareSeconds] = useState<number | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(null)
  const [interaction, setInteraction] = useState<InteractionDraft>({ kind: 'ordering', items: [], tiles: [], sentenceMode: false, hasAnswer: true, shareScreenshot: false })
  const [interactionBusy, setInteractionBusy] = useState(false)
  const isInteraction = type === 'custom_quiz' && (quizType === 'ordering' || quizType === 'matching') && Boolean(onGenerateInteraction)
  // 派送畫面 has nothing to send and 自訂測驗 has nothing to read when there is
  // no backdrop — both are made out of the image rather than merely shown over
  // it, so they are left out rather than offered and then refused.
  const offeredTypes = previewUrl ? questionTypes : questionTypes.filter((item) => !['send_screen', 'custom_quiz'].includes(item.type))

  useEffect(() => {
    if (!open) return
    const quiz = initialDraft?.quizSettings
    setType(initialDraft?.type || (preset ? 'custom_quiz' : 'multiple_choice'))
    setOptions(initialDraft?.options?.length ? initialDraft.options : ['A', 'B', 'C', 'D'])
    setAllowMultiple(initialDraft?.allowMultiple === true)
    setPromptText(initialDraft?.promptText || '')
    setQuizCount(quiz?.requestedCount == null ? 'auto' : String(quiz.requestedCount))
    setQuizType(initialDraft?.interaction?.kind || quiz?.requestedType || preset || 'random')
    setQuizDirection(quiz?.direction || initialDraft?.promptText || '')
    setQuizCoaching(quiz?.coaching === true)
    setMaxPins(initialDraft?.maxPins ?? 1)
    setBoardFormats(initialDraft?.boardFormats || [])
    setBoardMaxPosts(initialDraft?.boardMaxPosts ?? 1)
    setBoardSelfPaced(initialDraft?.boardSelfPaced === true)
    setPrepareSeconds(initialDraft?.prepareSeconds ?? null)
    setAnswerSeconds(initialDraft?.answerSeconds ?? null)
    setInteraction(initialDraft?.interaction || { kind: preset === 'matching' ? 'matching' : 'ordering', items: [], tiles: [], sentenceMode: false, hasAnswer: true, shareScreenshot: false })
  }, [initialDraft, open, preset])

  const editableOptions = type === 'multiple_choice' || type === 'poll'
  const finalOptions = useMemo(() => {
    if (['short_answer', 'send_screen', 'pronunciation', 'oral_response', 'custom_quiz', 'file_upload', 'drawing', 'hotspot'].includes(type)) return []
    return options.map((option) => option.trim()).filter(Boolean)
  }, [options, type])

  const timed = TIMED_TYPES.includes(type)

  if (!open) return null

  return (
    <div className="modal-backdrop question-editor-backdrop">
      <form
        className="modal question-modal"
        onSubmit={(event) => {
          event.preventDefault()
          if (interactionBusy) return
          if (type === 'custom_quiz') {
            const direction = quizDirection.trim()
            if (isInteraction) {
              onCreate({ type, options: [], allowMultiple: false, promptText: direction, prepareSeconds: null, answerSeconds: null,
                interaction: { ...interaction, kind: quizType as 'ordering' | 'matching' } })
              return
            }
            if (!direction) return
            onCreate({
              type,
              options: [],
              allowMultiple: false,
              promptText: direction,
              quizSettings: quizSettingsFrom(quizCount, quizType, direction, quizCoaching),
              prepareSeconds: null,
              answerSeconds: null,
            })
            return
          }
          onCreate({
            // Ticking a format is what makes it a board; nothing ticked stays the
            // plain dispatch it has always been.
            type: isBoard ? 'board' : type,
            options: finalOptions,
            allowMultiple: editableOptions && allowMultiple,
            // A board is a topic, so its prompt is the topic rather than
            // nothing — that is the one thing a plain dispatch does not have.
            promptText: type === 'send_screen' && !isBoard ? '' : promptText.trim(),
            boardFormats: isBoard ? boardFormats : [],
            boardMaxPosts: isBoard ? boardMaxPosts : null,
            boardSelfPaced: isBoard && boardSelfPaced,
            // Timing a type that cannot be timed would store a limit nothing
            // reads, so the fields are dropped rather than merely hidden.
            prepareSeconds: timed && SPOKEN_TYPES.includes(type) ? prepareSeconds : null,
            answerSeconds: timed ? answerSeconds : null,
            maxPins: type === 'hotspot' ? maxPins : null,
          })
        }}
      >
        <h2>{w.source}</h2>
        {previewUrl && <img alt={t('capturePreviewAlt')} className="capture-preview" src={previewUrl} />}
        {error && <p className="error">{error}</p>}
        <div className="type-grid">
          {offeredTypes.map((item) => (
            <button
              className={`${type === item.type ? 'selected-type' : 'ghost-button'}${item.type === 'send_screen' ? ' send-screen-type' : ''}`}
              key={item.type}
              type="button"
              onClick={() => setType(item.type)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>
        <div className="type-shortcuts">
          {onGenerateInteraction && (['ordering', 'matching'] as const).map(kind => <button key={kind} className={type === 'custom_quiz' && quizType === kind ? 'selected-type' : 'ghost-button'} type="button" onClick={() => { setType('custom_quiz'); setQuizType(kind); setInteraction(v => ({ ...v, kind })) }}>{t(kind === 'ordering' ? 'typeOrdering' : 'typeMatching')}</button>)}
          {onPictureTalk && (
            <button className="ghost-button" type="button" onClick={onPictureTalk}>
              <Image size={16} />{t('pictureTalk')}
            </button>
          )}
          <button
            className={type === 'custom_quiz' && quizType === 'writing' ? 'selected-type' : 'ghost-button'}
            type="button"
            onClick={() => { setType('custom_quiz'); setQuizType('writing') }}
          >
            <NotePencil size={16} />{t('writingCoach')}
          </button>
        </div>
        {editableOptions && (
          <div className="option-editor">
            <label className="multi-select-setting">
              <input
                checked={allowMultiple}
                type="checkbox"
                onChange={(event) => setAllowMultiple(event.target.checked)}
              />
              <span>{t('allowMultiple')}</span>
            </label>
            <div className="panel-heading">
              <h2>{t('options')}</h2>
              <button className="ghost-button icon-button" type="button" onClick={() => setOptions((current) => [...current, String.fromCharCode(65 + current.length)])}>
                <Plus size={16} />
              </button>
            </div>
            {options.map((option, index) => (
              <div className="option-edit-row" key={index}>
                <input
                  aria-label={t('optionN', { n: index + 1 })}
                  value={option}
                  onChange={(event) => {
                    const next = [...options]
                    next[index] = event.target.value
                    setOptions(next)
                  }}
                />
                <button
                  className="ghost-button icon-button"
                  disabled={options.length <= 2}
                  type="button"
                  onClick={() => setOptions((current) => current.filter((_, optionIndex) => optionIndex !== index))}
                >
                  <Trash size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {type === 'file_upload' && (
          <p className="muted question-type-hint">
            {t('uploadTypeHint')}
          </p>
        )}
        {type === 'drawing' && (
          <p className="muted question-type-hint">
            {t('drawingTypeHint')}
          </p>
        )}
        {type === 'hotspot' && (
          <>
            <p className="muted question-type-hint">{t('hotspotTypeHint')}</p>
            <div className="question-timing">
              <TimingRow
                formatValue={(value) => t('hotspotPinsCount', { n: value })}
                label={t('hotspotPinsLabel')}
                offLabel={t('hotspotPinsCount', { n: 1 })}
                presets={[1, 2, 3, 5]}
                value={maxPins}
                onChange={(value) => setMaxPins(value ?? 1)}
              />
            </div>
          </>
        )}
        {isInteraction && onGenerateInteraction && <InteractionEditor key={`${open}-${quizType}`} value={{ ...interaction, kind: quizType as 'ordering' | 'matching' }} direction={quizDirection} previewUrl={previewUrl} onChange={setInteraction} onDirectionChange={setQuizDirection} onGenerate={onGenerateInteraction} onBusy={setInteractionBusy} />}
        {type === 'custom_quiz' && !isInteraction && (
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
        )}
        {type === 'send_screen' && (
          <div className="board-setup">
            {/* Ticking any of these turns the dispatch into a board. Nothing
                ticked is the plain 派送畫面 it has always been, which is why
                there is no separate type to choose on the way in. */}
            <fieldset className="board-formats">
              <legend>{t('boardFormatsLegend')}</legend>
              <div className="board-format-grid">
                {boardFormatChoices.map((choice) => {
                  const on = boardFormats.includes(choice.kind)
                  return (
                    <button
                      aria-pressed={on}
                      className={`board-format-chip${on ? ' is-selected' : ''}`}
                      key={choice.kind}
                      type="button"
                      onClick={() => setBoardFormats((current) => (
                        current.includes(choice.kind)
                          ? current.filter((kind) => kind !== choice.kind)
                          : [...current, choice.kind]
                      ))}
                    >
                      <strong>{t(choice.label)}</strong>
                      <span>{t(choice.hint)}</span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
            {isBoard && (
              <div className="question-timing">
                <TimingRow
                  formatValue={(value) => t('boardPostCount', { n: value })}
                  label={t('boardPerStudent')}
                  offLabel={t('boardUnlimitedShort')}
                  presets={[1, 2, 3, 5, null]}
                  value={boardMaxPosts}
                  onChange={setBoardMaxPosts}
                />
              </div>
            )}
            {isBoard && (
              <label className="multi-select-setting">
                <input
                  checked={boardSelfPaced}
                  type="checkbox"
                  onChange={(event) => setBoardSelfPaced(event.target.checked)}
                />
                {t('boardSelfPacedLabel')}
              </label>
            )}
            {isBoard && (
              <p className="muted question-type-hint">
                {boardSelfPaced ? t('boardSelfPacedHint') : t('boardSharedHint')}
                {t('boardStaysOpen')}
              </p>
            )}
          </div>
        )}
        {(type !== 'send_screen' || isBoard) && type !== 'custom_quiz' && (
          <label className="question-prompt-field">
            {type === 'pronunciation' ? t('readAloudLabel') : type === 'file_upload' ? t('uploadPromptLabel') : type === 'drawing' ? t('drawingPromptLabel') : t('promptLabel')}
            <input
              value={promptText}
              placeholder={type === 'pronunciation'
                ? t('readAloudPlaceholder')
                : type === 'file_upload'
                  ? t('uploadPromptPlaceholder')
                  : type === 'drawing'
                    ? t('drawingPromptPlaceholder')
                    : type === 'hotspot'
                      ? t('hotspotPromptPlaceholder')
                    : t('promptPlaceholder')}
              onChange={(event) => setPromptText(event.target.value)}
            />
          </label>
        )}
        {timed && (
          <details className="teacher-disclosure timing-editor">
            <summary>{w.timing}</summary>
            {SPOKEN_TYPES.includes(type) && (
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
          </details>
        )}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            <X size={17} />{t('cancel')}
          </button>
          <button disabled={interactionBusy || (isInteraction ? quizType === 'ordering' && Math.max(interaction.items.length, interaction.tiles.length) < 2 : type === 'custom_quiz' && !quizDirection.trim())} type="submit">
            {type === 'custom_quiz' ? <Sparkle size={17} /> : <PaperPlaneTilt size={17} />}
            {type === 'custom_quiz' ? t('generateAndSend') : t('send')}
          </button>
        </div>
      </form>
    </div>
  )
}
