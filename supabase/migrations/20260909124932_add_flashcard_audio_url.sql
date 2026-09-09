alter table public.quiz_items
  add column if not exists audio_url text null;

alter table public.quiz_items
  add column if not exists audio_status text not null default 'pending'
  check (audio_status in ('pending', 'processing', 'ready'));

notify pgrst, 'reload schema';
