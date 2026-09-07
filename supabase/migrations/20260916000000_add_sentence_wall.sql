-- 即時造句牆: everyone writes one sentence, the class's sentences appear on the
-- projector as they arrive, and the AI writes them up into one piece the
-- teacher can send back.
--
-- The collecting half already existed — a 問答題 is one sentence from each
-- student — so this adds no question type. What it adds is a display switch,
-- kept beside 彈幕 and 字幕 because it is the same kind of thing: whether the
-- class-facing overlay is showing something right now. Any 問答題 can become a
-- wall, which is what makes it usable for a 句型 drill the teacher improvises.
alter table public.sessions
  add column if not exists sentence_wall_enabled boolean not null default false;

-- The write-up is an AI summary of a question, like every other one, so it
-- lives with them and survives a refresh rather than sitting in the page.
alter table public.ai_summaries drop constraint if exists ai_summaries_type_check;
alter table public.ai_summaries
  add constraint ai_summaries_type_check
  check (type in (
    'screen_preview', 'short_answer_summary', 'question_analysis',
    'exit_ticket_summary', 'sentence_wall'
  ));

notify pgrst, 'reload schema';
