---
id: M4-02
title: Matrix: channels, roles, members, add people, invites, profile, devices, settings
stage: todo
area: frontend
milestone: M4
priority: P0
slice: false
depends_on: [M3-01]
created: 2026-11-20
owner:
---

## Goal
matrix/ implements the M4 store contract and the pre-sign-in invite calls.

## Acceptance criteria
- [ ] createChannel (restricted to the space or invite-only when private; m.space.child + parent; name uniqueness check in the space → error the UI shows as 'taken'), browseChannels (space hierarchy incl. not-joined), joinChannel, leaveChannel, setTopic
- [ ] myRoles from workspace/client-space power levels + membership (owner PL100, admin PL50, member, client = only in a client space, guest = in neither); channelMembers with roles + pending invites; setRole per D-25 (power levels in the space and its channels); removeFromChannel (kick)
- [ ] addPeople: userIds → Matrix invites; emails → POST /api/invites per email then Matrix invites to the space + channel for the returned userId (409 exists → just invite); result lists added/invited/failed
- [ ] pendingInvites/resendInvite/revokeInvite via the invite API with the access token
- [ ] Auto-accept pending invites from people who share a space with me, and for spaces/channels inside my spaces (D-07); first sign-in lands in the invited channel
- [ ] updateProfile (display name, avatar upload, m.tz), devices (list, sign out one, sign out others with UIA password prompt surfaced as an error the UI can handle), notifyLevel/setNotifyLevel via push rules (room rules for channels, default rule), setSetting → account data work.pasodrum.settings
- [ ] previewInvite/claimInvite in matrix/invites.ts (fetch /api/invites)
- [ ] Integration tests against the local server (+ the invite service once M4-01 is running; mock it until then)
- [ ] `pnpm check` green

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
(filled when moving to ceo-review)

## Review notes
(CEO)
