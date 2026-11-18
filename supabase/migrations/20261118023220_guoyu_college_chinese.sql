alter table public.sessions drop constraint if exists sessions_level_framework_check;
alter table public.sessions
  add constraint sessions_level_framework_check
  check (level_framework is null or level_framework in (
    'hsk', 'tbcl', 'tocfl', 'guoyu108', 'collegeChinese', 'en108', 'gept', 'toeic', 'cefr', 'jlpt', 'kana', 'jf', 'topik', 'ivpt'
  ));
