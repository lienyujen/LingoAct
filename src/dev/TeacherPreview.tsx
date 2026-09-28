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
import { ListeningPlayer } from '../components/ListeningPlayer'
import { ParticipantQuestionHistory } from '../components/ParticipantQuestionHistory'
import { ParticipantQuestionView } from '../components/ParticipantQuestionView'
import { Coffee } from '@phosphor-icons/react'
import { ExitTicketForm } from '../components/ExitTicketForm'
import { participantText } from '../lib/participantI18n'
import { QuestionResult } from '../components/QuestionResult'
import type { FileResponse } from '../types'
import { ReadingPassageView } from '../components/ReadingPassageView'
import { ReadingModal } from '../components/ReadingModal'
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
  // With a capture, so the tick that decides whether it goes out can be tried.
  if (location.hash === '#question-types-shot') return <QuestionEditor open previewUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='80'%3E%3Crect width='200' height='80' fill='%23ddd'/%3E%3C/svg%3E" onCancel={action} onCreate={action} onPictureTalk={action} onGenerateInteraction={async () => ({})} />
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
  if (location.hash === '#reading-send') return <ReadingModal open sessionId="preview" presenterToken="preview" onClose={action} onDispatched={action} />
  // The same panel reached by capturing rather than pasting.
  if (location.hash === '#reading-shot') return <ReadingModal capture={sampleCapture()} open sessionId="preview" presenterToken="preview" onClose={action} onDispatched={action} />
  if (location.hash === '#reading-ktv') return <ReadingKaraokePreview />
  // What a student has left after the class moves on. The passage and its
  // vocabulary have to survive into history, because reviewing them is the
  // whole point of a reading.
  if (location.hash === '#history') return <HistoryPreview />
  // 朗讀 and 聽力 showing the transcript with the same 正詞法 pinyin the
  // passage reader uses, the switch that puts it away, and a play button that
  // pauses.
  // 朗讀: the sentence with its 正詞法 reading, the switch that hides it, and
  // the model recording underneath.
  if (location.hash === '#read-aloud') return <main className="participant-page"><ParticipantQuestionView
    question={{ ...practiceQuestion, id: 'ra', type: 'pronunciation' as const, status: 'active' as const,
      title: '朗讀發音', prompt_text: '星期六早上，我跟小明去了學校附近的市場。',
      reading_words: readingSample.words.slice(0, readingSample.words.findIndex((word) => word.text.trim() === '')) }}
    answer={null} audioBusy={false} audioResponse={null} locale="zh-TW"
    onSubmit={() => {}} onSubmitAudio={async () => {}} onDiscardAudio={async () => {}}
  /></main>
  if (location.hash === '#listening-pinyin') return <main className="participant-page"><ListeningPlayer
    clip={audiblePreviewClip} locale="zh-TW" questionId="q" replayLimit={null} variant="listening"
    prompt={readingSample.body} readingWords={readingSample.words} karaokeCues={previewCues}
  /></main>
  if (location.hash === '#reading-locked') return <main className="participant-page"><ReadingPassageView locale="zh-TW" locked passage={readingSample} /></main>
  if (location.hash === '#reading') return <main className="participant-page"><ReadingPassageView imageUrl="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='120'%3E%3Crect width='320' height='120' fill='%23ddd'/%3E%3C/svg%3E" locale="en" passage={readingSample} player={previewPlayer()} /></main>
  if (location.hash === '#cloud') return <CloudPreview />
  if (location.hash === '#setup') return <BackendSetup />
  // 授課錦囊 on its own, because reaching it in the full shell means
  // double-clicking a QR code to open the workspace first.
  if (location.hash === '#plan') return <main style={{ maxWidth: 480, margin: '20px auto' }}><div className="panel"><LessonPlan courseName="介面預覽" onStart={(item) => { document.title = 'opened:' + item.kind }} /></div></main>
  // 電寫題 results: the summary row, the thumbnail that opens a page properly,
  // and the viewer the browser build falls back to.
  if (location.hash === '#drawing') return <main style={{ maxWidth: 460, margin: '20px auto' }}><QuestionResult
    anonymousEnabled={false} question={drawingQuestion} answers={[]} audioResponses={[]} fileResponses={drawingFiles}
    fileBusyId="" gradeProgress={null} analysis={null} analysisBusy={false} analysisError=""
    busy={false} isCurrentQuestion onlineCount={2}
    onAnalyze={action} onAnalyzeFile={action} onDrawUnanswered={action}
    onSetCorrectAnswer={action} onStopQuestion={asyncAction} onResumeQuestion={asyncAction}
  /></main>
  // The star rating, which rendered as an empty box, and the 下課中 card.
  if (location.hash === '#exit-ticket') return <main className="participant-page"><ExitTicketForm busy={false} category="lesson_summary" locale="zh-TW" prompt="請寫一個今天學到的新詞。" ticket={null} onSubmit={action} /></main>
  if (location.hash === '#break') return <main className="participant-page"><section className="panel participant-break" aria-live="polite">
    <span className="participant-break-icon"><Coffee size={26} /></span>
    <div><h2>{participantText('zh-TW', 'onBreak')}</h2><p>{participantText('zh-TW', 'teacherAway')}</p></div>
  </section></main>
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
            onOpenTextDispatch={action} onOpenFileTransfer={action} onOpenReading={action} onOpenRoster={action} onOpenWordCloud={action} onOpenSettings={action}
            onToggleRecording={action} onToggleCaptionVisibility={action} onGenerateExitTicket={action} onLowerHands={action} onEndClass={action} />
          <div className="panel"><LessonPlan courseName="介面預覽" onStart={(item) => { if (item.kind === 'sentenceWall') { setPrompt(item.prompt); setOpen(true) } else setNotice(`預覽：開啟「${item.kind}」`) }} /></div>
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
  // Word-level 正詞法 pinyin, so the preview shows what the generator now
  // produces: 小明 capitalised as a name, 很多 joined, 的 on its own.
  words: [{"text":"星期六","pinyin":"xīngqīliù"},{"text":"早上","pinyin":"zǎoshang"},{"text":"，","pinyin":""},{"text":"我","pinyin":"wǒ"},{"text":"跟","pinyin":"gēn"},{"text":"小明","pinyin":"Xiǎo Míng"},{"text":"去","pinyin":"qù"},{"text":"了","pinyin":"le"},{"text":"學校","pinyin":"xuéxiào"},{"text":"附近","pinyin":"fùjìn"},{"text":"的","pinyin":"de"},{"text":"市場","pinyin":"shìchǎng"},{"text":"。","pinyin":""},{"text":"\n\n","pinyin":""},{"text":"市場","pinyin":"shìchǎng"},{"text":"裡","pinyin":"lǐ"},{"text":"有","pinyin":"yǒu"},{"text":"很多","pinyin":"hěnduō"},{"text":"人","pinyin":"rén"},{"text":"。","pinyin":""},{"text":"雖然","pinyin":"suīrán"},{"text":"人","pinyin":"rén"},{"text":"很","pinyin":"hěn"},{"text":"多","pinyin":"duō"},{"text":"，","pinyin":""},{"text":"但是","pinyin":"dànshì"},{"text":"大家","pinyin":"dàjiā"},{"text":"都","pinyin":"dōu"},{"text":"很","pinyin":"hěn"},{"text":"有","pinyin":"yǒu"},{"text":"禮貌","pinyin":"lǐmào"},{"text":"。","pinyin":""},{"text":"我們","pinyin":"wǒmen"},{"text":"買","pinyin":"mǎi"},{"text":"了","pinyin":"le"},{"text":"水果","pinyin":"shuǐguǒ"},{"text":"和","pinyin":"hàn"},{"text":"青菜","pinyin":"qīngcài"},{"text":"，","pinyin":""},{"text":"也","pinyin":"yě"},{"text":"喝","pinyin":"hē"},{"text":"了","pinyin":"le"},{"text":"一","pinyin":"yì"},{"text":"杯","pinyin":"bēi"},{"text":"豆漿","pinyin":"dòujiāng"},{"text":"。","pinyin":""},{"text":"\n\n","pinyin":""},{"text":"老闆","pinyin":"lǎobǎn"},{"text":"說","pinyin":"shuō"},{"text":"，","pinyin":""},{"text":"這個","pinyin":"zhège"},{"text":"市場","pinyin":"shìchǎng"},{"text":"已經","pinyin":"yǐjīng"},{"text":"開","pinyin":"kāi"},{"text":"了","pinyin":"le"},{"text":"三十","pinyin":"sānshí"},{"text":"年","pinyin":"nián"},{"text":"了","pinyin":"le"},{"text":"。","pinyin":""},{"text":"因為","pinyin":"yīnwèi"},{"text":"東西","pinyin":"dōngxi"},{"text":"新鮮","pinyin":"xīnxiān"},{"text":"，","pinyin":""},{"text":"所以","pinyin":"suǒyǐ"},{"text":"附近","pinyin":"fùjìn"},{"text":"的","pinyin":"de"},{"text":"人","pinyin":"rén"},{"text":"都","pinyin":"dōu"},{"text":"來","pinyin":"lái"},{"text":"這裡","pinyin":"zhèlǐ"},{"text":"買菜","pinyin":"mǎicài"},{"text":"。","pinyin":""}],
  // 拼音, so the 標音 switch has something to show. 注音 cannot be previewed:
  // its readings live in a font subset cut on the teacher's machine.
  annotation: 'pinyin' as const,
  annotation_text: "[\"xīng\",\"qí\",\"liù\",\"zǎo\",\"shàng\",\"\",\"wǒ\",\"gēn\",\"xiǎo\",\"míng\",\"qù\",\"le\",\"xué\",\"xiào\",\"fù\",\"jìn\",\"de\",\"shì\",\"chǎng\",\"\",\"\",\"\",\"shì\",\"chǎng\",\"lǐ\",\"yǒu\",\"hěn\",\"duō\",\"rén\",\"\",\"suī\",\"rán\",\"rén\",\"hěn\",\"duō\",\"\",\"dàn\",\"shì\",\"dà\",\"jiā\",\"dōu\",\"hěn\",\"yǒu\",\"lǐ\",\"mào\",\"\",\"wǒ\",\"men\",\"mǎi\",\"le\",\"shuǐ\",\"guǒ\",\"hàn\",\"qīng\",\"cài\",\"\",\"yě\",\"hē\",\"le\",\"yì\",\"bēi\",\"dòu\",\"jiāng\",\"\",\"\",\"\",\"lǎo\",\"bǎn\",\"shuō\",\"\",\"zhè\",\"ge\",\"shì\",\"chǎng\",\"yǐ\",\"jīng\",\"kāi\",\"le\",\"sān\",\"shí\",\"nián\",\"le\",\"\",\"yīn\",\"wèi\",\"dōng\",\"xī\",\"xīn\",\"xiān\",\"\",\"suǒ\",\"yǐ\",\"fù\",\"jìn\",\"de\",\"rén\",\"dōu\",\"lái\",\"zhè\",\"lǐ\",\"mǎi\",\"cài\",\"\"]",
  title: '週末的市場',
  body: "星期六早上，我跟小明去了學校附近的市場。\n\n市場裡有很多人。雖然人很多，但是大家都很有禮貌。我們買了水果和青菜，也喝了一杯豆漿。\n\n老闆說，這個市場已經開了三十年了。因為東西新鮮，所以附近的人都來這裡買菜。",
  vocabulary: [
    { word: '禮貌', level: 4, pos: '名詞', gloss: { en: 'manners; politeness', zh_tw: '待人的態度很好', es: 'modales; cortesía' } },
    { word: '豆漿', level: 5, pos: '名詞', gloss: { en: 'soy milk', zh_tw: '黃豆做的飲料', es: 'leche de soja' } },
    { word: '新鮮', level: 5, pos: '形容詞', gloss: { en: 'fresh', zh_tw: '剛採收、還沒放久', es: 'fresco' } },
    { word: '小明', level: 0, pos: '名詞', gloss: { en: 'a personal name', zh_tw: '人名', es: 'un nombre propio' } },
  ],
  grammar: [
    { point: '雖然…但是', level: 3, span: '雖然人很多，但是大家都很有禮貌', example: '雖然下雨，但是我還是去了。',
      note: { en: 'Sets up a contrast: the first part is true, and the second part happens anyway.', zh_tw: '前面說一件事，後面說相反的結果。', es: 'Marca un contraste: lo primero es cierto y aun así ocurre lo segundo.' } },
    { point: '因為…所以', level: 3, span: '因為東西新鮮，所以附近的人都來這裡買菜', example: '因為天氣好，所以我們去公園。',
      note: { en: 'Reason first, result second.', zh_tw: '先講原因，再講結果。', es: 'Primero la razón, después el resultado.' } },
  ],
}

