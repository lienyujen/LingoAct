-- The teaching track, decided once, deciding the rest.
--
-- teaching_language used to hold a bare language code and settled only the
-- listening accent; the proficiency ladder was asked for again beside every
-- audio clip, which is the wrong shape — a 華語文 teacher is never going to
-- choose JLPT, and a level chosen per clip is not the class's level.
--
-- It now holds a teaching track: 華語文 and 國語 are separate tracks rather than
-- one Chinese entry, because they share an accent and almost nothing else. One
-- is Mandarin taught to people who do not speak it, laddered by TBCL; the other
-- is Mandarin taught to children who do, laddered by school year and always
-- annotated in 注音. Picking the track settles the ladder, the annotation, the
-- voice and the language the AI writes questions in.
--
-- Existing rows hold 'zh-tw', which at the time meant the only Chinese there
-- was: 華語文. The application resolves that alias rather than rewriting it, so
-- a session created before this migration keeps working unchanged.
alter table public.sessions
  alter column teaching_language set default 'huayu';

-- 國語 is measured in school years, which is not a proficiency test and did not
-- exist in the old list.
alter table public.sessions drop constraint if exists sessions_level_framework_check;
alter table public.sessions
  add constraint sessions_level_framework_check
  check (level_framework is null or level_framework in ('tbcl', 'grade', 'cefr', 'gept', 'jlpt', 'topik', 'ivpt'));

-- 注音 or 拼音, for the tracks where that is a real question. Fixed at 'zhuyin'
-- for 國語, offered to a 華語文 teacher whose class may be coming from either,
-- and irrelevant to the rest — which is why the column carries 'none' rather
-- than being null for them: the read-aloud path asks for it by name.
alter table public.sessions
  add column if not exists reading_annotation text not null default 'zhuyin'
  check (reading_annotation in ('none', 'zhuyin', 'pinyin'));
