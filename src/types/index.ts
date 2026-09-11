// AI-generated translations of stored content, keyed by content locale — 'en',
// 'ja', 'zh_tw'. It was a single optional 'en' field while English was the only
// language a student could read in; the key is now whichever guidance language
// was asked for, and an absent one means the original text is shown.
export type Translated<T> = Record<string, T | undefined>

export type Session = {
  id: string
  title: string
  code: string
  status: 'active' | 'ended'
  danmaku_enabled: boolean
  anonymous_enabled: boolean
  // 即時造句牆: whether the class-facing overlay is currently showing the
  // sentences for the current question.
  sentence_wall_enabled: boolean
  current_question_id: string | null
  short_join_url: string | null
  // The language being taught, the language it is explained in, and how far
  // along the class is. Independent of one another: a beginners Japanese class
  // in Taiwan teaches ja, explains in zh-TW and sits at JLPT N5.
  teaching_language: string
  guidance_language: string
  level_framework: string | null
  level_code: string | null
  // 注音 or 拼音 on a read-aloud item. Fixed for 國語, chosen for 華語文, 'none'
  // for the languages where there is nothing to annotate.
  reading_annotation: string
  exit_ticket_prompt: string | null
  exit_ticket_prompt_en: string | null
  exit_ticket_prompt_translations?: Record<string, string> | null
  exit_ticket_category: ExitTicketCategory | null
  exit_ticket_response_type: ExitTicketResponseType | null
  recording_enabled: boolean
  captions_enabled: boolean
  caption_status: 'idle' | 'starting' | 'live' | 'error'
  caption_source_language: string
  caption_display_language: string
  caption_font_size: number
  caption_font_bold: boolean
  caption_position: 'top' | 'center' | 'bottom'
  caption_started_at: string | null
  interpretation_enabled: boolean
  interpretation_audio_enabled: boolean
  interpretation_languages: string[]
  created_at: string
  ended_at: string | null
}

export type CaptionSegment = {
  id: string
  session_id: string
  language: string
  source_language: string
  text: string
  is_translation: boolean
  started_at: string | null
  ended_at: string | null
  created_at: string
}

export type Participant = {
  id: string
  session_id: string
  name: string
  device_id: string
  joined_at: string
  last_seen_at: string
  unfocused_ms?: number
  focus_streak_ms?: number
}

export type Message = {
  id: string
  session_id: string
  participant_id: string
  participant_name: string
  content: string
  anonymous_at_display: boolean
  displayed: boolean
  created_at: string
}

export type Screenshot = {
  id: string
  session_id: string
  storage_path: string
  public_url: string
  screen_summary: Record<string, unknown> | null
  ai_status: 'pending' | 'success' | 'failed' | 'skipped'
  created_at: string
}

export type QuestionType = 'send_screen' | 'poll' | 'multiple_choice' | 'true_false' | 'short_answer' | 'pronunciation' | 'oral_response' | 'custom_quiz' | 'file_upload' | 'listening'

export type ListeningKind = 'passage' | 'dialogue' | 'scene'

export type KaraokeCue = {
  start_index: number
  end_index: number
  start_ms: number
  end_ms: number
}

// What a student is allowed to know about a clip. The transcript and the source
// screenshot are missing on purpose: the database does not grant them to the
// anon role, because between them they are the answer to the exercise.
export type ListeningClip = {
  id: string
  session_id: string
  kind: ListeningKind
  language: string
  duration_ms: number | null
  public_url: string
  created_at: string
}

// The teacher's view, assembled server-side where the transcript is readable.
export type PresenterListeningClip = ListeningClip & {
  annotation: 'none' | 'zhuyin' | 'pinyin'
  annotation_text: string | null
  font_url: string | null
  screenshot_id: string | null
  source: 'screenshot' | 'text'
  script: 'traditional' | 'simplified' | null
  transcript: string
  voices: { instruction?: string; speakers?: string[] }
}
// 'ordering' arrives with its fragments already shuffled; the correct sequence
// stays in quiz_item_keys, which the anon role cannot read.
export type QuizItemType = 'multiple_choice' | 'fill_blank' | 'short_answer' | 'ordering' | 'matching'
// 'writing' is a mode rather than an item type: 寫作教練 lays out short_answer
// fields and turns the marking off, so nothing downstream meets a new shape.
// 'writing' and 'flashcard' are modes rather than item types: 寫作教練 lays out
// short_answer fields with the marking off, and a deck is multiple_choice cards
// answered one at a time. Neither makes a new shape for anything downstream.
export type QuizRequestedType = 'random' | QuizItemType | 'writing' | 'flashcard' | 'picture_ordering' | 'picture_writing'
export type ExitTicketCategory = 'lesson_summary' | 'learning_assessment' | 'course_satisfaction' | 'student_question'
export type ExitTicketResponseType = 'text' | 'rating'

