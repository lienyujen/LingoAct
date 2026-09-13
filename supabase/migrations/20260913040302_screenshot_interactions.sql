alter table public.quizzes add column if not exists interaction_mode boolean not null default false;
alter table public.quiz_items add column if not exists sentence_mode boolean not null default false;
notify pgrst, 'reload schema';
