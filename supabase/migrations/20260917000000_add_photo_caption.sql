-- 拍照描述: photograph something real, then describe it in the language being
-- learned — in writing or out loud.
--
-- The photograph half already worked: 上傳作答 takes a picture from a phone and
-- files it against the question. What was missing is the half that makes it a
-- language activity rather than a hand-in — the description, PAIRED with the
-- picture it describes, so the teacher sees the two together and a student who
-- sends two photos describes each of them.
alter table public.file_responses
  add column if not exists caption text null
  check (caption is null or char_length(caption) between 1 and 2000);

-- Spoken instead of written, at the student's choice. The clip goes to the
-- private recordings bucket rather than beside the photo in the public one: a
-- voice is not a photo of a tree, and that distinction is already the rule here.
alter table public.file_responses
  add column if not exists caption_audio_path text null;
alter table public.file_responses
  add column if not exists caption_audio_duration_ms integer null
  check (caption_audio_duration_ms is null or caption_audio_duration_ms between 250 and 180000);

-- Whether the teacher asked for a description at all. An upload of a page of
-- working wants no caption box under it, and 拍照描述 is unusable without one,
-- so the question says which it is rather than the student page guessing.
alter table public.questions
  add column if not exists wants_caption boolean not null default false;

notify pgrst, 'reload schema';
