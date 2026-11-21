---
id: M3-01
title: Matrix: threads, DMs, activity, people, profiles
stage: done
area: frontend
milestone: M3
priority: P0
slice: false
depends_on: [M2-01]
created: 2026-11-20
owner: agent (matrix)
---

## Goal
matrix/ implements the D-24 contract against the real server.

## Acceptance criteria
- [x] Thread roots carry `thread` (count, lastTs, participants, unread); `openThread` loads the thread timeline (relations API), live updates; `loadOlderInThread`; sending with Draft.threadRootId posts an m.thread relation with reply fallback (is_falling_back) so Element X shows it in the thread
- [x] `threads` = threads I follow (I wrote the root or replied), newest activity first, with unread from threaded read receipts; `markThreadRead` sends a threaded receipt
- [x] `dms` from m.direct + is_direct rooms: people, unread/mentions, lastTs, spaceIds = spaces all its people share with me; DM rooms excluded from channel lists
- [x] `openDm(userIds)` reuses an existing DM with exactly those people (incl. a DM I was invited to) or creates one (is_direct, private, no encryption per D-24) and updates m.direct; invites to DMs from people I share a space with are auto-joined
- [x] `activity`: mentions of me and replies to my messages (channel + thread) from synced history, newest first, unread per my receipts; `markActivityRead`
- [x] `searchPeople(query)` via the user directory (server decides visibility: a client only sees their client space's team), excluding me; `Person.external` = not a member of the workspace space
- [x] `profile(userId)`: name, avatar, `m.tz`, email (`work.pasodrum.email`, else derived from the ID per D-07)
- [x] Integration tests: thread reply visible in thread + summary on root + Element-style fallback, followed threads + unread, DM create/reuse from both sides, client can't find unrelated staff, activity for mention + reply, profile fields round-trip
- [ ] `pnpm check` green

## Notes
Only matrix/ (+ root test script). Keep exported signatures.

## Outcome
Implemented in `apps/web/src/matrix/` (store.ts, map.ts pure helpers, send.ts thread relation); signatures unchanged. Tests: unit (map/send) + `m3.integration.ts` (9 cases, run twice green against the seeded server, 31/31 with M1/M2). `pnpm lint` green; matrix/ typechecks clean. `pnpm check` is red only from M3-02's in-progress app/ files (missing `app/pages/*`, `shell/spaceRooms`, `people.*` locale keys).

How it works:
- **Threads:** own implementation (SDK thread support stays off). Replies come from live timelines plus `/relations` pages; summaries combine the server's bundled `m.thread` summary with replies seen since. `threadTimelines[rootId].messages` = root first, then replies. Followed = I wrote the root or replied; seeded from `/threads` per room once, then live. Sends carry `rel_type: m.thread`, `is_falling_back: true`, `m.in_reply_to` = latest reply (a reply chosen inside the thread sets `is_falling_back: false`).
- **DMs:** `m.direct` ∪ rooms where my membership has `is_direct`; created with `private_chat`, `is_direct`, no encryption; `m.direct` updated on create/accept. DM invites auto-join when the inviter is in one of my spaces; others wait until `openDm` asks for exactly those people. `spaceIds` = spaces where every other person is joined (space member lists are loaded once).
- **Activity:** replies to me (real `m.in_reply_to` to my event, or a thread reply under my root) win over mentions; unread = after my read position (threaded where the server kept it) and not opened this session.
- **People:** `external` = not a joined member of the workspace space; before its member list loads, or for clients who can't see it, judged by a D-07 style ID (`name_domain.tld`). `profile()` reads `m.tz` and `work.pasodrum.email`, else derives the email from the ID.

Learnings (for DECISIONS):
- Continuwuity accepts threaded receipts but drops `thread_id`: one read position per room, and its counts include thread replies. So reading a channel marks its threads read up to there, and a thread receipt moves the channel position too. `markThreadRead` therefore only reaches the server when that skips no unread channel message; otherwise the thread is marked read on this device only.
- Continuwuity's user directory finds next to no one (only the admin, for an empty term). `searchPeople` uses the member lists of my spaces and DMs (server-enforced visibility: a client sees only their client space), plus any directory hits.

## Review notes
(CEO)

Lead review: browser-tested against the local server: live mention → Activity item + rail badge → opens the message and marks read; thread reply from the hover bar (summary count on the root); New message → DM created and listed; profile card shows the work email field. Added Dm.last for list previews and Timeline.failed so the thread error/Retry works. Activity only covers recent synced history (no /notifications) — older mentions won't appear.
