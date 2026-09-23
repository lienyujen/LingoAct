import { usePresenterLocale } from './presenterI18n'

const zh = {
  activities: '開始活動', current: '目前活動', history: '課堂紀錄',
  choose: '想讓學生練習什麼？', listen: '聽', speak: '說', read: '讀', write: '寫',
  tools: '課堂工具', wrap: '收尾與回顧',
  listenHint: '聽音訊、跟讀，再確認聽懂了',
  speakHint: '從照著念，到自己說得出來',
  readHint: '讀懂詞彙、句子，和它們的順序',
  writeHint: '從寫出一句話，到寫成一段話',
  currentEmpty: '還沒有活動。選一個練習，讓學生開始。',
  historyEmpty: '完成的活動會留在這裡，方便回看學生的表達。',
  openControls: '開啟教學面板', hideControls: '收合教學面板',
  showJoin: '顯示加入 QR Code', next: '開始下一個活動',
  timing: '時間設定（選填）', source: '這份教材要怎麼練習？',
  responses: '查看回答', classroom: '教室',
} as const
const en: Record<keyof typeof zh, string> = {
  activities: 'Start activity', current: 'Current activity', history: 'Class record',
  choose: 'What will students practise?', listen: 'Listen', speak: 'Speak', read: 'Read', write: 'Write',
  tools: 'Class tools', wrap: 'Wrap up',
  listenHint: 'Listen, practise aloud, and check it was understood',
  speakHint: 'From reading aloud to speaking for themselves',
  readHint: 'Words, sentences, and the order they belong in',
  writeHint: 'From one sentence to a whole paragraph',
  currentEmpty: 'Choose a practice activity to get started.', historyEmpty: 'Earlier activities and student responses will appear here.',
  openControls: 'Open teaching panel', hideControls: 'Collapse teaching panel', showJoin: 'Show join QR code',
  next: 'Start next activity', timing: 'Timing (optional)', source: 'How should students practise this material?',
  responses: 'View responses', classroom: 'Classroom',
}

export function useWorkspaceText() {
  const locale = usePresenterLocale()
  return workspaceText(locale)
}

export function workspaceText(locale: string) { return locale === 'zh-TW' ? zh : en }
