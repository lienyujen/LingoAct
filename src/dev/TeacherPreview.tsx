import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { PresenterControlPanel } from '../components/PresenterControlPanel'
import { QRCodePanel } from '../components/QRCodePanel'
import { LessonPlan } from '../components/LessonPlan'
import { SentenceWallModal } from '../components/SentenceWallModal'
import { PresenterNewPage } from '../routes/PresenterNewPage'
import { ParticipantFlashcards } from '../components/ParticipantFlashcards'
import { ListeningStudioModal } from '../components/ListeningStudioModal'
import { TeachingCyclePanel } from '../components/TeachingCyclePanel'
import { DragAnswers } from '../components/DragAnswers'
import type { ParticipantQuizData } from '../types'
import type { Session, Question } from '../types'
import '../index.css'

// Component preview only. It never creates a class or submits student work.
const session: Session = {
  id: 'preview', title: '介面預覽', code: 'PREVIEW', status: 'active',
  teaching_language: 'huayu', guidance_language: 'zh-TW', level_framework: 'tbcl', level_code: '2', reading_annotation: 'zhuyin',
  danmaku_enabled: false, anonymous_enabled: true, sentence_wall_enabled: false,
  current_question_id: null, short_join_url: null, exit_ticket_prompt: null, exit_ticket_prompt_en: null,
  exit_ticket_category: null, exit_ticket_response_type: null, recording_enabled: false, captions_enabled: false,
  caption_status: 'idle', caption_source_language: 'zh-tw', caption_display_language: 'zh-tw',
  caption_font_size: 32, caption_font_bold: false, caption_position: 'bottom', caption_started_at: null,
  interpretation_enabled: false, interpretation_audio_enabled: false, interpretation_languages: [],
  created_at: '', ended_at: null,
}

const flashcard: ParticipantQuizData = {
  quiz: { id: 'preview', session_id: 'preview', question_id: 'preview', title: '字卡', direction: '', requested_count: 2, requested_type: 'flashcard', graded: true, coaching: false, total_points: 100, created_at: '' },
  items: [{ id: 'word', quiz_id: 'preview', position: 1, type: 'multiple_choice', prompt_text: '活動', options: ['買東西要給的錢', '在學校上課的名字', '大家一起做的事情'], pair_prompts: [], option_images: [], option_readings: [], prompt_is_word: true, prompt_reading: 'huó dòng', points: 100, translations: {}, created_at: '' }],
  attempt: null, answers: [],
}

const practiceQuestion: Question = {
  id: 'preview', session_id: 'preview', screenshot_id: null, listening_clip_id: null, replay_limit: null,
  type: 'short_answer', status: 'active', title: '造句寫作牆', prompt_text: '說明自己的選擇。',
  options: [], translations: {}, allow_multiple: false, correct_answer: null, correct_answers: [],
  started_at: null, stopped_at: null, created_at: '',
}

