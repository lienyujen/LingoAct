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
  const writing = quizType === 'writing'
  const flashcard = quizType === 'flashcard'

  return (
    <div className="custom-quiz-editor">
      <div className="custom-quiz-settings-row">
        <label>
          {writing ? '欄位數' : flashcard ? '卡片數' : '題數'}
          <select value={count} onChange={(event) => onCountChange(event.target.value)}>
            <option value="auto">自動判斷</option>
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>{value} {writing ? '欄' : flashcard ? '張' : '題'}</option>
            ))}
          </select>
        </label>
        <label>
          {writing ? '型式' : '題型'}
          <select value={quizType} onChange={(event) => onTypeChange(event.target.value as QuizRequestedType)}>
            <option value="random">隨機／AI自動判斷</option>
            <option value="multiple_choice">選擇題</option>
            <option value="fill_blank">填充題</option>
            <option value="short_answer">簡答題</option>
            <option value="ordering">排序題</option>
            <option value="matching">配對題</option>
            <option value="flashcard">單字卡練習（自己的速度・錯的會再出現）</option>
            <option value="writing">寫作教練（不評分）</option>
          </select>
        </label>
      </div>
      <label className="question-prompt-field">
        {writing ? '寫作方向' : flashcard ? '出卡方向' : '出題方向'}
        <textarea
          maxLength={2000}
          required
          rows={4}
          value={direction}
          placeholder={writing
            ? '請說明寫作對象、主題與希望學生用到的詞語或句型'
            : flashcard
              ? '請說明要練哪些詞語或字音，例如：這一課的生詞，看解釋選詞'
              : '請說明測驗對象、欲測能力與題目難度'}
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
            <strong>開啟 AI 鷹架提問</strong>
            學生寫到一半可以請教練看看。教練只提問、指出要改的地方，不會幫學生寫，每個欄位最多三次。
          </span>
        </label>
      )}
      <p className="muted custom-quiz-hint">{writing
        ? coaching
          ? 'AI 開欄位、陪學生問，但不批改也不代寫。你會看到每個人的定稿，還有他們改了幾次、教練問了什麼。'
          : 'AI 只負責開出要寫的欄位，學生填完送回後由你直接看，不會用 AI 批改。'
        : flashcard
          ? '學生一張一張自己練，答錯的卡片會再出現，直到整疊都答對。不打分數，你看到的是誰第一次就會、誰卡在哪張。'
          : '也可以直接在出題方向指定題數與題型；題數選「自動判斷」、題型選「隨機」即可。'}</p>
    </div>
  )
}
