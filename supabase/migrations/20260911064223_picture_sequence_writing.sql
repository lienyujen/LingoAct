do $migration$
begin
  alter table public.quizzes drop constraint if exists quizzes_requested_type_check;
  alter table public.quizzes
    add constraint quizzes_requested_type_check
    check (requested_type in (
      'random', 'multiple_choice', 'fill_blank', 'short_answer',
      'ordering', 'matching', 'writing', 'flashcard', 'picture_ordering', 'picture_writing'
    ));
  perform pg_notify('pgrst', 'reload schema');
end
$migration$;