// The audio half of the passage row. Nothing is actually played; what is being
// looked at is whether two buttons sit in line with the switches.
const previewClip = {
  id: 'c', session_id: 'preview', kind: 'passage' as const, language: 'zh-tw',
  duration_ms: 4000, public_url: '', created_at: '',
}

// Twenty seconds of silence, built here rather than fetched, so the player
// previews can actually be played — which is the only way to see whether the
// button pauses and resumes rather than merely whether it is drawn.
function silentWav(seconds: number) {
  const rate = 8000
  const samples = rate * seconds
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, text: string) => [...text].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVEfmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  ascii(36, 'data'); view.setUint32(40, samples * 2, true)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:audio/wav;base64,${btoa(binary)}`
}

const audiblePreviewClip = { ...previewClip, duration_ms: 20000, public_url: silentWav(20) }

function previewPlayer() {
  return <ListeningPlayer clip={previewClip} locale="zh-TW" questionId="q" replayLimit={null} variant="inline" />
}

// The student page holds the cue between the two of them, so the preview has to
// as well — otherwise what gets looked at is a hard-coded highlight rather than
// the player driving the passage.
function ReadingKaraokePreview() {
  const [cue, setCue] = useState(-1)
  return (
    <main className="participant-page">
      <ReadingPassageView
        activeCue={cue}
        cues={previewCues}
        locale="zh-TW"
        passage={readingSample}
        player={<ListeningPlayer clip={previewClip} locale="zh-TW" questionId="q" replayLimit={null} variant="inline" karaokeCues={previewCues} onActiveCue={setCue} />}
      />
    </main>
  )
}

const previewCues = [
  { start_index: 0, end_index: 5, start_ms: 0, end_ms: 900 },
  { start_index: 6, end_index: 12, start_ms: 900, end_ms: 1800 },
]

// Two pages of handwriting, so the arrows in the viewer have somewhere to go.
const asyncAction = async () => undefined

const drawingPage = (label: string) => `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="300"><rect width="420" height="300" fill="#fff"/><text x="24" y="150" font-size="28" fill="#7b2d5e">${label}</text></svg>`,
)}`

