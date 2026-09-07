-- 故事排序 with pictures.
--
-- Ordering already works on sentences and paragraphs. What it could not do is
-- the version the activity is named for: four panels of a story, shuffled, that
-- the class drags back into sequence. The drag, the key and the marking are all
-- the same — only what sits in each row changes — so this adds one list beside
-- options rather than a second kind of ordering item.
--
-- options still carries the values that are compared against the key, and this
-- carries the picture to show for each of them, in the same order. Empty on
-- every item that came before, which is what makes the change invisible to
-- them: a row with no picture renders its text exactly as it always did.
alter table public.quiz_items
  add column if not exists option_images jsonb not null default '[]'::jsonb;

-- The panels are readable by the class, and must be: they are the exercise.
-- What stays unreadable is quiz_item_keys, which holds the order they go in.
-- quiz_items is already granted whole-table select to anon, so the new column
-- comes with it; nothing here widens what a student can reach.

-- 圖片排序 as a requested type, so the teacher's picker and the results view can
-- tell it from an ordering quiz built out of sentences.
alter table public.quizzes drop constraint if exists quizzes_requested_type_check;
alter table public.quizzes
  add constraint quizzes_requested_type_check
  check (requested_type in (
    'random', 'multiple_choice', 'fill_blank', 'short_answer',
    'ordering', 'matching', 'writing', 'flashcard', 'picture_ordering'
  ));

notify pgrst, 'reload schema';
