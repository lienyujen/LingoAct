-- 華語文能力測驗 TOCFL, beside TBCL.
--
-- TBCL is the benchmark the teaching is written against; TOCFL is the test the
-- learners actually sit — the same pairing as 課綱 and 全民英檢 on the English
-- side, and the reason a track carries a list of ladders rather than one.
alter table public.sessions drop constraint if exists sessions_level_framework_check;
alter table public.sessions
  add constraint sessions_level_framework_check
  check (level_framework is null or level_framework in (
    'tbcl', 'tocfl', 'guoyu108', 'en108', 'gept', 'toeic', 'cefr', 'jlpt', 'topik', 'ivpt'
  ));
