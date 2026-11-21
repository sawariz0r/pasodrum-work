---
id: P-01
title: People and access (D-36): Staff/External/Client, access roles, stricter auto-accept, migration
stage: done
area: frontend
milestone: side
priority: P0
slice: false
depends_on: []
created: 2026-11-21
owner: people-access session
---

## Goal
Build D-36 end to end per `design/discovery/people-roles.md` and the approved People* boards: levels (Staff 10, External 1), access roles + membership sync, invite service roles staff/external/client + revoke-all, stricter auto-accept, the People* UI, and a one-off migration script (not run on production).

## Acceptance criteria
- [x] Contract in `matrix/types.ts` + fakes in `app/testing/fakeStore.ts`
- [x] Matrix layer: levels, access roles, sync, removal order, auto-accept
- [x] Invite service: roles, level checks, revoke-all
- [x] UI matches People* boards EN/JP light/dark
- [x] Migration script, idempotent
- [x] D-30 isolation tests green on the local stack; `pnpm check` green

## Outcome
Built end to end (uncommitted). Matrix layer: levels (Staff 10, External 1, invite 10 in workspace channels, workspace m.space.child 10), access roles + External records (state key = user id without "@"), membership sync from the editor's app, drift/Not applied/Apply, removal space-first, removeExternal, addPeople by type, Staff heal, stricter auto-accept + trust anchor (D-36 build refinements). Invite service: staff/external/client (legacy names read), level checks, revoke-all, `work.pasodrum.invited` at claim. UI: typed Add people, client-space People invite, Workspace settings (People, Access, Remove External), External/client views. Migration: `pnpm migrate:people [--dry-run]` (run locally, rerun 0 writes; NOT run on production). Tests: people.integration.ts 5/5 (isolation), invite integration 12/13 (translate fails on dev Caddy mount), matrix m5–m8/rich/e2 41/41. One Fable must-fix review: 4 findings + 1 lead finding fixed.
