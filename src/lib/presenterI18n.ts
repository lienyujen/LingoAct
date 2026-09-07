import { createContext, useContext } from 'react'
import { generatedPresenterLocales } from './presenterLocales.generated'
import { resolveTrack } from './teachingTracks'

// The teacher's own interface, in the language of the class they are teaching.
//
// This is the second of the two i18n tables. The first, participantI18n, follows
// the 導引語 — what the class is EXPLAINED in — because that is what a student
// needs to understand the page. This one follows the 教學語, the target
// language, because that is what the teacher asked for: an English class puts
// the teacher in English, a Japanese class in Japanese. 華語文 and 國語文 are
// both Mandarin, so both leave the interface in Chinese.
//
// The create-class screen is deliberately NOT covered: it is where the teaching
// language is chosen, so there is nothing to follow yet.
export type PresenterLocale = 'zh-TW' | 'en' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'vi'

const messages = {
  'zh-TW': {
    // 控制面板
    onlineCount: '線上 {n} 人',
    startBuzzer: '開始搶答', restartBuzzer: '重新開始搶答', noOneOnline: '目前沒有線上學員',
    drawLots: '抽籤', drawFromOnline: '從線上學員中抽籤',
    teacherSettings: '教師端設定', teacherSettingsHint: '課程錄製、字幕、即時口譯語音與麥克風設定',
    classActivities: '課堂活動',
    captureQuestion: '截圖派題', listeningStudio: '聽力播音室', pictureTalk: '看圖說話',
    sentenceWall: '即時造句牆', photoTask: '拍照描述', textDispatch: '文字派送',
    wordCloud: '彈幕文字雲', fileTransfer: '檔案傳送',
    classWrapUp: '課堂收尾', generateExitTicket: 'AI 生成 Exit Ticket', exitTicketSent: 'Exit Ticket 已派送',
    endClass: '下課並產生報告',
    classSettings: '課堂設定',
    danmaku: '彈幕', anonymous: '匿名', recording: '錄製', captions: '字幕',
    on: '開啟', off: '關閉', connecting: '連線中',
    captionToggleHint: '控制教師與學生端的即時字幕顯示', captionNeedsRecording: '請先開啟課程錄製',

    // 共用
    cancel: '取消', close: '關閉', send: '派送', sending: '派送中…', sendFailed: '派送失敗。',
    sent: '已派送', actionFailed: '操作失敗。',
    prepareTime: '準備時間', noPrepare: '不準備', answerTime: '作答時間', noTimeLimit: '不限時',

    // 看圖說話
    pictureTopicPlaceholder: '主題（選填），例如：在夜市買東西、幫忙做家事',
    generatePicture: '生成四格圖', anotherPicture: '換一張', drawing: 'AI 正在畫四格圖…',
    pictureHint: '留空由 AI 依這堂課的語言和程度自己想一個情境。圖裡不會有任何文字，學生看圖說或寫。',
    picturePreviewAlt: '四格圖預覽',
    modeSpoken: '口說', modeWritten: '打字', modeOrdering: '排順序',
    pictureOrderingHint: '四格會被切開、打亂後送到學生端，學生拖成正確順序。完整的圖不會派出去。',
    questionLabel: '題目', planPrivate: '以上只有你看得到，學生端只會收到圖和題目。',
    cuttingPanels: '正在切開四格並派送…', generateFailed: '生成失敗，請再試一次。',

    // 即時造句牆
    sentenceWallSub: '每人寫一句，全班的句子會即時出現在大螢幕上',
    sentenceWallLabel: '造句題目',
    sentenceWallPlaceholder: '例如：用「雖然……但是……」造一個跟天氣有關的句子',
    opening: '開啟中…', sendAndOpenWall: '派題並開牆',
    sentenceWallShort: '造句牆', wallShowing: '大螢幕顯示中', wallShow: '投到大螢幕',
    composeN: 'AI 集成這 {n} 句', composeAgain: '重新集成', composing: '集成中…',
    sendViaText: '用文字派送給學生', composeNeedsTwo: '至少收到兩個句子後就可以集成。',
    worthLearning: '值得學的句子', watchOutFor: '要注意的地方',

    // 拍照描述
    photoTaskSub: '學生拍下真實的東西，再用這堂課的語言寫或錄音說明',
    photoTaskLabel: '任務說明',
    photoTaskPlaceholder: '例如：在校園裡拍一樣你每天都會用到的東西，說明它是什麼、放在哪裡、你怎麼用它。',
    photoTaskHint: '學生每張照片下方都會有一個說明欄，可以打字，也可以直接錄音。',
    sendTask: '派送任務',

    // 截圖派題
    captureTitle: '截圖派題', capturePreviewAlt: '截圖預覽',
    typeSendScreen: '派送畫面', typeCustomQuiz: '自訂測驗', typePoll: '投票題',
    typeMultipleChoice: '選擇題', typeFileUpload: '上傳作答', typeShortAnswer: '問答題',
    typeOralResponse: '口語表達', typePronunciation: '朗讀發音',
    allowMultiple: '允許多選', options: '選項', optionN: '選項 {n}',
    uploadTypeHint: '學生端會看到這張截圖和上傳按鈕，手機、平板可以直接拍照上傳。停止作答後可逐份批改。',
    readAloudLabel: '指定朗讀內容（選填）', uploadPromptLabel: '作答說明（選填）', promptLabel: '題目（選填）',
    readAloudPlaceholder: '未輸入則以 AI 判讀截圖中的朗讀內容',
    uploadPromptPlaceholder: '例如：請把計算過程寫在紙上拍照上傳',
    promptPlaceholder: '未輸入則以AI判讀題目',
    generateAndSend: 'AI 出題並派送',

    // 自訂測驗設定
    fieldCount: '欄位數', cardCount: '卡片數', itemCount: '題數',
    autoDecide: '自動判斷', unitField: '欄', unitCard: '張', unitItem: '題',
    formatLabel: '型式', itemTypeLabel: '題型',
    typeRandom: '隨機／AI自動判斷', typeFillBlank: '填充題', typeShortAnswerQuiz: '簡答題',
    typeOrdering: '排序題', typeMatching: '配對題',
    typeFlashcard: '單字卡練習（自己的速度・錯的會再出現）', typeWriting: '寫作教練（不評分）',
    writingDirection: '寫作方向', cardDirection: '出卡方向', quizDirection: '出題方向',
    writingDirectionPlaceholder: '請說明寫作對象、主題與希望學生用到的詞語或句型',
    cardDirectionPlaceholder: '請說明要練哪些詞語或字音，例如：這一課的生詞，看解釋選詞',
    quizDirectionPlaceholder: '請說明測驗對象、欲測能力與題目難度',
    coachingToggle: '開啟 AI 鷹架提問',
    coachingToggleHint: '學生寫到一半可以請教練看看。教練只提問、指出要改的地方，不會幫學生寫，每個欄位最多三次。',
    writingCoachedHint: 'AI 開欄位、陪學生問，但不批改也不代寫。你會看到每個人的定稿，還有他們改了幾次、教練問了什麼。',
    writingPlainHint: 'AI 只負責開出要寫的欄位，學生填完送回後由你直接看，不會用 AI 批改。',
    flashcardHint: '學生一張一張自己練，答錯的卡片會再出現，直到整疊都答對。不打分數，你看到的是誰第一次就會、誰卡在哪張。',
    quizHint: '也可以直接在出題方向指定題數與題型；題數選「自動判斷」、題型選「隨機」即可。',

    // 文字派送
    textDispatchSub: '內容會即時出現在學員裝置上',
    closeTextDispatch: '關閉文字派送',
    textLabel: '文字', urlLabel: '網址',
    textPlaceholder: '輸入可讓學員複製的文字',
    sendNow: '立即派送',
  },
  en: {
    onlineCount: '{n} online',
    startBuzzer: 'Start buzz-in', restartBuzzer: 'Restart buzz-in', noOneOnline: 'Nobody is online yet',
    drawLots: 'Draw a name', drawFromOnline: 'Draw from the students who are online',
    teacherSettings: 'Teacher settings', teacherSettingsHint: 'Recording, captions, live interpretation audio and microphone',
    classActivities: 'Class activities',
    captureQuestion: 'Question from screen', listeningStudio: 'Listening studio', pictureTalk: 'Picture description',
    sentenceWall: 'Sentence wall', photoTask: 'Photo description', textDispatch: 'Send text',
    wordCloud: 'Word cloud', fileTransfer: 'Send files',
    classWrapUp: 'Wrapping up', generateExitTicket: 'Generate an exit ticket', exitTicketSent: 'Exit ticket sent',
    endClass: 'End class and build the report',
    classSettings: 'Class settings',
    danmaku: 'Live comments', anonymous: 'Anonymous', recording: 'Recording', captions: 'Captions',
    on: 'On', off: 'Off', connecting: 'Connecting',
    captionToggleHint: 'Shows or hides the live captions on both screens', captionNeedsRecording: 'Turn recording on first',

    cancel: 'Cancel', close: 'Close', send: 'Send', sending: 'Sending…', sendFailed: 'Could not send.',
    sent: 'Sent', actionFailed: 'That did not work.',
    prepareTime: 'Thinking time', noPrepare: 'None', answerTime: 'Time to answer', noTimeLimit: 'No limit',

    pictureTopicPlaceholder: 'Topic (optional) — buying something at a night market, helping at home',
    generatePicture: 'Draw four panels', anotherPicture: 'Draw another', drawing: 'Drawing the four panels…',
    pictureHint: 'Leave it empty and the AI picks a situation to suit this class and level. The picture carries no words, so students describe it in their own.',
    picturePreviewAlt: 'Four-panel picture',
    modeSpoken: 'Speak', modeWritten: 'Write', modeOrdering: 'Put in order',
    pictureOrderingHint: 'The four panels are cut apart, shuffled and sent for students to drag back into order. The whole picture is never sent.',
    questionLabel: 'Instruction', planPrivate: 'Only you see this. Students get the picture and the instruction.',
    cuttingPanels: 'Cutting the panels and sending…', generateFailed: 'That did not work. Please try again.',

    sentenceWallSub: 'Everyone writes one sentence, and the class’s sentences appear on the projector',
    sentenceWallLabel: 'What to write',
    sentenceWallPlaceholder: 'e.g. Write a sentence about the weather using "although … still …"',
    opening: 'Opening…', sendAndOpenWall: 'Send it and open the wall',
    sentenceWallShort: 'Sentence wall', wallShowing: 'On the projector', wallShow: 'Show on the projector',
    composeN: 'Write up these {n} sentences', composeAgain: 'Write it up again', composing: 'Writing…',
    sendViaText: 'Send it to the class as text', composeNeedsTwo: 'Two sentences are enough to write something up.',
    worthLearning: 'Worth learning from', watchOutFor: 'Worth fixing',

    photoTaskSub: 'Students photograph something real, then describe it in the language of this class',
    photoTaskLabel: 'The task',
    photoTaskPlaceholder: 'e.g. Photograph something on campus you use every day. Say what it is, where it is and how you use it.',
    photoTaskHint: 'Every photo gets a description box under it. Students can type it or record it.',
    sendTask: 'Send the task',

    captureTitle: 'Send from the screen', capturePreviewAlt: 'Captured screen',
    typeSendScreen: 'Just the screen', typeCustomQuiz: 'AI quiz', typePoll: 'Poll',
    typeMultipleChoice: 'Multiple choice', typeFileUpload: 'Upload an answer', typeShortAnswer: 'Written answer',
    typeOralResponse: 'Spoken answer', typePronunciation: 'Read aloud',
    allowMultiple: 'Allow more than one', options: 'Choices', optionN: 'Choice {n}',
    uploadTypeHint: 'Students see this screen and an upload button; on a phone or tablet they can photograph their work. Mark them one by one once you stop collecting.',
    readAloudLabel: 'What to read aloud (optional)', uploadPromptLabel: 'Instructions (optional)', promptLabel: 'Question (optional)',
    readAloudPlaceholder: 'Leave empty and the AI reads it off the captured screen',
    uploadPromptPlaceholder: 'e.g. Show your working on paper and photograph it',
    promptPlaceholder: 'Leave empty and the AI reads the question off the screen',
    generateAndSend: 'Write the questions and send',

    fieldCount: 'Fields', cardCount: 'Cards', itemCount: 'Questions',
    autoDecide: 'Let the AI decide', unitField: 'fields', unitCard: 'cards', unitItem: 'questions',
    formatLabel: 'Format', itemTypeLabel: 'Question type',
    typeRandom: 'Mixed — the AI decides', typeFillBlank: 'Fill in the blank', typeShortAnswerQuiz: 'Short answer',
    typeOrdering: 'Put in order', typeMatching: 'Matching',
    typeFlashcard: 'Flashcards (own pace, missed cards come back)', typeWriting: 'Writing coach (not scored)',
    writingDirection: 'What to write about', cardDirection: 'What the cards should drill', quizDirection: 'What to ask about',
    writingDirectionPlaceholder: 'Who is writing, on what topic, and the words or patterns you want them to use',
    cardDirectionPlaceholder: 'Which words or sounds to drill — e.g. this lesson\'s vocabulary, meaning to word',
    quizDirectionPlaceholder: 'Who is being tested, what you are testing, and how hard it should be',
    coachingToggle: 'Let students ask the coach',
    coachingToggleHint: 'Students can show a draft to the coach mid-way. It only asks questions and points at what to change — it never writes for them. Three rounds per field.',
    writingCoachedHint: 'The AI opens the fields and asks the questions, but never marks and never writes. You see each final draft, how many times they asked, and what the coach asked.',
    writingPlainHint: 'The AI only opens the fields to write in. You read what comes back yourself; nothing is AI-marked.',
    flashcardHint: 'Students work through the deck at their own pace and missed cards come back until the deck is clear. No score — you see who knew it cold and which card they got stuck on.',
    quizHint: 'You can also state the count and type in the direction; leave them on "let the AI decide" and "mixed".',

    textDispatchSub: 'It appears on every student device straight away',
    closeTextDispatch: 'Close',
    textLabel: 'Text', urlLabel: 'Link',
    textPlaceholder: 'Text your students can copy',
    sendNow: 'Send now',
  },
} as const

