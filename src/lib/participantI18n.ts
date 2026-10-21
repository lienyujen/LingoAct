import { generatedLocales } from './participantLocales.generated'
import { japaneseParticipant } from './japaneseLocales'
import { scParticipantMessages } from './scLocales.generated'

// A language class runs on two axes: the language being taught, and the language
// the explaining happens in. This file is the second one — the guidance language.
//
// The teacher sets the class default and a student whose first language differs
// can override it. Both halves are needed: one Chinese class can hold Vietnamese
// and Japanese learners at once, while a Taiwanese class learning English shares
// a single guidance language nobody should have to pick individually.
export const GUIDANCE_LOCALES = [
  { code: 'zh-CN', label: '简体中文', short: '简' },
  { code: 'zh-TW', label: '繁體中文', short: '中' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ja', label: '日本語', short: '日' },
  { code: 'ko', label: '한국어', short: '한' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
  { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
  { code: 'th', label: 'ภาษาไทย', short: 'TH' },
  { code: 'id', label: 'Bahasa Indonesia', short: 'ID' },
  { code: 'my', label: 'မြန်မာဘာသာ', short: 'MY' },
] as const

export type ParticipantLocale = (typeof GUIDANCE_LOCALES)[number]['code']

const messages = {
  'zh-TW': {
    listeningHideFurigana: '隱藏振假名', listeningShowFurigana: '顯示振假名',
    translating: '翻譯中…', translationUnavailable: '暫時無法翻譯，先顯示英文說明。',
    language: '語言', chinese: '繁體中文', english: 'English', courseEnded: '課程已結束', classDismissed: '下課啦！',
    thankYou: '謝謝你的參與。', aiSummary: 'AI 課程總結', todayHighlights: '今天的課程重點', lessonKeyPoints: '課堂重點整理',
    learningReview: '學習整理', strengths: '本次掌握的重點', reviewMore: '可以再複習', sharedResources: '課堂文字與連結',
    attendee: '與會者', welcome: '歡迎加入', session: 'LingoAct 場次', sendFeedback: '送出問題或回饋',
    messagePlaceholder: '送出後會即時出現在講者畫面，上限 36 個字或 24 個詞', limit: '上限 36 個字或 24 個詞。',
    danmakuClosed: '老師目前把彈幕關起來了',
    board: '討論板',
    boardAfterClass: '課程已結束，這面牆留給你回顧。',
    boardAnonymous: '匿名',
    boardAudio: '錄音',
    boardCancel: '取消',
    boardClosed: '討論已經結束，還看得到大家貼的，也可以按心情，但不能再貼或回覆。',
    boardCount: '你已經貼了 {used} 則，可貼 {limit} 則',
    boardDrawing: '電繪',
    boardEdit: '修改',
    boardEdited: '已修改',
    boardEmpty: '還沒有人貼東西。',
    boardFile: '檔案',
    boardFull: '你已經貼滿了。刪除一則就能再貼一則。',
    boardImage: '圖片',
    boardLink: '貼連結',
    boardLinkPlaceholder: 'https://',
    boardOpenFailed: '貼文失敗，請再試一次。',
    boardPausedWhileAway: '老師不在線上，現在只能看，不能貼。',
    boardPickFile: '上傳檔案',
    boardPickImage: '上傳圖片，行動裝置開啟相機',
    boardPlaceholder: '寫下你的想法',
    boardPosting: '張貼中…',
    boardRecord: '開始錄音',
    boardReply: '回覆',
    boardReplyPlaceholder: '回覆這則…',
    boardSave: '儲存',
    boardStop: '停止',
    boardUnlimited: '可貼則數不限',
    boardWithdraw: '刪除',
    boardWithdrawn: '已刪除',
    boardWrite: '文字回應',
    boardYoursEmpty: '你還沒有貼東西。',
    boardYoursOnly: '這一題自行作答，只有你看得到自己貼的。',
    pinsLeft: '還可以點 {n} 次', pinsUsed: '已經點滿了，點自己的標記可以取消',
    standingScore: '目前分數', standingPoints: '分', standingRank: '名次',
    aiReadingOfQuestion: 'AI 對這一題的判讀', aiSuggestedAnswer: 'AI 建議答案',
    handRaise: '舉手', handLower: '放下手',
    readingTitle: '閱讀',
    readingWords: '生詞', readingGrammar: '語法', readingZhuyin: '注音', readingPinyin: '拼音',
    onBreak: '下課中', teacherAway: '老師目前不在線上，回來後這裡會自動恢復。',
    readingLocked: '做完測驗才看得到生詞和語法。',
    close: '關閉',
    answerSent: '答案已送出。',
    drawAnswer: '電寫作答', drawSubmitted: '你送出的作答', drawAgain: '重新作答',
    drawSelect: '選取', drawPen: '筆', drawEraser: '橡皮擦', drawText: '文字',
    drawUndo: '復原', drawClear: '清空畫布', drawDeleteSelected: '刪掉選的',
    drawImport: '拍照／上傳圖片', drawImportHint: '也可以貼上圖片；使用選取工具移動、縮放或旋轉圖片，再繼續書寫。',
    drawImportFailed: '無法讀取圖片，請選擇 JPG、PNG 或 WebP 圖片。', drawImportTooLarge: '圖片超過 20 MB，請縮小後再上傳。',
    drawBlank: '不要老師的圖，我自己重畫',
    drawSelectHint: '點一下選取，拖曳可移動；兩指可放大縮小和轉向，用滑鼠就拖角落的圓點。',
    drawTextPlaceholder: '打字後按 Enter 或按 ✓',
    boardPost: '送出', boardUploading: '上傳中…',
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
    markPending: '老師還沒批改這一份', markRunning: 'AI 批改中…', markFailed: '批改失敗，請告訴老師',
    markUnsupported: 'AI 讀不了這個檔案格式',
    fileVerdictCorrect: '正確', fileVerdictPartial: '部分正確', fileVerdictIncorrect: '要再修改', fileVerdictUnscored: '已看過',
    fileDidWell: '做得好', fileCouldImprove: '可以更好',
    myUploads: '我上傳的',
    captionWrite: '打字', captionSpeak: '錄音', captionSend: '送出說明', captionSending: '送出中…',
    captionRecord: '按一下開始錄音', captionStop: '錄音中，按一下結束',
    captionPlaceholder: '用這堂課的語言說明你拍到的東西', captionSent: '說明已送出',
    captionSentSpoken: '錄音說明已送出', captionFailed: '說明送出失敗，請再試一次。',
    captionTooShort: '錄得太短了，再說一次。', micDenied: '無法使用麥克風，請允許權限後再試。',
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
    listeningShowText: '顯示文字',
    listeningHidePinyin: '不顯示拼音', listeningHideZhuyin: '不顯示注音',
    listeningAudioBroken: '語音載入失敗', listeningPause: '暫停', listeningResume: '繼續播放',
    listeningFailed: '語音載入失敗，請重新整理再試一次。', listeningHint: '戴上耳機或調高音量，按播放開始聆聽。',
    orderingHint: '拖曳左側把手，或用箭頭調整順序。', orderingDrag: '拖曳調整順序', orderingUp: '往上移', orderingDown: '往下移',
    orderingPictureHint: '請自行安排四張圖的順序，並在每張圖下寫一段故事。',
    pictureWritingPlaceholder: '寫下這一格發生的事…',
    matchingChoose: '請選擇…', matchingHint: '每個項目各選一個配對。',
    flashcardProgress: '已學會 {done} / {total}', flashcardRight: '答對了！', flashcardWrong: '再想一下，這張稍後會再出現。',
    flashcardNext: '下一張', flashcardTryLater: '繼續', flashcardDone: '這疊卡片完成了',
    flashcardFirstTry: '第一次就答對 {right} / {total} 張。',
    flashcardReview: '字詞卡複習', flashcardFlipHint: '點一下翻面看解釋', flashcardFront: '字詞', flashcardBack: '解釋',
    flashcardPrevious: '上一張', flashcardCardCount: '第 {current} / {total} 張',
    writingHint: '把每個欄位寫完再送出。老師會看你的文章，批改與分數也會完整留在作答紀錄裡。',
    coachAsk: '請教練看看（還可以問 {left} 次）', coachAskAgain: '改好了，再問一次（還剩 {left} 次）',
    coachThinking: '教練正在看…', coachSpent: '這個欄位問完了，把它寫完送出吧',
    coachRevise: '先改一改再問教練', coachReady: '這樣就可以送出了。',
    coachRound: '第 {n} 次', coachFailed: '教練暫時無法回覆，請再試一次。',
    coachIntro: '寫一段之後可以請教練看看。教練只會問問題、指出可以改的地方，不會幫你寫。',
    writingSubmitted: '已送出。老師批改後，修訂稿、評語與分數會顯示在這裡。',
    composeHeading: '整合成一篇文章',
    composeHint: '把上面每一段整合成一篇連貫的文章：加上開頭與結尾，用連接詞把段落接起來，重複的地方刪掉。這篇才是你要交的作品。',
    composePlaceholder: '在這裡寫成一篇文章',
    composeFill: '先帶入我寫的段落',
    composeRefill: '重新帶入我寫的段落',
    revisionAdded: 'AI 補上或改成的',
    revisionRemoved: '原本寫的',
    revisionUnchanged: 'AI 沒有改動任何地方，這篇寫得很完整。',
    revisionNotes: '為什麼這樣改',
    revisionPending: '老師還沒請 AI 批改，批改完會出現在這裡。',
    modelAudio: '原音示範', modelAudioHint: '先聽一次原音，再錄下自己的版本，然後比較兩者。', modelReplay: '可以重複聽',
    prepareStart: '開始準備', recordingLeft: '剩下', timeUp: '時間到', answerTimeLeft: '作答剩下', answerClosed: '作答時間已結束',
    recordAgain: '重錄一次',
  },
  en: {
    listeningHideFurigana: 'Hide furigana', listeningShowFurigana: 'Show furigana',
    translating: 'Translating…', translationUnavailable: 'Translation is temporarily unavailable. Showing the English explanation.',
    language: 'Language', chinese: "Traditional Chinese", english: 'English', courseEnded: 'Class ended', classDismissed: "Class dismissed!",
    thankYou: 'Thank you for participating.', aiSummary: 'AI class summary', todayHighlights: 'Today’s class highlights', lessonKeyPoints: 'Key takeaways',
    learningReview: 'Learning review', strengths: "What you learned", reviewMore: "What to review", sharedResources: 'Class text and links',
    attendee: "Student", welcome: "Welcome", session: "LingoAct class", sendFeedback: 'Send a question or feedback',
    messagePlaceholder: "Your message appears on the teacher’s screen immediately (up to 36 characters or 24 words)", limit: 'Up to 36 characters or 24 words.',
    danmakuClosed: "Your teacher has turned off live comments for now",
    board: 'Discussion board',
    boardAfterClass: 'Class is over. The board stays here for you to look back on.',
    boardAnonymous: 'Anonymous',
    boardAudio: 'Record',
    boardCancel: 'Cancel',
    boardClosed: 'Discussion is closed. You can still read the board and react, but not post or reply.',
    boardCount: 'You have posted {used} of {limit}',
    boardDrawing: 'Draw',
    boardEdit: 'Edit',
    boardEdited: 'Edited',
    boardEmpty: 'Nothing on the board yet.',
    boardFile: 'File',
    boardFull: "You have reached the post limit. Delete a post to add another.",
    boardImage: 'Image',
    boardLink: 'Add a link',
    boardLinkPlaceholder: 'https://',
    boardOpenFailed: 'Could not post. Please try again.',
    boardPausedWhileAway: 'Your teacher is offline. You can read the board but not post.',
    boardPickFile: 'Upload a file',
    boardPickImage: 'Upload a photo — opens the camera on a phone',
    boardPlaceholder: 'Write what you think',
    boardPosting: 'Posting…',
    boardRecord: 'Record',
    boardReply: 'Reply',
    boardReplyPlaceholder: 'Reply to this…',
    boardSave: 'Save',
    boardStop: 'Stop',
    boardUnlimited: 'No limit',
    boardWithdraw: 'Delete',
    boardWithdrawn: 'Deleted',
    boardWrite: 'Text',
    boardYoursEmpty: 'You have not posted anything yet.',
    boardYoursOnly: "This is an individual response. Only you can see your posts until your teacher reveals them.",
    pinsLeft: "{n} markers remaining", pinsUsed: "You have used all your markers. Tap your own marker to remove it.",
    standingScore: 'Your score', standingPoints: 'pts', standingRank: 'Rank',
    aiReadingOfQuestion: "Question identified by AI", aiSuggestedAnswer: "AI-suggested answer",
    handRaise: 'Raise hand', handLower: 'Lower hand',
    readingTitle: 'Reading',
    readingWords: 'Vocabulary', readingGrammar: 'Grammar', readingZhuyin: 'Zhuyin', readingPinyin: 'Pinyin',
    onBreak: 'On a break', teacherAway: "Your teacher is offline. This page will resume automatically when they return.",
    readingLocked: 'New words and grammar unlock once you have finished the questions.',
    close: 'Close',
    answerSent: "Answer submitted.",
    drawAnswer: 'Write your answer', drawSubmitted: "Your submitted response", drawAgain: 'Answer again',
    drawSelect: 'Select', drawPen: 'Pen', drawEraser: 'Eraser', drawText: 'Text',
    drawUndo: 'Undo', drawClear: 'Clear canvas', drawDeleteSelected: 'Delete selected',
    drawImport: 'Take photo / upload image', drawImportHint: 'You can also paste an image. Use Select to move, resize, or rotate it, then continue writing.',
    drawImportFailed: 'This image could not be opened. Choose a JPG, PNG, or WebP image.', drawImportTooLarge: 'This image exceeds 20 MB. Resize it before uploading.',
    drawBlank: "Use a blank canvas",
    drawSelectHint: "Tap to select and drag to move. Use two fingers to resize or rotate, or drag the corner handles with a mouse.",
    drawTextPlaceholder: 'Type, then press Enter or ✓',
    boardPost: 'Post', boardUploading: 'Uploading…',
    used: 'Used', send: 'Send', questionEnded: 'This question has ended.', submittedAnswer: 'Answer submitted: ', interactiveQuestion: 'Interactive question',
    answerPlaceholder: 'Enter your answer', submitAnswer: 'Submit answer', presenterDispatch: "Shared by your teacher", collapse: 'Hide older items', expandAll: 'Show all',
    items: 'items', copied: 'Copied', copy: 'Copy text', openLink: 'Open link', dispatched: 'Sent',
    exitSubmitted: "Exit ticket submitted", learningLevel: 'Understanding: ', stars: 'stars', required: "1. Required", optional: "2. Optional",
    ratingPrompt: 'Rate your understanding of today’s class from 1 to 5 stars', ratingLabel: 'Understanding rating', optionalPlaceholder: 'Optional: enter your answer, suggestion, or feedback',
    sending: "Sending…", submitExit: "Submit exit ticket", recordingSent: 'Recording submitted. AI analysis will appear after answering is closed.',
    personalAssessment: 'Your personal assessment', detectedLanguage: 'Detected language: ', points: 'pts', relevance: 'Relevance', clarity: 'Clarity',
    completeness: 'Completeness', doneWell: 'What you did well', nextStep: 'Next steps', transcript: 'View transcript', noTranscript: 'No speech was recognized',
    assessmentFailed: "Your recording was received, but AI assessment could not finish. Please tell your teacher.", assessmentPending: 'AI assessment is still processing.',
    recordingHint: 'Up to 3 minutes. Record in a quiet place and press stop when finished.', stopRecording: 'Stop recording', uploading: "Uploading and analyzing…", startRecording: 'Start recording',
    recordingHintTimed: 'You have {seconds} seconds for this one. Recording starts as soon as you press the button.',
    recordingHintPrepare: 'You get {prepare} seconds to prepare, then {seconds} seconds of recording starts on its own.',
    interpretation: "Live audio translation", headphoneLanguage: "Listening language", testHeadphones: 'Test headphones', stopListening: 'Stop listening', startListening: "Start listening",
    connecting: "Connecting to live translation…", waitingTeacher: "Connected. Waiting for your teacher to speak…", playing: "Playing translated audio", connectionFailed: "Live translation could not connect. Please try again.",
    audioNotEnabled: 'Audio output is not enabled. Tap the speaker icon and start listening again.', headphoneHint: 'Wear headphones, choose a language, then start listening.',
    testPlayed: 'Test tone played. If you cannot hear it, check your volume and audio output.', imageAlt: "Image shared by your teacher", congratulations: 'Congratulations!',
    winnerIs: 'The winner is', canBuzz: 'Buzz in now', waitPresenter: "Wait for your teacher to start", submitting: "Submitting…", buzz: "Buzz in", preparing: 'Get ready',
    sessionGoneTitle: "This class is no longer available", sessionGoneMessage: "Ask your teacher for a new class link.",
    teacherFiles: "Files shared by your teacher", fileUpload: 'Upload a file', chooseFile: 'Choose a file', takePhoto: 'Take a photo', fileUploading: "Uploading…",
    uploadFailed: 'Upload failed. Please try again.', uploadClosed: "Your teacher has closed file submissions.", fileFeedback: 'AI feedback on your file',
    markPending: "Your teacher has not graded this yet", markRunning: "AI is grading your work…", markFailed: "Grading failed. Please tell your teacher.",
    markUnsupported: 'The AI cannot read this file format',
    fileVerdictCorrect: 'Correct', fileVerdictPartial: "Partially correct", fileVerdictIncorrect: "Needs revision", fileVerdictUnscored: "Reviewed",
    fileDidWell: "Strengths", fileCouldImprove: "Areas to improve",
    myUploads: "My submissions",
    captionWrite: 'Write', captionSpeak: 'Record', captionSend: 'Send description', captionSending: 'Sending…',
    captionRecord: 'Tap to start recording', captionStop: 'Recording — tap to stop',
    captionPlaceholder: 'Describe what you photographed, in the language of this class', captionSent: 'Description sent',
    captionSentSpoken: 'Recorded description sent', captionFailed: 'The description could not be sent. Please try again.',
    captionTooShort: "The recording was too short. Please record again.", micDenied: 'The microphone is not available. Please allow access and try again.',
    welcomeBack: 'Welcome back', signingBackIn: 'Signing you back in as {name}…', joinTitle: 'Join {title}', untitledSession: "class",
    enterNameToView: 'Enter your name to view the class materials', enterNameToJoin: "Enter your name to join the class", yourName: 'Your name', namePlaceholder: 'Enter your name',
    joining: "Joining…", viewClass: 'View class', joinAction: 'Join', nameRequired: 'Name is required.', joinFailed: 'Unable to join.',
    sessionNotFound: "Class not found.", sessionLoadFailed: "This class could not be loaded. Refresh and try again.",
    lessonSummary: 'Lesson summary', learningAssessment: 'Learning assessment', courseSatisfaction: 'Class feedback', studentQuestion: 'Student question',
    thankYouNamed: '{name}, thank you for participating.', welcomeToSession: ', welcome to {title}', quizLoadFailed: 'Unable to load this quiz. Please refresh or scan the QR code again.',
    accessExpired: "Your access has expired. Scan the class QR code again to rejoin.", customQuiz: 'Custom quiz', preparingQuestions: 'Preparing questions, please wait…', tryAgain: 'Try again',
    typePoll: 'Poll', typeMultipleChoice: "Multiple choice", typeTrueFalse: 'True or false', typeShortAnswer: "Short answer", typePronunciation: "Read-aloud practice", typeOralResponse: "Spoken response",
    gradingCompleted: "Grading complete", gradingInterrupted: "Grading could not finish", gradingInBackground: 'Submitted. AI is grading in the background…', calculatingScore: "Submitted. Calculating your score…",
    retryGrading: 'Retry grading', quizHintAi: "Answer all questions, then submit them together. AI will grade fill-in-the-blank and short-answer responses and provide feedback.", quizHintKey: "Answer all questions, then submit them together. Multiple-choice questions are scored using the answer key, without AI grading.",
    quizFillPlaceholder: 'Enter your answer', quizShortPlaceholder: 'Write your answer', submitAnswers: 'Submit answers', answeredQuestions: 'Answered questions', collapseShort: 'Collapse', expandShort: 'Expand',
    questionNumber: 'Question {n}', dispatchedQuestion: "Current question", loadingYourAnswer: 'Loading your answer…', submittedScoreLabel: "Your score: ", yourAnswerLabel: 'Your answer: ',
    recordingSubmitted: 'Recording submitted', transcriptLabel: 'Transcript: ',
    listening: 'Listening', listeningPlay: 'Play', listeningReplay: 'Play again', listeningPlaying: 'Playing…',
    listeningPlaysLeft: '{n} plays left', listeningLastPlay: 'This is your last play', listeningNoPlaysLeft: 'No plays left',
    listeningUnlimited: 'Listen as often as you like', listeningSlow: 'Slow', listeningNormal: 'Normal speed', listeningLoading: 'Loading audio…',
    listeningShowText: 'Show text',
    listeningHidePinyin: 'Hide pinyin', listeningHideZhuyin: 'Hide zhuyin',
    listeningAudioBroken: 'Audio unavailable', listeningPause: 'Pause', listeningResume: 'Resume',
    listeningFailed: 'The audio failed to load. Please refresh and try again.', listeningHint: 'Put on headphones or turn the volume up, then press play.',
    orderingHint: 'Drag the handle, or use the arrows, to put these in order.', orderingDrag: 'Drag to reorder', orderingUp: 'Move up', orderingDown: 'Move down',
    orderingPictureHint: 'Choose an order for the four pictures and write part of the story under each one.',
    pictureWritingPlaceholder: 'Write what happens in this panel…',
    matchingChoose: 'Choose…', matchingHint: 'Pick one match for each item.',
    flashcardProgress: 'Learned {done} of {total}', flashcardRight: 'Correct!', flashcardWrong: 'Not quite — this card will come back.',
    flashcardNext: 'Next card', flashcardTryLater: 'Continue', flashcardDone: 'Deck finished',
    flashcardFirstTry: "{right} of {total} correct on your first attempt.",
    flashcardReview: 'Flashcard review', flashcardFlipHint: 'Tap to flip for the meaning', flashcardFront: 'Word', flashcardBack: 'Meaning',
    flashcardPrevious: 'Previous card', flashcardCardCount: 'Card {current} of {total}',
    writingHint: "Complete every section, then submit your work. Your teacher’s revision, feedback, and score will be saved with your response.",
    coachAsk: "Ask the coach ({left} requests left)", coachAskAgain: "Ask again ({left} requests left)",
    coachThinking: 'The coach is reading…', coachSpent: "You have used all coaching requests for this section. Finish your writing and submit it.",
    coachRevise: "Revise your draft before asking again", coachReady: "Your draft is ready to submit.",
    coachRound: 'Round {n}', coachFailed: 'The coach could not reply. Please try again.',
    coachIntro: "Write a draft, then ask the coach for help. It will ask questions and suggest improvements without writing for you.",
    writingSubmitted: "Submitted. Your teacher’s revision, feedback, and score will appear here.",
    composeHeading: "Put your draft together",
    composeHint: "Combine your paragraphs into one coherent piece. Add an introduction and conclusion, use transitions to connect your ideas, and remove repetition. Submit this complete draft.",
    composePlaceholder: "Write your complete draft here",
    composeFill: "Insert my paragraphs",
    composeRefill: "Reinsert my paragraphs",
    revisionAdded: 'Added or changed by the AI',
    revisionRemoved: "Original wording",
    revisionUnchanged: "AI did not suggest any changes to this draft.",
    revisionNotes: "Reasons for the changes",
    revisionPending: "Your teacher has not requested an AI review yet. The revision will appear here after review.",
    modelAudio: "Model audio", modelAudioHint: "Listen to the model, record your own reading, then compare the two.", modelReplay: 'Listen as often as you like',
    prepareStart: 'Start preparing', recordingLeft: 'left', timeUp: 'Time is up', answerTimeLeft: 'Time left', answerClosed: "Responses are closed",
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
    : locale === 'ja' ? japaneseParticipant[key] ?? messages.en[key]
    : locale === 'zh-CN' ? scParticipantMessages[key] ?? messages.en[key]
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
  const brand = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search).get('b')
  if (brand === 'japanese' || import.meta.env.VITE_APP_PROFILE === 'japanese') return 'ja'
  return brand === 'sc' || import.meta.env.VITE_APP_PROFILE === 'sc' ? 'zh-CN' : (brand === 'english' || import.meta.env.VITE_APP_PROFILE === 'english') ? 'en' : 'zh-TW'
}

// The 導引語 the teacher set, applied so that it actually wins.
//
// Reading it through participantLocaleFromStorage alone did not: the stored
// value is preferred there, so a device that had ever been in a Chinese class
// stayed in Chinese whatever the teacher dispatched — the "it uses last time's
// setting" everyone was seeing.
//
// A student's own pick still stands, remembered against the 導引語 it was made
// under. It survives reloads and is dropped the moment the teacher moves the
// class to a different language, because that is a new instruction rather than
// the same one arriving again.
export function localeForDispatchedGuidance(sessionId: string, dispatched: string | null | undefined) {
  if (!isParticipantLocale(dispatched)) return participantLocaleFromStorage()
  const appliedKey = `lingoact_guidance_applied_${sessionId}`
  if (localStorage.getItem(appliedKey) !== dispatched) {
    localStorage.setItem(appliedKey, dispatched)
    localStorage.removeItem('lingoact_participant_locale')
  }
  return participantLocaleFromStorage(dispatched)
}