const drawingQuestion = ({
  id: 'q', session_id: 's', type: 'drawing' as const, status: 'active' as const,
  title: '電寫題', prompt_text: '把「雖然…但是…」寫成一個句子。',
  options: [], correct_answer: null, correct_answers: [], allow_multiple: false,
  translations: {}, created_at: '', stopped_at: null, screenshot_id: null,
} as unknown) as Question

const drawingFiles = ([
  {
    id: 'f1', session_id: 's', question_id: 'q', participant_id: 'p1', participant_name: '王小明',
    name: 'drawing.png', mime_type: 'image/png', file_url: drawingPage('王小明'), size_bytes: 100,
    analysis_status: 'pending' as const, analysis_json: null, error_message: null, created_at: '',
  },
  {
    id: 'f2', session_id: 's', question_id: 'q', participant_id: 'p2', participant_name: '李小華',
    name: 'drawing.png', mime_type: 'image/png', file_url: drawingPage('李小華'), size_bytes: 100,
    analysis_status: 'success' as const, error_message: null, created_at: '',
    analysis_json: {
      verdict: 'correct', score: 90, summary_zh_tw: '句子完整，連接詞用得正確。',
      strengths_zh_tw: ['「雖然…但是…」前後對比清楚'], improvements_zh_tw: ['第二句可以再具體一點'],
    },
  },
] as unknown) as FileResponse[]

