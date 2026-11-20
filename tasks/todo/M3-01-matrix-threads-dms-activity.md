---
id: M3-01
title: Matrix: threads, DMs, activity, people, profiles
stage: todo
area: frontend
milestone: M3
priority: P0
slice: false
depends_on: [M2-01]
created: 2026-11-20
owner:
---

## Goal
matrix/ implements the D-24 contract against the real server.

## Acceptance criteria
- [ ] Thread roots carry `thread` (count, lastTs, participants, unread); `openThread` loads the thread timeline (relations API), live updates; `loadOlderInThread`; sending with Draft.threadRootId posts an m.thread relation with reply fallback (is_falling_back) so Element X shows it in the thread
- [ ] `threads` = threads I follow (I wrote the root or replied), newest activity first, with unread from threaded read receipts; `markThreadRead` sends a threaded receipt
- [ ] `dms` from m.direct + is_direct rooms: people, unread/mentions, lastTs, spaceIds = spaces all its people share with me; DM rooms excluded from channel lists
- [ ] `openDm(userIds)` reuses an existing DM with exactly those people (incl. a DM I was invited to) or creates one (is_direct, private, no encryption per D-24) and updates m.direct; invites to DMs from people I share a space with are auto-joined
- [ ] `activity`: mentions of me and replies to my messages (channel + thread) from synced history, newest first, unread per my receipts; `markActivityRead`
- [ ] `searchPeople(query)` via the user directory (server decides visibility: a client only sees their client space's team), excluding me; `Person.external` = not a member of the workspace space
- [ ] `profile(userId)`: name, avatar, `m.tz`, email (`work.pasodrum.email`, else derived from the ID per D-07)
- [ ] Integration tests: thread reply visible in thread + summary on root + Element-style fallback, followed threads + unread, DM create/reuse from both sides, client can't find unrelated staff, activity for mention + reply, profile fields round-trip
- [ ] `pnpm check` green

## Notes
Only matrix/ (+ root test script). Keep exported signatures.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
