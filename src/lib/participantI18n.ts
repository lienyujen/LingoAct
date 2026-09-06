import { generatedLocales } from './participantLocales.generated'

// A language class runs on two axes: the language being taught, and the language
// the explaining happens in. This file is the second one — the guidance language.
//
// The teacher sets the class default and a student whose first language differs
// can override it. Both halves are needed: one Chinese class can hold Vietnamese
// and Japanese learners at once, while a Taiwanese class learning English shares
// a single guidance language nobody should have to pick individually.
export const GUIDANCE_LOCALES = [
  { code: 'zh-TW', label: '繁體中文', short: '中' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', short: '日' },
  { code: 'ko', label: '한국어', short: '한' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
] as const

export type ParticipantLocale = (typeof GUIDANCE_LOCALES)[number]['code']

const messages = {
  'zh-TW': {
    language: '語言', chinese: '繁體中文', english: 'English', courseEnded: '課程已結束', classDismissed: '下課啦！',
    thankYou: '謝謝你的參與。', aiSummary: 'AI 課程總結', todayHighlights: '今天的課程重點', lessonKeyPoints: '課堂重點整理',
    learningReview: '學習整理', strengths: '本次掌握的重點', reviewMore: '可以再複習', sharedResources: '課堂文字與連結',
    attendee: '與會者', welcome: '歡迎加入', session: 'LingoAct 場次', sendFeedback: '送出問題或回饋',
    messagePlaceholder: '送出後會即時出現在講者畫面，上限 36 個字或 24 個詞', limit: '上限 36 個字或 24 個詞。',
    used: '目前使用', send: '送出', questionEnded: '本題已結束。', submittedAnswer: '已送出答案：', interactiveQuestion: '互動題',
    answerPlaceholder: '請輸入你的回答', submitAnswer: '送出答案', presenterDispatch: '講者派送', collapse: '收合舊內容', expandAll: '展開全部',
    items: '則', copied: '已複製', copy: '複製文字', openLink: '開啟網址', dispatched: '派送',
    exitSubmitted: 'Exit Ticket 已送出', learningLevel: '學習程度：', stars: '顆星', required: '必答 1', optional: '選填 2',
    ratingPrompt: '請用 1 到 5 顆星評估你今天的學習理解程度', ratingLabel: '學習程度星等', optionalPlaceholder: '選填：可輸入你的回答、建議或回饋',
    sending: '送出中...', submitExit: '送出 Exit Ticket', recordingSent: '錄音已送出，AI 正在分析；停止作答後會顯示評測結果。',
    personalAssessment: '你的個人評測', detectedLanguage: '辨識語言：', points: '分', relevance: '內容對照', clarity: '表達清晰度',
    completeness: '完成度', doneWell: '做得好的地方', nextStep: '下一步建議', transcript: '查看辨識內容', noTranscript: '未辨識到語音內容',
    assessmentFailed: '錄音已收到，但 AI 評測未完成。請告知講師。', assessmentPending: 'AI 評測仍在處理中，請稍候。',
    recordingHint: '最長 3 分鐘。請在安靜處錄音，完成後按停止。', stopRecording: '停止錄音', uploading: '上傳並分析中...', startRecording: '開始錄音',
    recordingHintTimed: '這題限時 {seconds} 秒，按下按鈕就開始錄音。',
    recordingHintPrepare: '按下按鈕後有 {prepare} 秒準備，接著自動錄音 {seconds} 秒。',
    interpretation: '即時語音口譯', headphoneLanguage: '耳機語言', testHeadphones: '測試耳機', stopListening: '停止聆聽', startListening: '開始聆聽口譯',
    connecting: '正在連接教師端口譯...', waitingTeacher: '已連線，等待教師說話...', playing: '口譯播放中', connectionFailed: '口譯連線失敗，請重試。',
    audioNotEnabled: '音訊輸出未啟用；請點右上角喇叭後重新開始聆聽。', headphoneHint: '建議戴上耳機，選擇語言後開始聆聽。',
    testPlayed: '已播放測試音；若沒有聽見，請檢查裝置音量與耳機輸出。', imageAlt: '講者派送圖片', congratulations: '恭喜！',
    winnerIs: '得獎的是', canBuzz: '現在可以搶答', waitPresenter: '請等待主講者開始', submitting: '送出中', buzz: '搶答', preparing: '準備中',
    sessionGoneTitle: '這場次已經莎喲娜啦了！', sessionGoneMessage: '下回請早！',
    teacherFiles: '教師分享檔案', fileUpload: '上傳檔案', chooseFile: '選擇檔案上傳', takePhoto: '拍照上傳', fileUploading: '上傳中...',
    uploadFailed: '檔案上傳失敗，請再試一次。', uploadClosed: '教師已停止收件。', fileFeedback: 'AI 檔案回饋',
    welcomeBack: '歡迎回到課堂', signingBackIn: '正在以「{name}」的身分回到課堂…', joinTitle: '加入{title}', untitledSession: '場次',
    enterNameToView: '輸入姓名即可查看課程內容', enterNameToJoin: '輸入姓名後即可進入互動課堂', yourName: '你的姓名', namePlaceholder: '請輸入姓名',
    joining: '加入中...', viewClass: '查看課程', joinAction: '加入', nameRequired: '姓名必填。', joinFailed: '加入失敗。',
    sessionNotFound: '找不到這個場次。', sessionLoadFailed: '暫時無法載入場次，請重新整理後再試。',
    lessonSummary: '課程總結', learningAssessment: '學習程度評估', courseSatisfaction: '課程回饋', studentQuestion: '提出疑問',
    thankYouNamed: '{name}，謝謝你的參與。', welcomeToSession: '，歡迎加入{title}', quizLoadFailed: '無法載入測驗，請重新整理；若仍無法顯示，請重新掃描 QR Code 加入。',
    accessExpired: '學員權限已失效，請重新掃描 QR Code 加入。', customQuiz: '自訂測驗', preparingQuestions: '出題中，請稍候', tryAgain: '重新載入',
    typePoll: '投票', typeMultipleChoice: '選擇題', typeTrueFalse: '是非題', typeShortAnswer: '簡答題', typePronunciation: '朗讀發音', typeOralResponse: '口語表達',
    gradingCompleted: '評分完成', gradingInterrupted: '評分暫時失敗', gradingInBackground: '已送出，AI 正在背景評分…', calculatingScore: '已送出，正在計算分數…',
    retryGrading: '重新評分', quizHintAi: '請完成所有題目後一次送出；填充與簡答題會由 AI 評分並提供回饋。', quizHintKey: '請完成所有題目後一次送出；選擇題會直接依答案計分，不會呼叫 AI 評分。',
    quizFillPlaceholder: '請輸入答案', quizShortPlaceholder: '請輸入簡答內容', submitAnswers: '送出答案', answeredQuestions: '已作答題目', collapseShort: '收合', expandShort: '展開',
    questionNumber: '第 {n} 題', dispatchedQuestion: '派送題目', loadingYourAnswer: '正在載入你的作答…', submittedScoreLabel: '作答分數：', yourAnswerLabel: '你的答案：',
    recordingSubmitted: '已送出錄音', transcriptLabel: '逐字稿：',
    listening: '聽力', listeningPlay: '播放', listeningReplay: '再聽一次', listeningPlaying: '播放中…',
    listeningPlaysLeft: '還可以聽 {n} 次', listeningLastPlay: '這是最後一次播放', listeningNoPlaysLeft: '播放次數已用完',
    listeningUnlimited: '可以重複聆聽', listeningSlow: '慢速', listeningNormal: '正常速度', listeningLoading: '載入語音中…',
    listeningFailed: '語音載入失敗，請重新整理再試一次。', listeningHint: '戴上耳機或調高音量，按播放開始聆聽。',
    orderingHint: '拖曳左側把手，或用箭頭調整順序。', orderingDrag: '拖曳調整順序', orderingUp: '往上移', orderingDown: '往下移',
    matchingChoose: '請選擇…', matchingHint: '每個項目各選一個配對。',
    writingHint: '把每個欄位寫完再送出。老師會直接看你寫的內容，這份不打分數。',
    writingSubmitted: '已送出，老師會看你寫的內容。',
    modelAudio: '原音示範', modelAudioHint: '先聽一次原音，再錄下自己的版本，然後比較兩者。', modelReplay: '可以重複聽',
    prepareStart: '開始準備', recordingLeft: '剩下', timeUp: '時間到', answerTimeLeft: '作答剩下', answerClosed: '作答時間已結束',
    recordAgain: '重錄一次',
  },
  en: {
    language: 'Language', chinese: '繁體中文', english: 'English', courseEnded: 'Class ended', classDismissed: 'That’s a wrap!',
    thankYou: 'Thank you for participating.', aiSummary: 'AI class summary', todayHighlights: 'Today’s class highlights', lessonKeyPoints: 'Key takeaways',
    learningReview: 'Learning review', strengths: 'What the class understood', reviewMore: 'Worth reviewing', sharedResources: 'Class text and links',
    attendee: 'Participant', welcome: ', welcome to ', session: 'LingoAct session', sendFeedback: 'Send a question or feedback',
    messagePlaceholder: 'Your message appears on the presenter screen immediately (up to 36 characters or 24 words)', limit: 'Up to 36 characters or 24 words.',
    used: 'Used', send: 'Send', questionEnded: 'This question has ended.', submittedAnswer: 'Answer submitted: ', interactiveQuestion: 'Interactive question',
    answerPlaceholder: 'Enter your answer', submitAnswer: 'Submit answer', presenterDispatch: 'Presenter dispatch', collapse: 'Hide older items', expandAll: 'Show all',
    items: 'items', copied: 'Copied', copy: 'Copy text', openLink: 'Open link', dispatched: 'Sent',
    exitSubmitted: 'Exit Ticket submitted', learningLevel: 'Understanding: ', stars: 'stars', required: 'Required 1', optional: 'Optional 2',
    ratingPrompt: 'Rate your understanding of today’s class from 1 to 5 stars', ratingLabel: 'Understanding rating', optionalPlaceholder: 'Optional: enter your answer, suggestion, or feedback',
    sending: 'Sending...', submitExit: 'Submit Exit Ticket', recordingSent: 'Recording submitted. AI analysis will appear after answering is closed.',
    personalAssessment: 'Your personal assessment', detectedLanguage: 'Detected language: ', points: 'pts', relevance: 'Relevance', clarity: 'Clarity',
    completeness: 'Completeness', doneWell: 'What you did well', nextStep: 'Next steps', transcript: 'View transcript', noTranscript: 'No speech was recognized',
    assessmentFailed: 'Recording received, but AI assessment was not completed. Please tell the instructor.', assessmentPending: 'AI assessment is still processing.',
    recordingHint: 'Up to 3 minutes. Record in a quiet place and press stop when finished.', stopRecording: 'Stop recording', uploading: 'Uploading and analyzing...', startRecording: 'Start recording',
    recordingHintTimed: 'You have {seconds} seconds for this one. Recording starts as soon as you press the button.',
    recordingHintPrepare: 'You get {prepare} seconds to prepare, then {seconds} seconds of recording starts on its own.',
    interpretation: 'Live voice interpretation', headphoneLanguage: 'Headphone language', testHeadphones: 'Test headphones', stopListening: 'Stop listening', startListening: 'Start interpretation',
    connecting: 'Connecting to the instructor’s interpretation...', waitingTeacher: 'Connected. Waiting for the instructor to speak...', playing: 'Playing interpretation', connectionFailed: 'Interpretation connection failed. Please retry.',
    audioNotEnabled: 'Audio output is not enabled. Tap the speaker icon and start listening again.', headphoneHint: 'Wear headphones, choose a language, then start listening.',
    testPlayed: 'Test tone played. If you cannot hear it, check your volume and audio output.', imageAlt: 'Image shared by presenter', congratulations: 'Congratulations!',
    winnerIs: 'The winner is', canBuzz: 'Buzz in now', waitPresenter: 'Wait for the presenter to start', submitting: 'Sending', buzz: 'Buzz', preparing: 'Get ready',
    sessionGoneTitle: 'This session has said its sayonara!', sessionGoneMessage: 'Catch the next one bright and early!',
    teacherFiles: 'Files shared by your instructor', fileUpload: 'Upload a file', chooseFile: 'Choose a file', takePhoto: 'Take a photo', fileUploading: 'Uploading...',
    uploadFailed: 'Upload failed. Please try again.', uploadClosed: 'Your instructor has stopped collecting files.', fileFeedback: 'AI feedback on your file',
    welcomeBack: 'Welcome back', signingBackIn: 'Signing you back in as {name}…', joinTitle: 'Join {title}', untitledSession: 'session',
    enterNameToView: 'Enter your name to view the class materials', enterNameToJoin: 'Enter your name to join the interactive class', yourName: 'Your name', namePlaceholder: 'Enter your name',
    joining: 'Joining...', viewClass: 'View class', joinAction: 'Join', nameRequired: 'Name is required.', joinFailed: 'Unable to join.',
    sessionNotFound: 'Session not found.', sessionLoadFailed: 'Unable to load this session. Please refresh and try again.',
    lessonSummary: 'Lesson summary', learningAssessment: 'Learning assessment', courseSatisfaction: 'Class feedback', studentQuestion: 'Student question',
    thankYouNamed: '{name}, thank you for participating.', welcomeToSession: ', welcome to {title}', quizLoadFailed: 'Unable to load this quiz. Please refresh or scan the QR code again.',
    accessExpired: 'Your participant access has expired. Please scan the QR code again.', customQuiz: 'Custom quiz', preparingQuestions: 'Preparing questions, please wait…', tryAgain: 'Try again',
    typePoll: 'Poll', typeMultipleChoice: 'Multiple-choice question', typeTrueFalse: 'True or false', typeShortAnswer: 'Short-answer question', typePronunciation: 'Pronunciation practice', typeOralResponse: 'Speaking response',
    gradingCompleted: 'Grading completed', gradingInterrupted: 'Grading was interrupted', gradingInBackground: 'Submitted. AI is grading in the background…', calculatingScore: 'Submitted. Calculating the score…',
    retryGrading: 'Retry grading', quizHintAi: 'Answer every question, then submit once. AI will grade written answers and provide feedback.', quizHintKey: 'Answer every question, then submit once. Multiple-choice questions are scored immediately from the answer key without AI.',
    quizFillPlaceholder: 'Enter your answer', quizShortPlaceholder: 'Write your answer', submitAnswers: 'Submit answers', answeredQuestions: 'Answered questions', collapseShort: 'Collapse', expandShort: 'Expand',
    questionNumber: 'Question {n}', dispatchedQuestion: 'Dispatched question', loadingYourAnswer: 'Loading your answer…', submittedScoreLabel: 'Submitted score: ', yourAnswerLabel: 'Your answer: ',
    recordingSubmitted: 'Recording submitted', transcriptLabel: 'Transcript: ',
    listening: 'Listening', listeningPlay: 'Play', listeningReplay: 'Play again', listeningPlaying: 'Playing…',
    listeningPlaysLeft: '{n} plays left', listeningLastPlay: 'This is your last play', listeningNoPlaysLeft: 'No plays left',
    listeningUnlimited: 'Listen as often as you like', listeningSlow: 'Slow', listeningNormal: 'Normal speed', listeningLoading: 'Loading audio…',
    listeningFailed: 'The audio failed to load. Please refresh and try again.', listeningHint: 'Put on headphones or turn the volume up, then press play.',
    orderingHint: 'Drag the handle, or use the arrows, to put these in order.', orderingDrag: 'Drag to reorder', orderingUp: 'Move up', orderingDown: 'Move down',
    matchingChoose: 'Choose…', matchingHint: 'Pick one match for each item.',
    writingHint: 'Fill in every field, then send it. Your teacher reads what you wrote; this one is not scored.',
    writingSubmitted: 'Sent. Your teacher will read what you wrote.',
    modelAudio: 'Model reading', modelAudioHint: 'Listen to the model first, record your own, then compare the two.', modelReplay: 'Listen as often as you like',
    prepareStart: 'Start preparing', recordingLeft: 'left', timeUp: 'Time is up', answerTimeLeft: 'Time left', answerClosed: 'Answering has closed',
    recordAgain: 'Record again',
  },
} as const

export type ParticipantMessageKey = keyof (typeof messages)['zh-TW']

// Only the two hand-written columns are indexed directly. The rest are machine
// translations that may be missing a key, so they fall through to English rather
// than rendering a blank label.
// Values are substituted rather than concatenated because word order and
// punctuation move: Chinese brackets the name in 「」 and puts the verb last,
// German and Japanese disagree again. A sentence assembled from fragments can
// only be correct in the language it was assembled for.
export function participantText(
  locale: ParticipantLocale,
  key: ParticipantMessageKey,
  values?: Record<string, string | number>,
) {
  const template = (locale === 'zh-TW' || locale === 'en')
    ? messages[locale][key]
    : generatedLocales[locale]?.[key] ?? messages.en[key]
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (
    name in values ? String(values[name]) : whole
  ))
}

const guidanceCodes: readonly string[] = GUIDANCE_LOCALES.map((locale) => locale.code)

export function isParticipantLocale(value: unknown): value is ParticipantLocale {
  return typeof value === 'string' && guidanceCodes.includes(value)
}

export function guidanceLocaleLabel(code: string) {
  return GUIDANCE_LOCALES.find((locale) => locale.code === code)?.label || code
}

// The same language is spelled three ways in this codebase: the student page
// uses BCP-47 'zh-TW', the caption pipeline stores 'zh-tw', and AI payloads key
// on 'zh_tw' because the JSON schemas avoid hyphens in property names. Converting
// at each boundary is safer than a rename that would have to migrate every row
// already written.
export function contentLocaleKey(locale: ParticipantLocale) {
  return locale.toLowerCase().replace('-', '_')
}

export function guidanceLocaleShort(code: string) {
  return GUIDANCE_LOCALES.find((locale) => locale.code === code)?.short || code.toUpperCase()
}

// A student who has chosen keeps that choice; everyone else starts on whatever
// the teacher set for the class.
export function participantLocaleFromStorage(sessionDefault?: string | null): ParticipantLocale {
  const stored = localStorage.getItem('lingoact_participant_locale')
  if (isParticipantLocale(stored)) return stored
  if (isParticipantLocale(sessionDefault)) return sessionDefault
  return 'zh-TW'
}
