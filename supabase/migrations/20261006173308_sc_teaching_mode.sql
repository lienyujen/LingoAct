alter table public.sessions add column if not exists system_language text null
  check (system_language is null or system_language in ('zh-CN', 'zh-TW', 'en'));
alter table public.sessions drop constraint if exists sessions_level_framework_check;
alter table public.sessions add constraint sessions_level_framework_check
  check (level_framework is null or level_framework in (
    'hsk', 'tbcl', 'tocfl', 'guoyu108', 'en108', 'gept', 'toeic', 'cefr', 'jlpt', 'topik', 'ivpt'
  ));
alter table public.reading_passages
  add column if not exists level_framework text null,
  add column if not exists level_code text null;