export type SharedContent = {
  id: string
  session_id: string
  body: string | null
  url: string | null
  created_at: string
}

export type LotteryPayload = {
  round: number
  winner_id: string
  winner_name: string
  candidate_count: number
  candidate_names: string[]
  candidate_ids?: string[]
  duration_ms: number
  finalized?: boolean
}

export type BuzzerPayload = {
  candidate_count: number
  candidate_ids: string[]
  prepared_at: string
  started_at?: string
  expires_at: string
  duration_ms: number
  finalized: boolean
  accepting: boolean
  cancelled?: boolean
  winner_id?: string
  winner_name?: string
  finalized_at?: string
}

export type LotterySessionEvent = {
  id: string
  session_id: string
  event_type: 'lottery' | 'lottery_result'
  payload: LotteryPayload
  created_at: string
}

export type BuzzerSessionEvent = {
  id: string
  session_id: string
  event_type: 'buzzer'
  payload: BuzzerPayload
  created_at: string
}

export type SessionEvent = LotterySessionEvent | BuzzerSessionEvent

export type Question = {
  id: string
  session_id: string
  screenshot_id: string | null
  // Always null for a listening question, and that is the point: the clip is
  // reached through listening_clip_id, which carries no image.
  listening_clip_id: string | null
  // Null means unlimited, which suits practice. A listening test that can be
  // replayed without limit is a transcription exercise.
  replay_limit: number | null
  // Set on read-aloud and audio-only items, where the words may be seen. A
  // comprehension quiz still never carries the subset or its transcript.
  reading_font_url?: string | null
  // 拼音 only: one syllable per character of prompt_text, rendered as ruby.
  // 注音 leaves this null — its reading is inside the font above.
  reading_ruby?: string[] | null
  // Audio-only listening carries these with its visible-on-request transcript.
  // The spans use character indexes in the unannotated text.
  karaoke_cues?: KaraokeCue[]
  // 單字卡 注音: the deck's font subset, cut from the characters its cards use.
  card_font_url?: string | null
  // Null on both means untimed, which is every question that came before.
  // Thinking time and answering time are separate: planning is the exercise in
  // a spoken challenge, and absent entirely from a vocabulary race.
  prepare_seconds?: number | null
  answer_seconds?: number | null
  // 拍照描述: whether an upload wants a description paired with it. False on a
  // plain 上傳作答, where a caption box would be clutter.
  wants_caption?: boolean
  type: QuestionType
  status: 'draft' | 'active' | 'stopped' | 'closed'
  title: string
  prompt_text: string | null
  options: string[]
  translations: Translated<{
    title?: string
    prompt_text?: string | null
    options?: string[]
  }>
  allow_multiple: boolean
  correct_answer: string | null
  correct_answers: string[]
  started_at: string | null
  stopped_at: string | null
  created_at: string
}

export type Answer = {
  id: string
  session_id: string
  question_id: string
  participant_id: string
  participant_name: string
  answer_value: string | null
  answer_values: string[] | null
  answer_text: string | null
  is_correct: boolean | null
  submitted_at: string
}

export type AudioAnalysis = {
  mode: 'pronunciation' | 'oral_response'
  detected_language: string
  transcript: string
  score: number
  summary: string
  relevance: string
  clarity: string
  completeness: string
  strengths: string[]
  improvements: string[]
  limitations: string[]
  translations?: Translated<Omit<AudioAnalysis, 'translations'>>
}

export type AudioResponse = {
  id: string
  session_id: string
  question_id: string
  participant_id: string
  participant_name: string
  mime_type: string
  duration_ms: number
  analysis_status: 'pending' | 'success' | 'failed'
  detected_language: string | null
  transcript: string | null
  score: number | null
  analysis_json: AudioAnalysis | null
  error_message: string | null
  submitted_at: string
  analyzed_at: string | null
  signed_url?: string | null
}

