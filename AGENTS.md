You are developing **LingoAct**, a classroom interaction system specialised for
language teaching.

## Where this came from

LingoAct was seeded from InterAct (`github.com/lienyujen/InterAct`) at InterAct
commit `e1293ca`, then fully separated. Nothing is shared at runtime: different
product name, different `appId`, different `%APPDATA%` folder, different storage
buckets, different GitHub Pages path, and a different Supabase project. A teacher
can run InterAct and LingoAct on the same machine without either seeing the
other's sessions, tokens, or backend configuration.

InterAct remains a general-purpose classroom tool. LingoAct's reason to exist is
the language classroom — that is what should drive every decision here. The
inherited features that already serve it are live captions with translation,
interpretation audio, pronunciation grading (朗讀發音), spoken-response grading
(口語表達), and per-student display language.

## Architecture

Three pieces, deployed separately:

- **Presenter app** — Electron desktop app for Windows. Screen capture, the
  floating control panel, the caption overlay, the roster window. Built with
  electron-builder into `LingoAct.exe` (portable) and `LingoAct.zip`.
- **Student page** — the same React app served as a static site from GitHub
  Pages at `lienyujen.github.io/LingoAct/`. Students reach it by scanning a QR
  code; the join link carries the Supabase project reference and publishable
  key, so the page never needs its own build per deployment.
- **Backend** — Supabase: Postgres + Realtime + Storage + Edge Functions. Every
  AI call goes through an Edge Function; API keys never reach the browser.

React 19, TypeScript, Vite 8 (rolldown), HashRouter. `pnpm` for everything.

## Two editions, one codebase

`APP_EDITION=plus` builds `LingoActPlus`; unset builds `LingoAct`. Both ship the
same code — features are gated at runtime by `VITE_APP_EDITION` (see
`src/lib/edition.ts`). Do not fork to add an edition-only feature.

## Starting a class requires the management key

`LINGOACT_OWNER_KEY` is a Supabase secret. A machine without it can join and
present nothing — this is what stops a borrowed laptop from spending the
project's AI quota. Regenerating the key revokes every machine at once without
touching the publishable key the student page depends on.

## Current state

The classroom machinery is InterAct's, which has been used in real classes. The
language-teaching work on top of it is new to this repository and has been
exercised against the live backend, but not yet in front of a class.

The development backend is live: Supabase project `cgxhbpkndkzdmeswxgld` in
`ap-northeast-1`, on an account kept entirely separate from InterAct's so the
two never share a quota or an outage. Schema, four Storage buckets, thirteen
Realtime publications and all twelve Edge Functions are deployed; `LINGOACT_OWNER_KEY`,
`GEMINI_API_KEY`, `OPENAI_API_KEY` and `REURL_API_KEY` are all set and have been
exercised against the live services, not merely configured. The student page is
published at `lienyujen.github.io/LingoAct/` from the three GitHub Pages
repository variables.

Reurl refuses to shorten a URL that does not resolve, so the QR panel fails with
a 502 whenever GitHub Pages is down or has never been deployed. The failure looks
like a bad Reurl key and is not one.

This project is for development only. Released builds ship with no project
configured; each teacher supplies their own through the setup screen, which is
why `release.yml` deliberately builds without a `.env`.

## What the language work has added so far

- **A teaching track on the session**, chosen once when the class is created
  and settling everything downstream: the proficiency ladder, the reading
  annotation, the listening accent, and the language the AI writes questions in.
  華語文 and 國語文 are separate tracks, not one Chinese entry — they share an
  accent and almost nothing else, one being Mandarin taught to people who do not
  speak it and the other to children who do (國語 in 國小, 國文 from 國中,
  through 高中, always 注音). A track carries the ladders that fit it and no
  others: 華語文 has TBCL and the TOCFL test its learners sit, 英語 has the 108
  curriculum, 全民英檢 and 多益, 日語 JLPT, 韓語 TOPIK, 越南語 the six-level
  scale, the rest CEFR. Picking JLPT is not a choice a 華語文 teacher should
  have to decline, but choosing between 全民英檢 and 多益 is one an English
  teacher really makes.
- **素養導向 belongs to the two 課綱 ladders and to nothing else.** The 108
  curriculum asks an item to be set in a situation the learner could meet and to
  require applying the text rather than locating a fact in it, so those two
  ladders carry that instruction and the proficiency tests do not — a class
  preparing for 多益 or TOCFL wants items in that test's own idiom. The
  difference is visible: from one recycling notice, 國語 第五學習階段 produces
  「小華週四晚上吃完外帶便當…他最適合在什麼時候拿去回收？」 while TOCFL 進階級
  produces 「住戶如果想要丟棄…應該在什麼時候拿去回收？」.
