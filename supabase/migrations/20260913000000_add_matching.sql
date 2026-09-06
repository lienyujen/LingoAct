-- 配對: the item type 即時詞彙搶答 was missing.
--
-- Matching needs two lists where every other item type needs one. `options`
-- keeps its meaning — the things a student chooses from, shuffled — and the
-- left column, the things being matched, goes in its own column rather than
-- being encoded into prompt_text, which would have made the item unparseable
-- the moment a teacher's word contained a newline.
--
-- The key is the right-hand item for each left-hand one, in left-hand order,
-- exactly as 排序 stores the correct sequence. That lets grading compare
-- element by element without a model, which is what keeps a vocabulary drill
-- free to run every lesson.
alter table public.quiz_items
  add column if not exists pair_prompts jsonb not null default '[]'::jsonb;

alter table public.quiz_items drop constraint if exists quiz_items_type_check;
alter table public.quiz_items
  add constraint quiz_items_type_check
  check (type in ('multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching'));

alter table public.quizzes drop constraint if exists quizzes_requested_type_check;
alter table public.quizzes
  add constraint quizzes_requested_type_check
  check (requested_type in ('random', 'multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'matching', 'writing'));