export type QuestionAnalysis = {
  question_understanding: {
    detected_question: string
    subject: string
    concepts: string[]
    suggested_correct_answer: string | null
    confidence: 'high' | 'medium' | 'low'
    reasoning: string
  }
  response_analysis: {
    response_count: number
    response_rate: number
    understanding_summary: string
    strengths: string[]
    misconceptions: string[]
    representative_patterns: string[]
  }
  teaching_recommendations: {
    immediate_actions: string[]
    explanation_points: string[]
    follow_up_questions: string[]
  }
  limitations: string[]
}

export type SessionMetrics = {
  participant_count: number
  message_count: number
  active_message_participants: number
  question_count: number
  interactive_question_count: number
  answer_count: number
  average_response_rate: number
  assessed_answer_count: number
  correct_answer_count: number
  correct_rate: number | null
  exit_ticket_count: number
  audio_response_count: number
  analyzed_audio_count: number
  average_audio_score: number | null
  // Written earlier than the fields above by older analyses, which is why
  // these are optional: a report generated before uploads existed has none.
  file_submission_count?: number
  file_count?: number
  marked_file_submission_count?: number
  average_file_score?: number | null
  duration_minutes: number
}

export type SessionAnalysis = {
  executive_summary: string
  lesson_key_points: string[]
  engagement_analysis: {
    level: 'high' | 'medium' | 'low'
    summary: string
    participation_observations: string[]
    danmaku_observations: string[]
  }
  learning_analysis: {
    overall_understanding: string
    strengths: string[]
    misconceptions: string[]
    question_findings: Array<{
      question_id: string
      detected_question: string
      result_summary: string
      evidence: string
    }>
  }
  teaching_recommendations: {
    immediate_actions: string[]
    next_lesson_actions: string[]
    follow_up_questions: string[]
  }
  limitations: string[]
  translations?: Translated<Omit<SessionAnalysis, 'translations'>>
}

export type Quiz = {
  id: string
  session_id: string
  question_id: string
  title: string
  direction: string
  requested_count: number | null
  requested_type: QuizRequestedType
  // False for 寫作教練. The results view reads this to know whether a missing
  // score means 'still marking' or 'nothing to mark'.
  graded: boolean
  // 寫作教練 only: whether students may take a draft to the coach before sending.
  coaching?: boolean
  total_points: number
  created_at: string
}

export type QuizItem = {
  id: string
  quiz_id: string
  position: number
  type: QuizItemType
  prompt_text: string
  options: string[]
  // 配對 only: the left-hand column, in the order it is shown. Empty otherwise.
  pair_prompts: string[]
  // 圖片排序 only: the picture to show for each option, in the same order. Empty
  // means the options are text, which is every other item.
  option_images: string[]
  // 單字卡 標音, one per option: the word with 注音 built into the glyphs, or the
  // 拼音 syllables to print under it. Which one, the question says — a deck
  // carrying card_font_url is 注音.
  option_readings: string[]
  // 單字卡 only: whether the WORD being learned is the prompt rather than the
  // options. It decides which side carries the 標音 and which side is the gloss
  // the student reads in their own language.
  prompt_is_word?: boolean
  prompt_reading?: string | null
  // Generated once when the teacher creates the deck; students only play the
  // stored file, including after class ends.
  audio_url?: string | null
  audio_status?: 'pending' | 'processing' | 'ready'
  points: number
  translations: Translated<{
    prompt_text?: string
    options?: string[]
    pair_prompts?: string[]
  }>
  created_at: string
}

// 'submitted' is where an ungraded attempt ends: received, with no score to
// wait for and none coming.
export type QuizAttemptStatus = 'grading' | 'graded' | 'submitted' | 'failed'

export type QuizAttempt = {
  id: string
  session_id: string
  question_id: string
  quiz_id: string
  participant_id: string
  participant_name: string
  status: QuizAttemptStatus
  total_score: number | null
  max_score: number
  feedback: { zh_tw?: string; en?: string } | null
  // 寫作教練 only: the fields joined into one article by the student, which is
  // the piece of writing the exercise exists to produce.
  composition?: string | null
  // The same article with the AI's corrections applied, and why. The page diffs
  // it against `composition` rather than trusting a diff from the model, so
  // everything shown as the student's own is exactly what they wrote.
  revision?: {
    zh_tw?: string
    notes?: Array<{ before: string; after: string; why: string }>
  } | null
  error_message: string | null
  submitted_at: string
  graded_at: string | null
}

export type QuizItemAnswer = {
  id: string
  attempt_id: string
  item_id: string
  answer_text: string | null
  answer_values: string[] | null
  score: number | null
  feedback: { zh_tw?: string; en?: string } | null
  created_at: string
}

