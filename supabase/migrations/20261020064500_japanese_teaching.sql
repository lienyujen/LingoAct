-- Japanese uses kana readings per lexical span; existing ruby and permissions
-- carry those readings without exposing transcripts or answer keys.
alter table public.sessions drop constraint if exists sessions_level_framework_check;
alter table public.sessions add constraint sessions_level_framework_check
  check (level_framework is null or level_framework in (
    'hsk', 'tbcl', 'tocfl', 'guoyu108', 'en108', 'gept', 'toeic', 'cefr', 'jlpt', 'kana', 'jf', 'topik', 'ivpt'
  ));
alter table public.sessions drop constraint if exists sessions_reading_annotation_check;
alter table public.sessions add constraint sessions_reading_annotation_check
  check (reading_annotation in ('none', 'zhuyin', 'pinyin', 'furigana'));
alter table public.listening_clips drop constraint if exists listening_clips_annotation_check;
alter table public.listening_clips add constraint listening_clips_annotation_check
  check (annotation in ('none', 'zhuyin', 'pinyin', 'furigana'));
alter table public.reading_passages drop constraint if exists reading_passages_annotation_check;
alter table public.reading_passages add constraint reading_passages_annotation_check
  check (annotation in ('none', 'zhuyin', 'pinyin', 'furigana'));