// A tiny PNG standing in for a screen grab, so the capture half of the reading
// panel can be looked at without a screen to grab.
function sampleCapture() {
  const png = atob('iVBORw0KGgoAAAANSUhEUgAAAGQAAAA8CAYAAAA1jsstAAAAQklEQVR4nO3PMQEAAAjAILV/Z2vAxwMJ0CVJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkiRJkv5wAeAAAdqLh4sAAAAASUVORK5CYII=')
  const bytes = new Uint8Array(png.length)
  for (let i = 0; i < png.length; i += 1) bytes[i] = png.charCodeAt(i)
  return new File([bytes], 'capture.png', { type: 'image/png' })
}

// A finished reading in the review list: the article, the new words and the
// grammar notes, all unlocked because the quiz is over.
function HistoryPreview() {
  const question = {
    ...practiceQuestion,
    id: 'q', type: 'reading' as const, status: 'stopped' as const,
    title: '閱讀', prompt_text: '週末的市場', screenshot_id: null,
  }
  return (
    <main className="participant-page">
      <ParticipantQuestionHistory
        analyses={{}}
        answers={[]}
        audioResponses={{}}
        defaultExpandAll
        listeningClips={{}}
        loadingQuestionIds={new Set()}
        locale="zh-TW"
        passages={{ q: readingSample }}
        questions={[question]}
        quizData={{}}
        screenshots={{}}
        onLoadDetails={async () => {}}
      />
    </main>
  )
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
