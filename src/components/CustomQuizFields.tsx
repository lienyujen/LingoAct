import { usePresenterText } from '../lib/presenterI18n'
import type { QuizRequestedType } from '../types'

type Props = {
  count: string
  direction: string
  quizType: QuizRequestedType
  // 寫作教練 only: whether students may take a draft to the coach before sending.
  coaching: boolean
  onCountChange: (value: string) => void
  onDirectionChange: (value: string) => void
  onTypeChange: (value: QuizRequestedType) => void
  onCoachingChange: (value: boolean) => void
}

// Shared by the screenshot editor and the shared-file dialog so the two offer
// exactly the same choices; a quiz built from a file is the same quiz.
export function CustomQuizFields({
  count,
  direction,
  quizType,
  coaching,
  onCountChange,
  onDirectionChange,
  onTypeChange,
  onCoachingChange,
}: Props) {
  const t = usePresenterText()
  const writing = quizType === 'writing'
  const flashcard = quizType === 'flashcard'

  return (
    <div className="custom-quiz-editor">
      <div className="custom-quiz-settings-row">
        <label>
          {writing ? t('fieldCount') : flashcard ? t('cardCount') : t('itemCount')}
          <select value={count} onChange={(event) => onCountChange(event.target.value)}>
            <option value="auto">{t('autoDecide')}</option>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value} {writing ? t('unitField') : flashcard ? t('unitCard') : t('unitItem')}</option>
            ))}
          </select>
        </label>
        <label>
          {writing ? t('formatLabel') : t('itemTypeLabel')}
          <select value={quizType} onChange={(event) => onTypeChange(event.target.value as QuizRequestedType)}>
            <option value="random">{t('typeRandom')}</option>
            <option value="multiple_choice">{t('typeMultipleChoice')}</option>
            <option value="fill_blank">{t('typeFillBlank')}</option>
            <option value="short_answer">{t('typeShortAnswerQuiz')}</option>
            <option value="ordering">{t('typeOrdering')}</option>
            <option value="matching">{t('typeMatching')}</option>
            <option value="flashcard">{t('typeFlashcard')}</option>
            <option value="writing">{t('typeWriting')}</option>
          </select>
        </label>
      </div>
      <label className="question-prompt-field">
        {writing ? t('writingDirection') : flashcard ? t('cardDirection') : t('quizDirection')}
        <textarea
          maxLength={2000}
          required
          rows={4}
          value={direction}
          placeholder={writing
            ? t('writingDirectionPlaceholder')
            : flashcard
              ? t('cardDirectionPlaceholder')
              : t('quizDirectionPlaceholder')}
          onChange={(event) => onDirectionChange(event.target.value)}
        />
      </label>
      {writing && (
        <label className="coaching-toggle">
          <input
            checked={coaching}
            type="checkbox"
            onChange={(event) => onCoachingChange(event.target.checked)}
          />
          <span>
            <strong>{t('coachingToggle')}</strong>
            {t('coachingToggleHint')}
          </span>
        </label>
      )}
      <p className="muted custom-quiz-hint">{writing
        ? coaching
          ? t('writingCoachedHint')
          : t('writingPlainHint')
        : flashcard
          ? t('flashcardHint')
          : t('quizHint')}</p>
    </div>
  )
}