// One round with 寫作教練: the draft the student showed and what the coach asked
// about it. Kept because 寫作歷程 is what the activity is for — a first draft and
// the question that moved it says more than the finished paragraph does.
export type CoachReply = {
  noticed: string
  questions: string[]
  fix: { point: string; why: string } | null
  ready: boolean
}

export type WritingCoachTurn = {
  id: string
  item_id: string
  // Absent on the student's own copy: they only ever read their own rounds.
  participant_id?: string
  round: number
  draft: string
  reply: CoachReply
  created_at: string
}

export type ParticipantQuizData = {
  quiz: Quiz
  items: QuizItem[]
  attempt: QuizAttempt | null
  answers: QuizItemAnswer[]
  coachTurns?: WritingCoachTurn[]
  // Answer keys are revealed only after a flashcard drill is stopped. During
  // practice this contains at most the cards this student has already learned.
  reviewAnswers?: Record<string, string>
}

// One attempt at one card. A 單字卡 deck is the only thing that produces
// several of these per item, and they are what the activity is for: which cards
// a student knew cold and which they had to come back to.
export type QuizItemTry = {
  id: string
  attempt_id: string
  item_id: string
  correct: boolean
  tried_at: string
}

export type PresenterQuizResults = ParticipantQuizData & {
  attempts: QuizAttempt[]
  answers: QuizItemAnswer[]
  tries: QuizItemTry[]
  // Every student's rounds, not just one's: 寫作歷程 is read across the class.
  coachTurns: WritingCoachTurn[]
  keys: Array<{ item_id: string; accepted_answers: string[]; rubric: string }>
  screenshot: Screenshot | null
}

export type SessionCustomQuizResults = {
  quizzes: Quiz[]
  items: QuizItem[]
  attempts: QuizAttempt[]
  answers: QuizItemAnswer[]
  keys: Array<{ item_id: string; accepted_answers: string[]; rubric: string }>
}

export type AiSummary = {
  id: string
  session_id: string
  question_id: string | null
  type: 'screen_preview' | 'short_answer_summary' | 'question_analysis' | 'exit_ticket_summary'
  input_json: Record<string, unknown>
  output_json: QuestionAnalysis | SessionAnalysis | Record<string, unknown>
  status: 'success' | 'failed'
  created_at: string
}

export type ExitTicket = {
  id: string
  session_id: string
  participant_id: string
  participant_name: string
  most_useful: string
  still_confused: string
  understanding_score: number | null
  engagement_score: number | null
  next_suggestion: string
  response_text: string | null
  rating: number | null
  submitted_at: string
}

export type SessionReportData = {
  session: Session
  participants: Participant[]
  messages: Message[]
  sharedContents: SharedContent[]
  captionSegments: CaptionSegment[]
  screenshots: Screenshot[]
  questions: Question[]
  answers: Answer[]
  audioResponses: AudioResponse[]
  fileResponses: FileResponse[]
  buzzerEvents: SessionEvent[]
  customQuizResults: SessionCustomQuizResults
  aiSummaries: AiSummary[]
  exitTickets: ExitTicket[]
}

export interface SharedFile {
  id: string
  session_id: string
  name: string
  mime_type: string
  file_size: number
  storage_path: string
  created_at: string
  file_url?: string
}

export type FileAnalysisStatus = 'pending' | 'analyzing' | 'success' | 'failed' | 'unsupported'

export type FileVerdict = 'correct' | 'partial' | 'incorrect' | 'unscored'

export interface FileAnalysis {
  // Absent on anything marked before grading existed, so both stay optional.
  verdict?: FileVerdict
  score?: number | null
  summary_zh_tw: string
  summary_en: string
  strengths_zh_tw: string[]
  strengths_en: string[]
  improvements_zh_tw: string[]
  improvements_en: string[]
}

export interface FileResponse {
  id: string
  session_id: string
  question_id: string
  participant_id: string
  participant_name: string
  name: string
  mime_type: string
  file_size: number
  storage_path: string
  analysis_status: FileAnalysisStatus
  analysis_json: FileAnalysis | null
  // 拍照描述: the description paired with this picture. One of the two, or
  // neither — the student chooses whether to write it or say it.
  caption: string | null
  caption_audio_duration_ms: number | null
  // Signed by the server; the clip's own path never leaves it.
  caption_audio_url?: string | null
  error_message: string | null
  submitted_at: string
  analyzed_at: string | null
  file_url?: string
}
