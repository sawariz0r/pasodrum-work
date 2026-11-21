---
id: M5-01
title: Matrix + invite service: client spaces, archive, remove from space, outside people, client's-eye suite
stage: done
area: frontend
milestone: M5
priority: P0
slice: false
depends_on: [M4-02]
created: 2026-11-21
owner: matrix session (M5-01)
---

## Goal
`apps/web/src/matrix/` implements the M5 contract in `types.ts` (D-28), replacing the stubs at the end of `store.ts`. `services/invite/` gains what remove-from-space needs.

## Acceptance criteria
- [x] `Space.colour` / `Space.archived` from `work.pasodrum.space`; spaces sorted workspace → client by name → archived last
- [x] `Channel.outside` (clients + guests, joined or invited) only when my role in that space is owner/admin/member
- [x] `createClientSpace`: space with D-27 levels (`matrix/levels.ts` `powerLevels()`), `work.pasodrum.space {kind:'client', colour}`, channels as restricted children, team invited (auto-accepted by our app), client emails via the invite service as role `client`; `Error('name-taken')` (case-insensitive, trimmed); any failure leaves nothing half-made; resolves after the space is in the snapshot
- [x] `updateSpace` (name → space name; colour → state), `spaceMembers` (team first, then clients, pending carry `pending`), `removeFromSpace` (kick from space + all its channels, revoke open codes for that person in that space), `setArchived` (D-28 levels; unarchive restores D-27)
- [x] `anotherApp()` stays as in the stub unless wrong for production (`pasodrum.work`)
- [x] Integration tests in a new `m5.integration.ts` against the local stack
- [x] **Client's-eye suite (all but profile lookups — server leak, see Outcome):** a client account can reach zero internal (workspace) rooms or people via the API (hierarchy, directory, joins by id, profile lookups of internal-only people beyond the client space team)
- [x] `pnpm check`, `pnpm test:matrix`, `pnpm test:invite` green

## Outcome
Built in `apps/web/src/matrix/` + `services/invite/` (nothing committed). `types.ts` unchanged.

- **Snapshot:** `Space.colour` / `Space.archived` come from `work.pasodrum.space`. Order: workspace, then client spaces by name, archived ones last (`map.ts` + unit test). `Channel.outside` = clients and guests (joined or invited), filled only for owner/admin/member. To compute it, team accounts now load member lists for their channels (the list fills in as they load).
- **createClientSpace:** creates the space (D-27 levels, `{kind:'client', colour}`), then restricted child channels **one at a time**, then client codes through the invite service, then Matrix invites for the team and clients (the team's apps accept on their own). Errors: `name-taken` (trimmed, case-insensitive, over the client spaces this account knows), `not-allowed`, `other`. On failure it revokes the codes, kicks whoever was invited, then leaves and forgets every room. The space stays out of the snapshot until it is whole; rolled-back rooms stay out for good.
- **updateSpace** (name + colour; `name-taken` on rename), **spaceMembers** (team first, then clients, pending last in each group), **removeFromSpace** (revokes the person's codes first, then kicks from every channel I'm in, then from the space), **setArchived** (`levels.ts` `archivedLevels`: `events_default` + `m.reaction` + `m.room.redaction` → 50 in every channel; unarchive restores D-27; flag in space state). `anotherApp()` unchanged (`pasodrum.work` in production).
- **Invite service:** `DELETE /api/invites?spaceId=&userId=` revokes that person's open codes in that space; allowed for Admins+ of the space; returns `{revoked: n}`. `store.revokeForUser`, integration test.
- **Tests:** `m5.integration.ts` (16 tests + 1 expected fail) including the client's-eye suite. Another client's space is created to check isolation between clients too. `pnpm check` and `pnpm test:invite` green. `pnpm test:matrix`: m5 green on every run. M3 threads and M4 notify/createChannel fail now and then **with or without these changes** (3+3 runs compared): pre-existing timing flakes.

**Server quirks (Continuwuity), for DECISIONS learnings:**
1. Room v12 IDs are a hash of the create event. Two `createRoom` calls from one person with the same create content in the same millisecond get the **same room ID** and are merged silently, so creation is sequential. `openDm` for two different groups in one millisecond could collide in theory.
2. A new room reaches sync a piece at a time (first only `m.room.create`: no name, no custom state). M4 `createChannel` resolves on presence, not completeness, so its snapshot can briefly say `private: true` with no topic (cause of the M4 flake).
3. A room forgotten while a sync is still in flight comes back as joined.
4. Inviting a nonexistent local user → 200. Kicking a non-member → 403. `/messages` on a room you can't see → 200 with an empty chunk.
5. **SECURITY (needs CEO/lead decision, D-06):** any signed-in account can read any local profile by ID: display name, `m.tz` and **`work.pasodrum.email`**. So a client can look up internal staff if they know or guess the ID. Continuwuity has no setting to limit this (only `require_auth_for_profile_requests`). Recorded as `it.fails` in the client's-eye suite. Options: stop putting the email on the public profile, filter profile requests at Caddy, or ask upstream for a fix.

**Follow-ups noticed (out of scope):** the join page team (`InvitePreview.team`) is read when the invite is created, so for invites sent during `createClientSpace` it shows only the creator. The invite service `canInvite('client')` needs level 50, but D-27 lets the team (10) add people. An existing client account added to a new client space by someone they share no space with doesn't auto-accept (`trusts()`). The invite email tile ignores `Space.colour`. Channels the actor isn't in are skipped by remove and archive. A channel created after archiving is writable.

**Review round (Fable 5.2 findings, all ten addressed):**
- Invite service: it only trusts the workspace that alias `#workspace:<server>` points at (env `WORKSPACE_ALIAS` overrides it; fails closed if the alias is missing), plus client spaces whose `work.pasodrum.space` was set by a workspace Admin+ (`rules.ts` `isGenuine`). A dormant account gets a new code only from someone who may manage its latest invite; anyone else gets 409 `exists`. The pending list shows code and link only to the inviter or Admins+ of the space. Codes are per account and space; claiming one revokes the others. The seed sets the alias; on an already-seeded server `pnpm dev:seed` adds it (**production needs one run**).
- Store: `createClientSpace` checks emails first (`invalid-email`), sends codes only after the space, channels and team invites exist, and never rolls back once mail may be out. It ignores team ids that aren't joined in the workspace, and cleans up rooms a failed `createRoom` left behind. `removeFromSpace` passes through channels the remover isn't in (join, kick, leave; those stay hidden) and rejects `partial` if a channel can't be reached. `setArchived` rolls back changed channels on failure. State writes go one at a time per room, built from the server's copy. Housekeeping skips discarded rooms. D-28 notes the room-v12 creator gap.
- More Continuwuity quirks: a failed `createRoom` (e.g. 413) leaves a half-made room and doesn't return its ID. The SDK's local leave can land before a lagging sync that still says joined.

**Follow-ups after review (lead, CEO D-29/D-30):** the client's-eye profile case now documents D-29 (readable by ID, accepted). Senders, reactions, thread participants and DM people show the person's *current* name and avatar (current member state; checked that Continuwuity updates member state in every room on rename). `addPeople(targetId)` accepts a space: added to the space plus its home channel (workspace #general, else the first public channel; client space its first channel, by creation time); a guest goes to the home channel only. `createChannel` now waits for the channel's join rule and topic before resolving, which fixes the M4 flake.
