import { PaperPlaneTilt, Plus, Sparkle, Trash, X } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import type { QuestionType, QuizRequestedType } from '../types'
import { CustomQuizFields } from './CustomQuizFields'
import { quizSettingsFrom } from '../lib/customQuiz'
import { TimingRow } from './TimingRow'
import type { CustomQuizSettings } from '../lib/customQuiz'

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

const questionTypes: Array<{ type: QuestionType; label: string }> = [
  { type: 'send_screen', label: '派送畫面' },
  { type: 'custom_quiz', label: '自訂測驗' },
  { type: 'poll', label: '投票題' },
  { type: 'multiple_choice', label: '選擇題' },
  { type: 'file_upload', label: '上傳作答' },
  { type: 'short_answer', label: '問答題' },
  { type: 'oral_response', label: '口語表達' },
  { type: 'pronunciation', label: '朗讀發音' },
]

export function QuestionEditor({ error, open, previewUrl, onCancel, onCreate }: Props) {
  const [type, setType] = useState<QuestionType>('multiple_choice')
  const [options, setOptions] = useState(['A', 'B', 'C', 'D'])
  const [allowMultiple, setAllowMultiple] = useState(false)
  const [promptText, setPromptText] = useState('')
  const [quizCount, setQuizCount] = useState('auto')
  const [quizType, setQuizType] = useState<QuizRequestedType>('random')
  const [quizDirection, setQuizDirection] = useState('')
  const [prepareSeconds, setPrepareSeconds] = useState<number | null>(null)
  const [answerSeconds, setAnswerSeconds] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setType('multiple_choice')
    setOptions(['A', 'B', 'C', 'D'])
    setAllowMultiple(false)
    setPromptText('')
    setQuizCount('auto')
    setQuizType('random')
    setQuizDirection('')
    setPrepareSeconds(null)
    setAnswerSeconds(null)
  }, [open])

  const editableOptions = type === 'multiple_choice' || type === 'poll'
  const finalOptions = useMemo(() => {
    if (['short_answer', 'send_screen', 'pronunciation', 'oral_response', 'custom_quiz', 'file_upload'].includes(type)) return []
    return options.map((option) => option.trim()).filter(Boolean)
  }, [options, type])

  const timed = TIMED_TYPES.includes(type)

  if (!open) return null

  return (
    <div className="modal-backdrop">
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
              quizSettings: quizSettingsFrom(quizCount, quizType, direction),
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
        <h2>截圖派題</h2>
        {previewUrl && <img alt="截圖預覽" className="capture-preview" src={previewUrl} />}
        {error && <p className="error">{error}</p>}
        <div className="type-grid">
          {questionTypes.map((item) => (
            <button
              className={`${type === item.type ? 'selected-type' : 'ghost-button'}${item.type === 'send_screen' ? ' send-screen-type' : ''}`}
              key={item.type}
              type="button"
              onClick={() => setType(item.type)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {editableOptions && (
          <div className="option-editor">
            <label className="multi-select-setting">
              <input
                checked={allowMultiple}
                type="checkbox"
                onChange={(event) => setAllowMultiple(event.target.checked)}
              />
              <span>允許多選</span>
            </label>
            <div className="panel-heading">
              <h2>選項</h2>
              <button className="ghost-button icon-button" type="button" onClick={() => setOptions((current) => [...current, String.fromCharCode(65 + current.length)])}>
                <Plus size={16} />
              </button>
            </div>
            {options.map((option, index) => (
              <div className="option-edit-row" key={index}>
                <input
                  aria-label={`選項 ${index + 1}`}
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
            學生端會看到這張截圖和上傳按鈕，手機、平板可以直接拍照上傳。停止作答後可逐份批改。
          </p>
        )}
        {type === 'custom_quiz' && (
          <CustomQuizFields
            count={quizCount}
            direction={quizDirection}
            quizType={quizType}
            onCountChange={setQuizCount}
            onDirectionChange={setQuizDirection}
            onTypeChange={setQuizType}
          />
        )}
        {type !== 'send_screen' && type !== 'custom_quiz' && (
          <label className="question-prompt-field">
            {type === 'pronunciation' ? '指定朗讀內容（選填）' : type === 'file_upload' ? '作答說明（選填）' : '題目（選填）'}
            <input
              value={promptText}
              placeholder={type === 'pronunciation'
                ? '未輸入則以 AI 判讀截圖中的朗讀內容'
                : type === 'file_upload'
                  ? '例如：請把計算過程寫在紙上拍照上傳'
                  : '未輸入則以AI判讀題目'}
              onChange={(event) => setPromptText(event.target.value)}
            />
          </label>
        )}
        {timed && (
          <div className="timing-editor">
            {SPOKEN_TYPES.includes(type) && (
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
        )}
        <div className="modal-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            <X size={17} />取消
          </button>
          <button disabled={type === 'custom_quiz' && !quizDirection.trim()} type="submit">
            {type === 'custom_quiz' ? <Sparkle size={17} /> : <PaperPlaneTilt size={17} />}
            {type === 'custom_quiz' ? 'AI 出題並派送' : '派送'}
          </button>
        </div>
      </form>
    </div>
  )
}
