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
import { QuestionEditor } from '../components/QuestionEditor'
import { RosterManager } from '../components/RosterManager'
import { BackendSetup } from '../components/BackendSetup'
import { WordCloudCanvas } from '../components/WordCloudCanvas'
import { ReadingPassageView } from '../components/ReadingPassageView'
import { DanmakuTimeline } from '../components/DanmakuTimeline'
import type { ParticipantQuizData } from '../types'
import type { Session, Question } from '../types'
import { APP_PROFILE } from '../lib/appProfiles'
import { resolveTrack } from '../lib/teachingTracks'
import { PresenterLocaleContext, presenterLocaleFor } from '../lib/presenterI18n'
import '../index.css'

// Component preview only. It never creates a class or submits student work.
const session: Session = {
  id: 'preview', title: '介面預覽', code: 'PREVIEW', status: 'active',
  teaching_language: APP_PROFILE.defaultTrack, guidance_language: 'zh-TW', level_framework: resolveTrack(APP_PROFILE.defaultTrack).frameworks[0], level_code: null, reading_annotation: resolveTrack(APP_PROFILE.defaultTrack).annotation,
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
  board_formats: [], board_max_posts: null, board_revealed_at: null, share_screenshot: true,
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
  if (location.hash === '#qr-narrow') return <div className="desktop-shell" style={{ width: 230 }}><aside className="qr-floating"><QRCodePanel joinUrl="https://example.org/preview" onMinimize={action} onClose={action} /></aside></div>
  if (location.hash === '#question-types') return <QuestionEditor open previewUrl={null} onCancel={action} onCreate={action} onPictureTalk={action} onGenerateInteraction={async () => ({})} />
  if (location.hash === '#interactions') return <InteractionPreview />
  if (location.hash === '#teaching-cycle') return <main style={{ maxWidth: 420, margin: '20px auto' }}>
    <TeachingCyclePanel question={practiceQuestion} sessionId="preview" presenterToken="preview" active participants={['小明', '莉莉', '小華', '美玲'].map((name, i) => ({
      id: String(i), session_id: 'preview', name, device_id: String(i), joined_at: '', last_seen_at: '',
    }))} onDispatched={action} />
  </main>
  // 學員名單 only ever talks to this computer's localStorage, so the whole
  // dialog previews without a class, a token or a database behind it.
  // The first screen a new deployer ever sees, and the one place the app has
  // to explain where a Supabase project comes from.
  // The word cloud window's own layout, header and timeline and all: the page
  // is a column whose last child has to stretch, and the cloud draws nothing at
  // all if it does not.
  if (location.hash === '#reading') return <main className="participant-page"><ReadingPassageView locale="en" passage={readingSample} /></main>
  if (location.hash === '#cloud') return <CloudPreview />
  if (location.hash === '#setup') return <BackendSetup />
  if (location.hash === '#roster') return <RosterManager open sessionId="preview" onChanged={action} onClose={action} />
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
          <PresenterControlPanel session={session} onlineCount={25} raisedCount={2} busy={false} buzzerActive={false}
            onToggleDanmaku={action} onToggleAnonymous={action} onCaptureScreen={action} onCaptureFlashcards={action} onCaptureWriting={action} onOpenPicture={action} onOpenPictureWriting={action}
            onCaptureOrdering={action} onCaptureMatching={action} onCapturePronunciation={action} onCaptureOral={action} onCaptureDrawing={action}
            onDrawLottery={action} onStartBuzzer={action} onOpenListeningStudio={action} onOpenSentenceWall={() => { setPrompt(''); setOpen(true) }} onOpenPhotoTask={action}
            onOpenTextDispatch={action} onOpenFileTransfer={action} onOpenRoster={action} onOpenWordCloud={action} onOpenSettings={action}
            onToggleRecording={action} onToggleCaptionVisibility={action} onGenerateExitTicket={action} onLowerHands={action} onEndClass={action} />
          <div className="panel"><LessonPlan courseName="介面預覽" onStart={(item) => { if (item.kind === 'sentence') { setPrompt(item.prompt); setOpen(true) } else action() }} /></div>
        </> : <p className="panel muted">{view === '目前活動' ? '還沒有活動。選一個練習，讓學生開始。' : '完成的活動會留在這裡，方便回看學生的表達。'}</p>}
        {notice && <p role="status">{notice}</p>}
      </aside>}
      <SentenceWallModal open={open} initialPrompt={prompt} busy={false} error="" onCancel={() => setOpen(false)} onOpen={() => { setOpen(false); setNotice('預覽完成，沒有派送題目。') }} />
    </main>
  </div>
}

