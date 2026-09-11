import { Image, NotePencil, PaperPlaneTilt, Plus, Sparkle, Trash, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { QuestionType, QuizRequestedType } from '../types'
import { CustomQuizFields } from './CustomQuizFields'
import { quizSettingsFrom } from '../lib/customQuiz'
import { usePresenterText } from '../lib/presenterI18n'
import type { PresenterMessageKey } from '../lib/presenterI18n'
import { TimingRow } from './TimingRow'
import type { CustomQuizSettings } from '../lib/customQuiz'
import { useWorkspaceText } from '../lib/workspaceText'

export type { CustomQuizSettings }

// One object rather than a growing list of positional arguments: with timing
// added, the non-quiz call would have had to pass undefined for quizSettings
// just to reach the fields after it.
export type QuestionDraft = {
  type: QuestionType
  options: string[]
  allowMultiple: boolean
  promptText: string
  quizSettings?: CustomQuizSettings
  // Null on both means untimed, which stays the default.
  prepareSeconds: number | null
  answerSeconds: number | null
}

type Props = {
  // 單字卡 has its own 課堂活動 button, which captures the screen and then opens
  // this editor already on the right setting.
  preset?: QuizRequestedType | null
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

const questionTypes: Array<{ type: QuestionType; label: PresenterMessageKey }> = [
  { type: 'send_screen', label: 'typeSendScreen' },
  { type: 'custom_quiz', label: 'typeCustomQuiz' },
  { type: 'poll', label: 'typePoll' },
  { type: 'multiple_choice', label: 'typeMultipleChoice' },
  { type: 'file_upload', label: 'typeFileUpload' },
  { type: 'short_answer', label: 'typeShortAnswer' },
  { type: 'oral_response', label: 'typeOralResponse' },
  { type: 'pronunciation', label: 'typePronunciation' },
]

export function QuestionEditor({ preset, error, open, previewUrl, onCancel, onCreate, onPictureTalk }: Props) {
  const t = usePresenterText()
  const w = useWorkspaceText()
  const [type, setType] = useState<QuestionType>('multiple_choice')
  const [options, setOptions] = useState(['A', 'B', 'C', 'D'])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [quizCount, setQuizCount] = useState('auto')
  const [quizType, setQuizType] = useState<QuizRequestedType>('random')
  const [quizDirection, setQuizDirection] = useState('')
  const [quizCoaching, setQuizCoaching] = useState(false)
  const [prepareSeconds, setPrepareSeconds] = useState<number | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setType(preset ? 'custom_quiz' : 'multiple_choice')
    setOptions(['A', 'B', 'C', 'D'])
    setAllowMultiple(false)
    setPromptText('')
    setQuizCount('auto')
    setQuizType(preset || 'random')
    setQuizDirection('')
    setQuizCoaching(false)
    setPrepareSeconds(null)
    setAnswerSeconds(null)
  }, [open, preset])

  const editableOptions = type === 'multiple_choice' || type === 'poll'
  const finalOptions = useMemo(() => {
    if (['short_answer', 'send_screen', 'pronunciation', 'oral_response', 'custom_quiz', 'file_upload'].includes(type)) return []
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
          if (type === 'custom_quiz') {
            const direction = quizDirection.trim()
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
            type,
            options: finalOptions,
            allowMultiple: editableOptions && allowMultiple,
            promptText: type === 'send_screen' ? '' : promptText.trim(),
            // Timing a type that cannot be timed would store a limit nothing
            // reads, so the fields are dropped rather than merely hidden.
            prepareSeconds: timed && SPOKEN_TYPES.includes(type) ? prepareSeconds : null,
            answerSeconds: timed ? answerSeconds : null,
          })
        }}
      >
        <h2>{w.source}</h2>
        {previewUrl && <img alt={t('capturePreviewAlt')} className="capture-preview" src={previewUrl} />}
        {error && <p className="error">{error}</p>}
        <div className="type-grid">
          {questionTypes.map((item) => (
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
        {type === 'custom_quiz' && (
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
        {type !== 'send_screen' && type !== 'custom_quiz' && (
          <label className="question-prompt-field">
            {type === 'pronunciation' ? t('readAloudLabel') : type === 'file_upload' ? t('uploadPromptLabel') : t('promptLabel')}
            <input
              value={promptText}
              placeholder={type === 'pronunciation'
                ? t('readAloudPlaceholder')
                : type === 'file_upload'
                  ? t('uploadPromptPlaceholder')
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
          <button disabled={type === 'custom_quiz' && !quizDirection.trim()} type="submit">
            {type === 'custom_quiz' ? <Sparkle size={17} /> : <PaperPlaneTilt size={17} />}
            {type === 'custom_quiz' ? t('generateAndSend') : t('send')}
          </button>
        </div>
      </form>
    </div>
  )
}