export type PresenterMessageKey = keyof (typeof messages)['zh-TW']

export function presenterText(
  locale: PresenterLocale,
  key: PresenterMessageKey,
  values?: Record<string, string | number>,
) {
  const template = (locale === 'zh-TW' || locale === 'en')
    ? messages[locale][key]
    : generatedPresenterLocales[locale]?.[key] ?? messages.en[key]
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (
    name in values ? String(values[name]) : whole
  ))
}

const presenterLocales: readonly string[] = ['zh-TW', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'vi']

// The track carries a language code in the caption pipeline's lower-case
// spelling; the locale tables key on BCP-47. Converting here rather than
// renaming either side keeps rows already written valid.
export function presenterLocaleFor(teachingLanguage: string | null | undefined): PresenterLocale {
  const language = resolveTrack(teachingLanguage).language
  const normalised = language === 'zh-tw' ? 'zh-TW' : language
  return (presenterLocales.includes(normalised) ? normalised : 'zh-TW') as PresenterLocale
}

// A context rather than a prop on fifteen components: the locale is a property
// of the class, not of any one panel, and threading it by hand would touch
// every call site every time a component moves.
export const PresenterLocaleContext = createContext<PresenterLocale>('zh-TW')

export function usePresenterText() {
  const locale = useContext(PresenterLocaleContext)
  return (key: PresenterMessageKey, values?: Record<string, string | number>) =>
    presenterText(locale, key, values)
}

export function usePresenterLocale() {
  return useContext(PresenterLocaleContext)
}
