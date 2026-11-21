---
id: M0-03
title: Server probe script
stage: done
area: infra
milestone: M0
priority: P0
slice: false
depends_on: [M0-02]
created: 2026-11-20
owner: claude
---

## Goal
`pnpm probe` runs every row of the SPEC §8 probe table against a server and prints pass/fail per row with the fallback for failures.

## Acceptance criteria
- [x] dev/seed.ts creates workspace space, client space, channels, staff/client/guest accounts
- [x] dev/probe.ts covers every probe-table row that is testable by API
- [x] Client's-eye isolation checks: client account can't join/list internal rooms or find staff in user directory
- [x] Japanese names/channel names/filenames round-trip
- [x] Output saved to docs/probe-results.md

## Notes
Rows needing Element X are covered manually in M0-05.

## Outcome
- `dev/seed.ts` (`pnpm dev:seed`): workspace "Pasodrum" (#general, #design restricted; #lead private + encrypted), client space "Nordlys" (#project-updates, #questions, marked `work.pasodrum.space {kind:client}`), Owner sofia, Admin ingrid, Members jonas + 田中 由紀, client henrik_nordlys.no, guest lea_freelance.dev in #design only. Handles the one-time bootstrap token. Writes `dev/data/seed.json` (gitignored); `dev:server:reset` clears it.
- `dev/probe.ts` (`pnpm probe`): 20 checks, exits non-zero if a must-have fails, writes [docs/probe-results.md](../../docs/probe-results.md).
- Result on local Continuwuity 26.9.4: **all must-haves pass, 17/20 overall.** Fails with fallbacks: `/notifications`, message search (no partial/Japanese), OpenID userinfo. Interim findings in D-13 and Learnings.
- `pnpm check` now typechecks `dev/` too; `any` allowed only in `dev/`.

## Review notes
(CEO)
