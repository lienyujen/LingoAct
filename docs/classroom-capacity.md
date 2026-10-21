# Classroom capacity verification — 2026-10-21

## Scope

This is a verified short-load scenario, not an unconditional 200-person SLA. Test target: the owner's explicitly selected LingoAct Supabase project. No real class was active when testing began. Synthetic sessions, students and answers were removed afterwards. No paid AI calls were made.

## Incident baseline

2026-10-21 02:20–02:28 UTC: 16,670 platform log requests, approximately 34.7/s, during a class with 93 participant records. This is HTTP traffic, not 16,670 student submissions, and includes the REST calls made by Edge Functions. No HTTP 429/5xx was observed in that interval. REST endpoint totals: questions 1,427; answers 1,313; reading_passages 1,211; participants 1,185; screenshots 996. One page reload used to read eight base datasets before loading current activity details, with additional repeats while waiting for AI or reconnecting.

## Changes

- Per-student/per-class/per-locale read cache, invalidated by the specific Realtime source. New dispatches and own answers do not wait for TTL.
- Concurrent identical reads share a request; errors are never cached, and invalidation prevents an older in-flight response repopulating the cache.
- Own mutations explicitly invalidate result and participant data; pending hand changes cannot be overwritten by snapshots.
- Reconnect clears the cache; existing lightweight session correction and own-participant correction remain enabled. Cache TTLs limit reuse when subsequent loads occur; they are not a separate polling loop.
- AI waits use jittered single-flight retries, backing off after 10/60 seconds, and stop when the page is hidden or the wait ends.
- Presence publication has bounded retries; heartbeats are spread over 30–40 seconds. Online membership continues to combine Presence and recent authenticated heartbeats.

## Measurements

| Scenario | Result |
|---|---|
| Real student WebSocket clients, plus one teacher | 200 + 1 |
| Channels per student | 5 |
| Authenticated join p95 | 1738 ms |
| Student HTTP read batch p95 (3 reads) | 658 ms |
| 200 simultaneous answer-write responses p95 | 4291 ms |
| Dispatch received | 200/200 |
| Stored / teacher-received answers | 200/200 |
| Online count with recent heartbeats | 200/200 |
| Continuous hold after answer burst | 120 seconds |
| Reported HTTP/socket test errors | 0 |

The raw Presence-only count was 180/200: Presence alone is not an accurate attendance source under this load. The UI's combined membership count was 200/200. Dispatch fan-out spread was 318 ms from the first receiver to the last; this is not end-to-end dispatch latency.

A deterministic 200-client model covering 60 repeated grading refreshes reduced reads of the eight base datasets from 96,000 to 8,000 (91.7%). This is not a claim that all production requests fell by 92%. An actual Electron student-page test verified repeated grading checks reuse shared datasets and a new Realtime dispatch bypasses cache immediately.

## Reproduce

Set LINGOACT_CAPACITY_TEST=1 and LINGOACT_TEST_PROJECT to an explicitly chosen test project, provide its public frontend configuration in .env, then run:

    node scripts/benchmark-classroom-capacity.mjs

This benchmark opens 201 real sockets and writes synthetic data. It refuses to start while recently active real students are present and cleans up only its UUID-scoped fixture. Node 24+ and an authenticated Supabase CLI are required.

## Remaining acceptance work

A full lesson-length soak, 200 physical/mobile browsers, background/foreground recovery on iOS, and simultaneous AI/voice grading have not been established by this test. AI concurrency is separately constrained by provider quotas and needs a controlled queue and its own benchmark before promising that workload. Network outages and service limits cannot be guaranteed away. Supabase Realtime has separate connection, message and Presence limits: https://supabase.com/docs/guides/realtime/limits .
