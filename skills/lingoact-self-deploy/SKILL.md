---
name: lingoact-self-deploy
description: Deploy a complete self-hosted LingoAct installation with separate Supabase, Gemini API, GitHub Pages, Reurl.cc, and Windows portable-app configuration. Use when setting up LingoAct for a new instructor, replacing service credentials, cloning or forking LingoAct for private testing, diagnosing an incomplete deployment, or rebuilding LingoAct.exe for another person's infrastructure.
---

# LingoAct Self Deployment

Deploy one instructor at a time. Never reuse the original developer's database or paid API keys. Complete each phase and verify its checkpoint before continuing.

For a first-time Windows user, use `docs/LingoAct-從零部署與打包教學.md` in the LingoAct repository as the master checklist. Explain one phase at a time and wait for its checkpoint instead of presenting all secrets or commands at once.

## Required Inputs

Collect these values without pasting secret values into chat or source files:

- Supabase project ref, Project URL, and publishable key.
- Google AI Studio Gemini API key.
- GitHub repository in `OWNER/REPOSITORY` format.
- Final GitHub Pages URL.
- Reurl.cc API key.

Treat the Supabase publishable key and URLs as public configuration. Treat Gemini, Reurl, Supabase secret keys, service-role keys, database passwords, and GitHub tokens as secrets.

## Ordered Workflow

1. Read [references/supabase.md](references/supabase.md), then run `scripts/deploy-supabase.ps1`. Do not continue until the tables, Storage bucket, and three core Edge Functions exist.
2. Read [references/gemini.md](references/gemini.md), then run `scripts/deploy-gemini.ps1`. Do not continue until an AI question analysis succeeds.
3. Read [references/github-pages.md](references/github-pages.md), then run `scripts/configure-github-pages.ps1`. Do not continue until the participant URL loads from GitHub Pages.
4. Read [references/reurl.md](references/reurl.md), then run `scripts/deploy-reurl.ps1`. Create a new LingoAct session and verify its QR panel shows a `reurl.cc` URL.
5. Read [references/windows.md](references/windows.md), then run `scripts/package-windows.ps1`. Confirm the resulting root `LingoAct.exe` opens and its QR code targets the new GitHub Pages site.

## Operating Rules

- Run scripts from the LingoAct repository root in PowerShell.
- Use a new, empty Supabase project for the bootstrap script.
- Keep Edge Functions public at the gateway with `verify_jwt = false`; authorization is enforced by presenter tokens and server-side checks inside the functions.
- Never expose `GEMINI_API_KEY` or `REURL_API_KEY` through a `VITE_` variable.
- Rebuild GitHub Pages and every packaged exe whenever Supabase or the public app URL changes.
- Preserve the fixed participant Facebook and YouTube links when preparing trial builds.

## Final Verification

Run `pnpm lint` and `pnpm build`. Test with two devices on different networks: create a session, join by QR code, submit a message, answer a screenshot question, run AI analysis, test Reurl, draw a learner, run the buzzer, send an Exit Ticket, and export the report.
