-- The ladders Taiwanese teachers actually work to.
--
-- Three corrections to what the previous migration assumed.
--
-- 'grade' becomes 'guoyu108': the subject is 國語 in 國小 and 國文 from 國中 up,
-- it is defined by the 108 curriculum rather than by bare year numbers, and it
-- runs through 高中, which the year list stopped short of.
--
-- English gains two ladders beside the curriculum, because a Taiwanese English
-- teacher is usually working towards one of three different things: the 108
-- curriculum, 全民英檢, or 多益 — the two tests most often sat in Taiwan. A
-- track may therefore offer several ladders, though still only its own: the
-- application refuses a level that does not belong to the framework, and a
-- framework that does not belong to the track.
alter table public.sessions drop constraint if exists sessions_level_framework_check;

update public.sessions set level_framework = 'guoyu108' where level_framework = 'grade';

alter table public.sessions
  add constraint sessions_level_framework_check
  check (level_framework is null or level_framework in (
    'tbcl', 'guoyu108', 'en108', 'gept', 'toeic', 'cefr', 'jlpt', 'topik', 'ivpt'
  ));
