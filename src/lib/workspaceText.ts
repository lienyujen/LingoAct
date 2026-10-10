import { usePresenterLocale } from './presenterI18n'

const zh = {
  activities: '開始活動', current: '目前活動', history: '課堂紀錄',
  choose: '想讓學生練習什麼？', listen: '聽', speak: '說', read: '讀', write: '寫',
  tools: '課堂工具', wrap: '收尾與回顧',
  orDispatch: '或者：', fromImage: '用一張圖片', noBackdrop: '不用底圖',
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
  activities: 'Activities', current: 'Current', history: 'History',
  choose: 'Practice skills', listen: 'Listening', speak: 'Speaking', read: 'Reading', write: 'Writing',
  tools: 'Class tools', wrap: 'Wrap-up',
  orDispatch: 'Or:', fromImage: 'Use an image', noBackdrop: 'Use a blank canvas',
  listenHint: 'Listen, practice aloud, and check understanding',
  speakHint: 'Build confidence, from reading aloud to speaking independently',
  readHint: 'Understand vocabulary, sentences, and text structure',
  writeHint: 'From one sentence to a whole paragraph',
  currentEmpty: 'Choose a practice activity to get started.', historyEmpty: 'Earlier activities and student responses will appear here.',
  openControls: 'Open teaching panel', hideControls: 'Collapse teaching panel', showJoin: 'Show join QR code',
  next: 'Next activity', timing: 'Time limits (optional)', source: 'Choose an activity',
  responses: 'View responses', classroom: 'Classroom',
}
const cn: Record<keyof typeof zh, string> = {
  activities: '开始活动', current: '当前活动', history: '课堂记录',
  choose: '想让学生练习什么？', listen: '听', speak: '说', read: '读', write: '写',
  tools: '课堂工具', wrap: '总结与回顾', orDispatch: '或者：', fromImage: '使用图片', noBackdrop: '使用空白画布',
  listenHint: '听音频、跟读，再检查是否听懂', speakHint: '从跟读到独立表达',
  readHint: '理解词汇、句子和文章结构', writeHint: '从写一句话到写一段话',
  currentEmpty: '还没有活动。请选择一项练习，让学生开始。', historyEmpty: '已完成的活动保存在这里，方便回顾学生的回答。',
  openControls: '打开教学面板', hideControls: '收起教学面板', showJoin: '显示加入课堂的二维码',
  next: '开始下一个活动', timing: '时间设置（选填）', source: '想用这份材料练习什么？', responses: '查看回答', classroom: '教室',
}

export function useWorkspaceText() {
  const locale = usePresenterLocale()
  return workspaceText(locale)
}

export function workspaceText(locale: string) { return locale === 'zh-CN' ? cn : locale === 'zh-TW' ? zh : en }