export function Preview() {
  const [view, setView] = useState('開始活動')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [compact, setCompact] = useState(false)
  const action = () => setNotice('介面預覽：此操作在桌面版中使用。')
  if (location.hash === '#interactions') return <InteractionPreview />
  if (location.hash === '#teaching-cycle') return <main style={{ maxWidth: 420, margin: '20px auto' }}>
    <TeachingCyclePanel question={practiceQuestion} sessionId="preview" presenterToken="preview" active participants={['小明', '莉莉', '小華', '美玲'].map((name, i) => ({
      id: String(i), session_id: 'preview', name, device_id: String(i), joined_at: '', last_seen_at: '',
    }))} onDispatched={action} />
  </main>
  if (location.hash === '#new') return <HashRouter><PresenterNewPage /></HashRouter>
  if (location.hash === '#flashcard') return <main className="participant-page"><ParticipantFlashcards active data={flashcard} locale="zh-TW" onTry={async () => ({ correct: true, correctAnswer: null })} /></main>
  if (location.hash === '#flashcard-review') return <main className="participant-page"><ParticipantFlashcards active={false} data={{ ...flashcard, reviewAnswers: { word: '大家一起做的事情' } }} locale="zh-TW" onTry={async () => ({ correct: true, correctAnswer: null })} /></main>
  if (location.hash === '#listening') return <ListeningStudioModal
    initialTranscript={'小明：週末要不要一起去圖書館？\n小華：好啊，我想借一本中文故事書。'}
    open
    sessionId="preview"
    presenterToken="preview"
    teachingLanguage="zh-tw"
    teachingTrack="huayu"
    levelFramework="tbcl"
    levelCode="2"
    readingAnnotation="zhuyin"
    onClose={() => undefined}
    onDispatched={() => undefined}
  />
  return <div style={{ maxWidth: 420, margin: '0 auto' }} className="desktop-shell">
    <main className={`presenter-page${compact ? ' controls-open' : ''}`}>
      <aside className="qr-floating"><QRCodePanel joinUrl="https://example.org/preview" qrInteractionProps={{ onDoubleClick: () => setCompact(!compact) }} /></aside>
      {compact && <aside className="presenter-controls-overlay teacher-workspace">
        <nav className="workspace-navigation">{['開始活動', '目前活動', '課堂紀錄'].map((label) => <button key={label} type="button" aria-current={view === label ? 'page' : undefined} onClick={() => setView(label)}>{label}</button>)}</nav>
        {view === '開始活動' ? <>
          <PresenterControlPanel session={session} onlineCount={25} busy={false} buzzerActive={false}
            onToggleDanmaku={action} onToggleAnonymous={action} onCaptureScreen={action} onCaptureFlashcards={action} onCaptureWriting={action} onOpenPicture={action} onOpenPictureWriting={action}
            onDrawLottery={action} onStartBuzzer={action} onOpenListeningStudio={action} onOpenSentenceWall={() => { setPrompt(''); setOpen(true) }} onOpenPhotoTask={action}
            onOpenTextDispatch={action} onOpenFileTransfer={action} onOpenRoster={action} onOpenWordCloud={action} onOpenSettings={action}
            onToggleRecording={action} onToggleCaptionVisibility={action} onGenerateExitTicket={action} onEndClass={action} />
          <div className="panel"><LessonPlan courseName="介面預覽" onStart={(item) => { if (item.kind === 'sentence') { setPrompt(item.prompt); setOpen(true) } else action() }} /></div>
        </> : <p className="panel muted">{view === '目前活動' ? '還沒有活動。選一個練習，讓學生開始。' : '完成的活動會留在這裡，方便回看學生的表達。'}</p>}
        {notice && <p role="status">{notice}</p>}
      </aside>}
      <SentenceWallModal open={open} initialPrompt={prompt} busy={false} error="" onCancel={() => setOpen(false)} onOpen={() => { setOpen(false); setNotice('預覽完成，沒有派送題目。') }} />
    </main>
  </div>
}

function InteractionPreview() {
  const [mode, setMode] = useState<'ordering' | 'sentence' | 'matching'>('matching')
  const [values, setValues] = useState<string[]>([])
  const [revision, setRevision] = useState(0)
  const options = ['早上', '中午', '晚上']
  return <main className="participant-page"><section className="panel">
    <h2>排序與配對操作預覽</h2>
    <nav>{(['matching', 'sentence', 'ordering'] as const).map(value => <button key={value} onClick={() => { setMode(value); setValues(value === 'ordering' ? options : []) }}>{value}</button>)}</nav>
    <DragAnswers mode={mode} options={[...options]} prompts={['早餐', '午餐', '晚餐']} values={values} locale="zh-TW" onChange={setValues} />
    <button onClick={() => setRevision(revision + 1)}>模擬其他學生更新 {revision}</button>
    <output>{JSON.stringify(values)}</output>
  </section></main>
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
