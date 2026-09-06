create table if not exists public.listening_clips (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  -- The link to the source image lives here rather than on the question, and
  -- that is the whole point: a listening question carrying a screenshot_id would
  -- hand the student a public-bucket URL for the very passage they are supposed
  -- to be hearing rather than reading.
  screenshot_id uuid null references public.screenshots(id) on delete set null,
  source text not null check (source in ('screenshot', 'text')),
  kind text not null check (kind in ('passage', 'dialogue', 'scene')),
  -- The language the clip is spoken in, which is the language being taught
  -- rather than the one the class is explained in.
  language text not null,
  -- Only meaningful for Chinese: the same language, two scripts, and a reader
  -- whose accent should follow the one on the teacher's slide.
  script text null check (script in ('traditional', 'simplified')),
  transcript text not null check (char_length(transcript) between 1 and 4000),
  storage_path text not null unique,
  public_url text not null,
  duration_ms integer null,
  voices jsonb not null default '{}'::jsonb,
  -- Same words, same voices, same audio. Regenerating would bill the teacher
  -- twice for a clip they already have.
  content_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists listening_clips_session_idx
  on public.listening_clips (session_id, created_at desc);

create unique index if not exists listening_clips_reuse_idx
  on public.listening_clips (session_id, content_hash);

alter table public.questions
  add column if not exists listening_clip_id uuid null references public.listening_clips(id) on delete set null;

-- Null means unlimited, which is right for practice and wrong for a test: a
-- listening assessment a student can replay until they have transcribed it is
-- a reading assessment.
alter table public.questions
  add column if not exists replay_limit integer null check (replay_limit is null or replay_limit between 1 and 10);

alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions
  add constraint questions_type_check
  check (type in (
    'send_screen', 'poll', 'multiple_choice', 'true_false', 'short_answer',
    'pronunciation', 'oral_response', 'custom_quiz', 'file_upload', 'listening'
  ));

alter table public.listening_clips enable row level security;

-- A clip becomes readable only once a question has carried it to the class.
-- Without this a student could list the session's clips and listen to the test
-- before it starts, which is the audio equivalent of handing out the paper early.
drop policy if exists "read dispatched listening clips" on public.listening_clips;
create policy "read dispatched listening clips" on public.listening_clips for select to anon, authenticated using (
  exists (
    select 1 from public.questions
    where questions.listening_clip_id = listening_clips.id
      and questions.status in ('active', 'stopped', 'closed')
  )
);

-- Column-level, not row-level: the transcript is the answer key for a listening
-- exercise, and the screenshot is the passage in written form. Row access alone
-- would let a crafted PostgREST select ask for either one.
grant select (id, session_id, kind, language, duration_ms, public_url, created_at)
  on public.listening_clips to anon, authenticated;

grant all on public.listening_clips to service_role;

-- The two axes a language class runs on, and the level it runs at.
--
-- Kept as three columns rather than one: the language being taught, the language
-- it is explained in, and how far along the learners are vary independently. A
-- beginners' Japanese class in Taiwan teaches ja, explains in zh-TW, and sits at
-- JLPT N5 — no one of those implies the others.
alter table public.sessions
  add column if not exists teaching_language text not null default 'zh-tw';

alter table public.sessions
  add column if not exists guidance_language text not null default 'zh-TW';

-- Stored in the teacher's own vocabulary rather than translated to CEFR on the
-- way in. A Chinese teacher thinks in TBCL levels and a Japanese teacher thinks
-- in JLPT grades; flattening both to CEFR would lose TBCL levels 1 and 2, which
-- sit below A1 and are exactly the levels where difficulty control matters most.
alter table public.sessions
  add column if not exists level_framework text null check (level_framework in ('tbcl', 'cefr', 'gept', 'jlpt', 'topik', 'ivpt'));

alter table public.sessions
  add column if not exists level_code text null check (level_code is null or char_length(level_code) between 1 and 20);

-- The readings each character may take, in the order the font froze them.
--
-- Copied from ButTaiwan/bpmfvs phonic_table_Z.txt (Apache 2.0). The order is the
-- whole point: the font selects a reading by position, so index 0 is the glyph
-- you get with no selector and index n is the glyph behind U+E01E0 + n. The
-- upstream spec forbids reordering across releases, which is what lets a marked
-- transcript survive a font upgrade.
create table if not exists public.bopomofo_readings (
  codepoint integer primary key,
  readings text[] not null
);

-- Readable by nobody in the browser: the annotator runs server-side, and a
-- student has no reason to hold a dictionary of every reading.
alter table public.bopomofo_readings enable row level security;
grant all on public.bopomofo_readings to service_role;

alter table public.listening_clips
  add column if not exists annotation text not null default 'none'
  check (annotation in ('none', 'zhuyin', 'pinyin'));

-- For zhuyin this is the transcript with variation selectors woven in; for
-- pinyin it is a JSON array of per-character syllables the page renders as ruby.
-- Kept apart from `transcript` so the teacher can still edit plain text and
-- re-annotate without losing their wording.
alter table public.listening_clips
  add column if not exists annotation_text text null;

-- The subset built for exactly this clip's characters. Null for pinyin, which
-- needs no font at all.
alter table public.listening_clips
  add column if not exists font_path text null;

alter table public.listening_clips
  add column if not exists font_url text null;

-- Dragging fragments into order: one primitive, three activities (故事排序,
-- 句子重組, and the ordering half of a listening task).
alter table public.quiz_items drop constraint if exists quiz_items_type_check;
alter table public.quiz_items
  add constraint quiz_items_type_check
  check (type in ('multiple_choice', 'fill_blank', 'short_answer', 'ordering'));

alter table public.quizzes drop constraint if exists quizzes_requested_type_check;
alter table public.quizzes
  add constraint quizzes_requested_type_check
  check (requested_type in ('random', 'multiple_choice', 'fill_blank', 'short_answer', 'ordering'));

-- Reading aloud is the mirror image of a listening test: the learner must see
-- the very text a listening question hides. So the words and the font travel on
-- the question, which students may read, instead of on the clip, whose
-- transcript and font are granted to nobody.
--
-- The font matters as much as the text. A subset is cut from exactly the
-- characters of one clip, so handing it out for a listening item would leak
-- which characters the passage uses. On a read-aloud item there is nothing left
-- to leak — the text is on screen.
alter table public.questions
  add column if not exists reading_font_url text null;
