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

The code is complete and proven — it is InterAct's, which has been used in real
classes.

The development backend is live: Supabase project `cgxhbpkndkzdmeswxgld` in
`ap-northeast-1`, on an account kept entirely separate from InterAct's so the
two never share a quota or an outage. Schema, three Storage buckets, twelve
Realtime publications and all nine Edge Functions are deployed; `LINGOACT_OWNER_KEY`,
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

What is **not** done:

- **No release has been published**, and the version is `0.1.0` rather than
  InterAct's numbering.
- **Nothing has been specialised for language teaching yet.** Everything still
  reads as a general classroom tool.

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
