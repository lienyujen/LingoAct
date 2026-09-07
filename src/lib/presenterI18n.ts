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