- **A guidance language** alongside it, varying independently: a beginners'
  Japanese class in Taiwan teaches ja and is explained in zh-TW. English is
  assumed nowhere; the student page speaks eight guidance languages, two
  hand-written and six generated by
  `scripts/generate-participant-locales.mjs`. A student with no preference of
  their own opens in the teacher's 導引語 and keeps their own choice if they make
  one.
- **Proficiency frameworks** in `supabase/functions/_shared/proficiency.ts` —
  TBCL, GEPT, JLPT, TOPIK, CEFR and the Vietnamese six-level scale, each in its
  own vocabulary rather than flattened to CEFR. They drive question difficulty
  and the rule that keeps an answer out of its own question stem.
- **The listening studio**: a screenshot or pasted text becomes speech, which
  can go out as audio, as a read-aloud practice against a model recording, or as
  a comprehension quiz. Simplified script is voiced in 普通話, traditional in a
  Taiwanese accent.
- **Zhuyin and pinyin as a webfont**, chosen per clip by the teacher, with a
  subset cut from that clip's own characters.
- **Timed activities**: `questions.prepare_seconds` and `answer_seconds`, null
  meaning untimed. The deadline is enforced in the `answers` insert policy
  against the database's clock, anchored on `started_at` — a countdown the
  client alone could be talked out of is not a deadline. Audio is deliberately
  outside that rule; see the migration for why.
- **看圖說話**, a four-panel picture the class describes or narrates. Four
  panels rather than one because one picture gets you nouns and four get you a
  story — 先、再、然後、最後, a tense, a reason — which is why the panels have to
  be one sequence rather than four related pictures. It is generated in two
  calls: a text model plans the story against the class's track and level,
  because that is the model that knows what TBCL 3 or 第五學習階段 means, and the
  image model only draws what it is handed. The same button therefore produces
  下雨、雨傘、一起 with 「因為…所以…」 for TBCL 2, and 天人交戰、將心比心 with a
  300-字 記敘文 for 國中九年級. The picture comes back to the teacher as bytes
  and is uploaded only when they send it, so the ones they reject leave no row
  and no object behind; from the upload onwards it travels the screenshot path
  unchanged, which is why the activity needs no question type, no student view
  and no results view of its own — it dispatches as an ordinary 問答題 or
  口語表達 carrying a picture. Two rules in the prompt were learned by drawing
  rather than reasoned out: the story must not be built around anything that
  carries writing, because the model letters whatever normally carries lettering
  and the characters it invents are malformed; and each panel is one frozen
  moment, because a panel describing three actions is drawn with the same person
  in it three times.
- **寫作教練**, which is the custom-quiz machinery with the marking switched
  off: `quizzes.graded` false, items generated as writing fields rather than
  questions, and the attempt reaching a `submitted` state that carries no
  score. The teacher reads the writing on screen or in the workbook. Grading a
  class's free writing would be the most expensive call this app makes, and it
  is not what was asked for.

Self-paced activities ride on that same machinery rather than needing anything
new: `sessions.current_question_id` holds one question for the whole class, but
a quiz behind it carries many items and one attempt per student, so everyone
moves through it at their own speed. What it does *not* yet do is serve an item
twice — `quiz_item_answers` is unique per (attempt, item) — which is the one
thing flashcards will need.

What is **not** done:

- **No release has been published**, and the version is `0.1.0` rather than
  InterAct's numbering.
- Of the twelve teaching activities, these are still open:
  **聽打接力** (nothing built; needs per-sentence clips and pairing);
  **聽力分段任務** has replay and a slow toggle but no segmenting, so a clip is
  still a whole passage; **故事排序** orders text only, not images;
  **即時造句牆** collects the
  sentences but nothing aggregates them; **AI寫作教練** is the simplified form
  the teacher asked for, without the scaffolding questions the activity table
  describes; **拍照描述** uploads a photo with no paired caption field.
- `pnpm desktop:package` has not been run since `subset-font` was added. pnpm's
  symlinks may defeat the electron-builder `files` globs; the likely fix is
  `node-linker=hoisted` in `.npmrc`.

## Conventions worth knowing before editing

- Comments explain *why*, in the voice of the surrounding code. Do not narrate
  what the next line does.
- `supabase/schema.sql` is the source of truth and must stay idempotent; it is
  applied repeatedly by the self-deploy flow. Test changes by running the real
  file, not hand-written SQL.
- Edge Functions are killed after roughly 76 seconds of wall clock. Anything
  longer has to be split or moved to the client.
- For a new self-hosted deployment, follow `skills/lingoact-self-deploy/SKILL.md`
  and keep each deployer's Supabase, Gemini, Reurl and GitHub credentials
  separate.
- The Supabase access token, database password and owner key live in
  `~/.lingoact/`, not in the repository. This tree sits inside a synced Dropbox
  folder, so a gitignored secret would still leave the machine.
