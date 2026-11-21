---
id: M4-02
title: Matrix: channels, roles, members, add people, invites, profile, devices, settings
stage: done
area: frontend
milestone: M4
priority: P0
slice: false
depends_on: [M3-01]
created: 2026-11-20
owner: claude (M4-02 agent)
---

## Goal
matrix/ implements the M4 store contract and the pre-sign-in invite calls.

## Acceptance criteria
- [x] createChannel (restricted to the space or invite-only when private; m.space.child + parent; name uniqueness check in the space → error the UI shows as 'taken'), browseChannels (space hierarchy incl. not-joined), joinChannel, leaveChannel, setTopic
- [x] myRoles from workspace/client-space power levels + membership (owner PL100, admin PL50, member, client = only in a client space, guest = in neither); channelMembers with roles + pending invites; setRole per D-25 (power levels in the space and its channels); removeFromChannel (kick)
- [x] addPeople: userIds → Matrix invites; emails → POST /api/invites per email then Matrix invites to the space + channel for the returned userId (409 exists → just invite); result lists added/invited/failed
- [x] pendingInvites/resendInvite/revokeInvite via the invite API with the access token
- [x] Auto-accept pending invites from people who share a space with me, and for spaces/channels inside my spaces (D-07); first sign-in lands in the invited channel
- [x] updateProfile (display name, avatar upload, m.tz), devices (list, sign out one, sign out others with UIA password prompt surfaced as an error the UI can handle), notifyLevel/setNotifyLevel via push rules (room rules for channels, default rule), setSetting → account data work.pasodrum.settings
- [x] previewInvite/claimInvite in matrix/invites.ts (fetch /api/invites)
- [x] Integration tests against the local server (+ the invite service once M4-01 is running; mock it until then)
- [x] `pnpm check` green

## Notes
Invite API (same origin, D-26):
- `POST /api/invites` (Bearer = caller's Matrix token) `{email, name?, role: member|guest|client, spaceId, channelIds[], locale: en|ja}` → 201 `{code, userId, link}` · 409 `{error:"exists", userId}` (account already exists: caller just sends Matrix invites) · 400 `{error:"invalid-email"}` · 403 `{error:"not-allowed"}` · 429.
- `GET /api/invites/:code` → `{email, spaceName, spaceKind, inviter?, team:[{id,name}], state: open|used|expired}`.
- `POST /api/invites/:code/claim` `{name, password}` → `{userId, identifier}` · 410 used/expired.
- `POST /api/invites/:code/resend` (Bearer) → 204 · `DELETE /api/invites/:code` (Bearer) → 204 (revoke: deactivates the unclaimed account).
- `GET /api/invites?roomId=…` (Bearer) → `[{code, email, name?, role, createdTs, link}]` pending invites that include that room.
- Permission check uses the caller's token: whoami, then the caller's membership/power level in `spaceId` (Owner/Admin may invite Members; any member may invite guests, and clients in a client space — D-25). The service then registers the account (deterministic ID per D-07), stores the temporary password encrypted, emails the link; the caller's app sends the Matrix invites to the space + channels.

Only matrix/ (+ root test script). Keep exported signatures.

## Outcome
Implemented in `apps/web/src/matrix/` (store.ts M4 section, invites.ts, push.ts, map.ts role helpers, `PasswordRequired` in types.ts). Exported signatures unchanged; one export added (`PasswordRequired`).

Semantics for app/:
- Errors are `Error(code)`: createChannel `'taken'` (same name, case-insensitive, among the space's children) / `'not-allowed'`; setRole `'not-allowed'` (checked before any write); addPeople never throws per person, failures go in `failed`. Invite calls reject with `InviteError` whose message is the service code (`used`, `expired`, `rate-limited`, `weak-password`, `unreachable`…). previewInvite: `revoked` → `used`, unknown → `expired`. pendingInvites resolves `[]` when the service fails.
- signOutDevice / signOutOtherDevices reject with `PasswordRequired` (message `'password-required'`); call `err.retry(password)`; a wrong password rejects with `Error('wrong-password')` and retry can be called again.
- addPeople: `added` = user ids (incl. a 409 existing account's id), `invited` = emails (201, incl. re-invites of pending emails: fresh code, Matrix invites kept). Pending Matrix invitees show in channelMembers as `pending: true` (role `guest` until they join a space), so an emailed person appears both there and in pendingInvites.
- notifyLevel is synchronous and not part of the snapshot; it is current as soon as setNotifyLevel resolves. A channel with no rule follows the default.
- Invite API is called on `location.origin` (dev needs the Vite /api proxy).

Findings / for decision:
- Room version 12 (server default): creators outrank everyone and can't be demoted; a channel's creator is permanent "owner" of it. New channels copy the space's Owners/Admins (creators as 100).
- D-27 implemented: `matrix/levels.ts` (`powerLevels(kind, 'space'|'channel', users)`, `channelUsers`, `levelFor`, `LEVEL`) is shared with dev/seed.ts and meant for M5 client-space creation. New channels copy the space's levels ≥10 (creators as 100). setRole updates the space first (a server refusal → 'not-allowed'), then every space of mine the person is in (client spaces: Member = 10) and their channels. Adding a colleague to a client-space channel puts them at 10 there when I may set levels (Owner/Admin only, since power_levels needs 50). In a client space, a client viewer tells team from clients by level ≥10. The local seeded rooms were migrated in place (no reseed).
- Continuwuity's sync can miss a space join that lands with a channel join; invites are accepted one at a time, spaces first.
- Fixed a race in workspace.integration "session end" test.

Verified: vitest matrix units, `pnpm test:matrix` 48 (invite tests skip when the service rate-limits the caller; they passed before D-27) (incl. invite service: email → claim → first sign-in auto-joins), eslint, typecheck, `pnpm check` green.

## Review notes
(CEO)

Lead review: power levels per D-27; guest grouping fix (channels under an unjoined parent space, name from account data). Flaky M3 thread-unread test noted.
