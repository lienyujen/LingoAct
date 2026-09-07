-- 單字卡: which side of the card is the word.
--
-- The readings went onto the options unconditionally, because the first deck
-- built this way put the words there. A deck asked the other way round — 看詞選
-- 解釋 — puts the word in the prompt and the explanations in the options, and
-- the 注音 landed on the explanations: 「不ㄅㄨˋ同ㄊㄨㄥˊ之ㄓ處ㄔㄨˋ」 under a
-- question about 「差異」. Annotating the gloss teaches nothing and makes the
-- three options harder to tell apart than the word ever was.
--
-- So the generator now says which side it put the word on, and the annotation
-- follows it rather than assuming.
alter table public.quiz_items
  add column if not exists prompt_is_word boolean not null default false;

-- The prompt's own reading, for a card whose word is the prompt. 注音 is the
-- word with the readings built into its glyphs; 拼音 is the syllables to print
-- under it — the same two shapes option_readings already holds, and which one
-- it is the question still says through card_font_url.
alter table public.quiz_items
  add column if not exists prompt_reading text null;

notify pgrst, 'reload schema';
