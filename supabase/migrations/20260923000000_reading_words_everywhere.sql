-- One spelling of 星期六 across the whole app.
--
-- The reading passage already carries its text cut into words, each with its
-- 《漢語拼音正詞法基本規則》(GB/T 16159) spelling, so a student reading an
-- article sees xīngqīliù over 星期六 and Xiǎo Míng capitalised over 小明.
-- 朗讀 and 聽力 had none of that: annotate-reading returned one syllable per
-- character, so the same three characters came out "xīng qí liù" — three
-- sounds standing next to each other rather than a word, and a proper noun
-- with no capital.
--
-- The per-character list stays, because a flashcard shows a single character
-- and the sound it makes, which is exactly what it is for. The word-level
-- segmentation travels alongside it.
alter table public.listening_clips
  add column if not exists annotation_words jsonb null;

-- Copied onto the question when the clip is dispatched, the same way
-- reading_ruby is, so the student page needs nothing but the question row.
alter table public.questions
  add column if not exists reading_words jsonb null;

notify pgrst, 'reload schema';