// A passage of the shape the generator returns, so the marking, the overlap
// rule and the note can be looked at without a class running.
const readingSample = {
  id: 'p', session_id: 'preview', question_id: 'q', created_at: '',
  source: 'ai' as const, listening_clip_id: null,
  title: '週末的市場',
  body: "星期六早上，我跟朋友去了學校附近的市場。\n\n市場裡有很多人。雖然人很多，但是大家都很有禮貌。我們買了水果和青菜，也喝了一杯豆漿。\n\n老闆說，這個市場已經開了三十年了。因為東西新鮮，所以附近的人都來這裡買菜。",
  vocabulary: [
    { word: '禮貌', level: 4, pos: '名詞', gloss: { en: 'manners; politeness', zh_tw: '待人的態度很好', es: 'modales; cortesía' } },
    { word: '豆漿', level: 5, pos: '名詞', gloss: { en: 'soy milk', zh_tw: '黃豆做的飲料', es: 'leche de soja' } },
    { word: '新鮮', level: 4, pos: '形容詞', gloss: { en: 'fresh', zh_tw: '剛採收、還沒放久', es: 'fresco' } },
  ],
  grammar: [
    { point: '雖然…但是', level: 3, span: '雖然人很多，但是大家都很有禮貌', example: '雖然下雨，但是我還是去了。',
      note: { en: 'Sets up a contrast: the first part is true, and the second part happens anyway.', zh_tw: '前面說一件事，後面說相反的結果。', es: 'Marca un contraste: lo primero es cierto y aun así ocurre lo segundo.' } },
    { point: '因為…所以', level: 3, span: '因為東西新鮮，所以附近的人都來這裡買菜', example: '因為天氣好，所以我們去公園。',
      note: { en: 'Reason first, result second.', zh_tw: '先講原因，再講結果。', es: 'Primero la razón, después el resultado.' } },
  ],
}

function CloudPreview() {
  const base = Date.now() - 20 * 60_000
  const sentences = [
    '老師這題我聽不懂', '剛剛的發音可以再念一次嗎', '我覺得第二個答案比較合理',
    '請問這個字的注音是什麼', '聲調好難分辨', '我選了第三個',
    '這個句子的語順怎麼排', '剛剛那張圖看不清楚', '發音練習很有趣',
  ]
  const messages = sentences.flatMap((content, index) => (
    Array.from({ length: 1 + (index % 3) }, (_, copy) => ({
      id: `m${index}-${copy}`,
      session_id: 'preview',
      participant_id: null,
      display_name: null,
      content,
      created_at: new Date(base + index * 90_000 + copy * 4_000).toISOString(),
    }))
  )) as unknown as import('../types').Message[]
  const times = messages.map((m) => new Date(m.created_at).getTime()).sort((a, b) => a - b)
  const bounds = { start: times[0], end: Date.now() + 30_000 }
  const [selection, setSelection] = useState({ from: bounds.start, to: bounds.end })
  return (
    <main className="word-cloud-page">
      <header className="word-cloud-header">
        <div>
          <p>文字雲</p>
          <h1>介面預覽</h1>
        </div>
        <div className="word-cloud-tools"><span>{messages.length} 則</span></div>
      </header>
      <DanmakuTimeline
        selection={selection}
        sessionEnd={bounds.end}
        sessionStart={bounds.start}
        times={times}
        onChange={setSelection}
      />
      <WordCloudCanvas customTerms={[]} messages={messages.filter((m) => {
        const at = new Date(m.created_at).getTime()
        return at >= selection.from && at <= selection.to
      })} />
    </main>
  )
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

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(
  <PresenterLocaleContext.Provider value={presenterLocaleFor(APP_PROFILE.defaultTrack)}>
    <Preview />
  </PresenterLocaleContext.Provider>,
)
