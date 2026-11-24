---
id: DES-08
title: Fixes from the CEO's client-join test (first landing, flashes, language)
stage: ceo-review
area: frontend
milestone: side
priority: P0
slice: false
depends_on: []
created: 2026-11-24
owner: client-join fixes session (Claude)
---

## Goal
A new client lands in their space without a refresh, nothing flashes on the way, and their language is set from their browser when the account is made.

## Acceptance criteria
- [x] New client: start skeleton, then their channel with the space tile. Never "This page isn't available", never `/unavailable`.
- [x] "New client space": no "… already exists" while the create is in flight; a real duplicate name still shows it.
- [x] DMs, Activity, Threads and Drafts titles don't fade in on each visit.
- [x] Docs and Boards code loads in the background after start; no blank frame on `/docs` and `/boards`; Boards keeps its column while loading.
- [x] Language: browser `ja` → Japanese, anything else → English, saved at account creation; the account's language wins at every sign-in (D-55).

## Notes
- Plan by Fable, built by three Opus implementers, one Fable review (no must-fix; two small fixes applied: a failed language save is retried on the next change, a failed background preload is forgotten).
- Not built, on purpose: a persistent shell across routes (would also stop the attention dots popping on each rail click; touches every route), title-only loading columns, recovery for a join the server never reports.
- Known small edge: a fresh account that goes offline in its first 15 s can see the start skeleton again on reconnect.

## Outcome
2026-11-24: built, nothing committed. `pnpm check` green (383 tests).
Checked in a browser on the local stack:
- Fresh client join: `/` → start skeleton → channel in about 0.6 s, space tile shown, "not available" never drawn.
- Language: claim carried `language: ja` with a Japanese browser; the app switched to Japanese after sign-in. Signing in as an account with English saved switched a Japanese browser to English.
- DMs and Activity titles: no animation. Docs and Boards code requested without a click.
2026-11-24, later (local server wiped and re-seeded, CEO's OK):
- "Already exists": created a client space while watching the dialog; the warning never appeared and the space opened. Typing the same name afterwards still shows the warning and disables Create.
- Docs and Boards, first open after a page load, with a page and a project present: loading skeleton at about 0.1 s, content right after, no blank frame.
- Sign-in from a clean browser profile: channel in about 0.4 s.
- `test:invite`: 52 of 52, three runs in a row. It was flaky before ("database is locked": the tests open the service's database from a second process), so the service and the test helper now wait up to 2 s for the file (`services/invite/src/store.ts`, `services/invite/test/helpers.ts`).
- `test:matrix` on clean data: 88 of 91, including the new-client landing test. The 3 failures are older and not from this task: `m3` and `m5` expect people without the `client` field that D-40 added; `m4` expects a client's email added to a workspace channel to succeed, and it is refused ("not-allowed"). The last one needs a look to tell an outdated test from a regression.
- `dev/.env` got a local `SYSTEM_PASSWORD` (it was missing, so the system sender and its tests could not run). Run `test:matrix` right after a re-seed: `test:invite` leaves spaces behind that break it.

CEO re-test on production after deploy: create a client space with a client email, open the join link in a private window, set name and password. Expect the skeleton, then the channel.

## Review notes
(CEO)
