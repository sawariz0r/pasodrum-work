---
id: M1-04
title: Matrix session and classic sync
stage: done
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
- [x] `resolveServer`: accepts `pasodrum.work`, `https://…`, or a base URL; follows `.well-known/matrix/client`; `SignInError('unreachable')` on failure
- [x] `signIn`: username or email per D-19 order; maps 403 M_FORBIDDEN → 'wrong-password', network → 'unreachable'; device display name "Pasodrum work"
- [x] Session persisted in localStorage (`loadSession`); signOut logs out the device and clears it; an invalid/expired token sets `sessionExpired`
- [x] `createWorkspaceStore`: classic `/sync` with lazy-loaded members; workspace = joined space without `work.pasodrum.space {kind:client}`, client spaces = with it; channels = joined children (`m.space.child`) per space, sorted by name; private = join rule not restricted/public
- [x] Unread + mention counts from server notification counts; `markRead` sends a read receipt on the latest event
- [x] Timeline: `openTimeline` loads the latest ~30 text messages, `loadOlder` paginates back; only m.room.message text-ish msgtypes become Message (other events skipped in M1); edits shown with `edited`
- [x] `sendText` adds a 'sending' local message, sends with a full body (`matrix/send.ts` is the only sender; body required by type), turns 'failed' on error; `retry`/`discard` work
- [x] Connection state: 'starting' until first sync, 'online', 'reconnecting'/'offline' from SDK sync state; `reconnectNow` retries immediately
- [x] Snapshot is immutable with structural sharing (unchanged channels/timelines keep identity)
- [x] Integration test against the local dev server (seeded): sign in as jonas, see Pasodrum with general/design/lead, send + receive, client henrik sees only Nordlys — runnable with `pnpm test:matrix` (not part of the offline `pnpm check`)
- [x] `pnpm check` green

## Notes
D-03, D-05, D-19. No crypto init in M1 (M6): encrypted rooms show their channel but messages are skipped. Contract files: matrix/types.ts, matrix/react.tsx, matrix/index.ts (keep the exported signatures; change them only if unavoidable and say why).

## Outcome
- `matrix/session.ts`: `resolveServer` (scheme optional; `localhost`/`*.localhost` default to http; follows `.well-known`, then checks `/versions`), `signIn` (tries `loginCandidates` in D-19 order, 400/403/404 → next candidate, all failed → 'wrong-password', network/5xx → 'unreachable', other 4xx → 'other'; device name "Pasodrum work"; saves the session), `loadSession`/`clearSession` (localStorage `pasodrum.session`, tolerant of missing storage).
- `matrix/store.ts`: `createWorkspaceStore` = matrix-js-sdk client, classic sync (`lazyLoadMembers`, `initialSyncLimit: 30`, pending events detached, VoIP off, no crypto). Every sync/timeline/local-echo event schedules one rebuild of the whole snapshot from SDK state, passed through `share()` so unchanged parts keep identity and listeners fire only on real change. Sending/failed messages are the SDK's pending events (retry = `resendEvent`, discard = `cancelPendingEvent`); a message's id switches from the local `~…` id to the `$…` event id once the server accepts it. `markRead` zeroes counts locally and sends `m.read` on the latest event. Token rejected (`Session.logged_out`) → `sessionExpired`, client stopped, stored session cleared.
- `matrix/map.ts` (pure, unit-tested in `pnpm check`): `workspaceOf` (spaces/channels classification), `share`, `loginCandidates`, `connectionOf`.
- `matrix/send.ts`: the only sender; `TextMessage.body` is required, optional `html`, extra keys typed `work.pasodrum.*`.
- Dev wiring: `apps/web/.env.development` (`VITE_MATRIX_BASE=http://localhost:8008`, un-ignored in `.gitignore`), `apps/web/src/vite-env.d.ts`, root `pnpm test:matrix` (`apps/web/vitest.matrix.config.ts`, files `*.integration.ts`, not in `pnpm check`).
- Integration test (`matrix/workspace.integration.ts`, 11 tests, green against the seeded local server): well-known + unreachable; wrong password; email sign-in (own-server local part and deterministic ID); jonas sees Pasodrum with general/design (not lead: jonas isn't a member in the seed, so the private `lead` check runs as ingrid); full history incl. Japanese sender; encrypted `lead` shows no messages; send → 'sending' → 'sent' → received by ingrid, with structural sharing checked; unread rises and `markRead` clears it; an edit shows as `edited` with the new body; a refused send (space, PL 50) goes 'failed', retry, discard; a fresh 70-message room opens on ≥30, pages back in ≥2 steps to exactly m1…m70; henrik sees only Nordlys; expired token → `sessionExpired` + storage cleared; `signOut` invalidates the token.
- Also smoke-tested in Chromium via the Vite dev server (sign in, sync, send, sign out; no console errors after disabling VoIP).
- Contract: no exported signature changed.
- Not covered in M1: guests (in channels but no space) see no channels; invites are not auto-accepted; avatars are not filled.

## Review notes
(CEO)

Lead review: tested in the real app against the local server (sign in by email for staff and client, sync, send, sign out). Added: thread replies are kept out of the channel timeline until the thread panel exists (M3). Known gaps for later milestones: guests (in channels, no space) see nothing (M5); invites aren't auto-accepted (M4); avatars not loaded; bundle 1.5 MB / 446 KB gzip (M8).
