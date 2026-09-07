-- 寫作教練, the part it was named for: the fields are the working-out, and the
-- article is the point.
--
-- What shipped stopped at the fields. A student filled in three or four boxes
-- and sent them, and what the teacher read was three or four boxes — never a
-- piece of writing. The fields exist to get someone from a blank page to a
-- paragraph they can stand behind; joining them into one connected text is the
-- writing lesson, and it was missing.
alter table public.quiz_attempts
  add column if not exists composition text null
  check (composition is null or char_length(composition) between 1 and 12000);

-- What the AI would have written, and the notes behind it.
--
-- The coach, mid-draft, still never writes a line for the learner — see
-- _shared/writing-coach.ts, where that restraint is the whole design. This is
-- the other side of the same activity: once the writing is in, seeing the
-- correction laid over your own sentence is how you learn what was wrong with
-- it. The diff is computed from this and the learner's own text, so the parts
-- shown as theirs are exactly what they wrote.
alter table public.quiz_attempts
  add column if not exists revision jsonb null;

notify pgrst, 'reload schema';
