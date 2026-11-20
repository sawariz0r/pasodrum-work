---
id: M1-04
title: Matrix session and classic sync
stage: implementing
area: frontend
milestone: M1
priority: P0
slice: true
depends_on: [M0-06]
created: 2026-11-20
owner: claude
---

## Goal
`matrix/` implements the D-19 contract with matrix-js-sdk: sign in, keep the session, classic sync, and a live `WorkspaceStore` the app reads.

## Acceptance criteria
- [ ] `resolveServer`: accepts `pasodrum.work`, `https://…`, or a base URL; follows `.well-known/matrix/client`; `SignInError('unreachable')` on failure
- [ ] `signIn`: username or email per D-19 order; maps 403 M_FORBIDDEN → 'wrong-password', network → 'unreachable'; device display name "Pasodrum work"
- [ ] Session persisted in localStorage (`loadSession`); signOut logs out the device and clears it; an invalid/expired token sets `sessionExpired`
- [ ] `createWorkspaceStore`: classic `/sync` with lazy-loaded members; workspace = joined space without `work.pasodrum.space {kind:client}`, client spaces = with it; channels = joined children (`m.space.child`) per space, sorted by name; private = join rule not restricted/public
- [ ] Unread + mention counts from server notification counts; `markRead` sends a read receipt on the latest event
- [ ] Timeline: `openTimeline` loads the latest ~30 text messages, `loadOlder` paginates back; only m.room.message text-ish msgtypes become Message (other events skipped in M1); edits shown with `edited`
- [ ] `sendText` adds a 'sending' local message, sends with a full body (`matrix/send.ts` is the only sender; body required by type), turns 'failed' on error; `retry`/`discard` work
- [ ] Connection state: 'starting' until first sync, 'online', 'reconnecting'/'offline' from SDK sync state; `reconnectNow` retries immediately
- [ ] Snapshot is immutable with structural sharing (unchanged channels/timelines keep identity)
- [ ] Integration test against the local dev server (seeded): sign in as jonas, see Pasodrum with general/design/lead, send + receive, client henrik sees only Nordlys — runnable with `pnpm test:matrix` (not part of the offline `pnpm check`)
- [ ] `pnpm check` green

## Notes
D-03, D-05, D-19. No crypto init in M1 (M6): encrypted rooms show their channel but messages are skipped. Contract files: matrix/types.ts, matrix/react.tsx, matrix/index.ts (keep the exported signatures; change them only if unavoidable and say why).

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
