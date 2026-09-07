-- 拼音 on a read-aloud item, rendered rather than printed.
--
-- The two annotations reach the student by different routes and only one of
-- them worked. 注音 is set INTO the glyphs: annotate-reading picks a reading per
-- character with a variation selector, the desktop app cuts a font subset from
-- that clip's own characters, and the text renders with the zhuyin already in
-- it. 拼音 cannot work that way — the syllables sit above the line — so
-- annotate-reading returns them as a list instead.
--
-- That list was being written straight into questions.prompt_text, so a pinyin
-- class dispatching 派朗讀練習 showed its students
-- ["wǒ","měi","tiān",...] where the sentence should have been. The syllables
-- now travel in their own column and the prompt stays the sentence, which is
-- also what makes <ruby> possible: ruby needs the characters and the readings
-- separately, one aligned to the other.
alter table public.questions
  add column if not exists reading_ruby jsonb null;

notify pgrst, 'reload schema';
