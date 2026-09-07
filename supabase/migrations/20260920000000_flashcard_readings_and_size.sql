-- 單字卡: 標音 on the cards, and a deck the teacher can resize after seeing it.
--
-- The reading goes beside the option rather than into it. options is what the
-- answer is compared against, so annotating it in place would mean a card whose
-- correct answer no longer matches its own key — the same reason 圖片排序 keeps
-- its pictures in option_images.
alter table public.quiz_items
  add column if not exists option_readings jsonb not null default '[]'::jsonb;

-- The whole deck's font subset, cut from the characters the cards actually use.
-- On the question rather than the item because one font covers every card, and
-- the student page loads it once.
alter table public.questions
  add column if not exists card_font_url text null;

-- Ten was the ceiling for a quiz, where ten questions is already a long one. A
-- 生詞表 is not a quiz: a lesson's vocabulary runs past ten regularly, and the
-- teacher can now add to a deck after seeing what the AI made of it.
alter table public.quiz_items drop constraint if exists quiz_items_position_check;
alter table public.quiz_items
  add constraint quiz_items_position_check check (position between 1 and 30);

alter table public.quizzes drop constraint if exists quizzes_requested_count_check;
alter table public.quizzes
  add constraint quizzes_requested_count_check
  check (requested_count is null or requested_count between 1 and 30);

notify pgrst, 'reload schema';

-- Which file a quiz was built from, so a deck made through 檔案傳送 can be added
-- to later. A screenshot-sourced one is found through questions.screenshot_id.
alter table public.quizzes
  add column if not exists source_file_id uuid null references public.shared_files(id) on delete set null;

notify pgrst, 'reload schema';
