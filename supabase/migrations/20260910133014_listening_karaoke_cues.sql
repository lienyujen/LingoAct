-- The alignment is made once beside the generated recording and copied only
-- onto an audio-only question. A comprehension quiz must never inherit the
-- transcript or enough timing metadata to reconstruct it.
do $$
begin
  alter table public.listening_clips
    add column if not exists karaoke_cues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(karaoke_cues) = 'array');

  alter table public.questions
    add column if not exists karaoke_cues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(karaoke_cues) = 'array');
end
$$;
