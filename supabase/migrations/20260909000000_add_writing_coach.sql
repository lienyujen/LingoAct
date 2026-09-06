-- 寫作教練: fields the class writes into, not a test.
--
-- The teacher wanted the AI to lay out what to write and then get out of the
-- way: students fill the fields in and send them back, the teacher reads the
-- answers on screen or in the downloaded workbook, and no model is asked to
-- mark anything. That is a deliberate cost decision as much as a pedagogical
-- one — grading a class's worth of free writing is the single most expensive
-- thing this app could do, and it buys the teacher nothing they were asking
-- for.
--
-- It rides on the custom-quiz machinery rather than being its own activity: one
-- question for the class, one attempt per student, each student working through
-- the fields at their own pace. That is already exactly the shape a writing
-- exercise wants.
alter table public.quizzes
  add column if not exists graded boolean not null default true;

-- 'writing' is a mode, not an item type: the items themselves are ordinary
-- short_answer fields, so nothing downstream needs to learn a new item shape.
alter table public.quizzes drop constraint if exists quizzes_requested_type_check;
alter table public.quizzes
  add constraint quizzes_requested_type_check
  check (requested_type in ('random', 'multiple_choice', 'fill_blank', 'short_answer', 'ordering', 'writing'));

-- An ungraded attempt is finished the moment it arrives, but calling that
-- 'graded' would be a lie the results screen then has to work around. It gets
-- its own terminal state instead.
alter table public.quiz_attempts drop constraint if exists quiz_attempts_status_check;
alter table public.quiz_attempts
  add constraint quiz_attempts_status_check
  check (status in ('grading', 'graded', 'submitted', 'failed'));

-- Students may already read the quiz rows they have been sent; the new column
-- rides along on that policy and tells the page whether to expect a score.
