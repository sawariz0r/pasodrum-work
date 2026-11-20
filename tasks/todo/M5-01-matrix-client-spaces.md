---
id: M5-01
title: Matrix + invite service: client spaces, archive, remove from space, outside people, client's-eye suite
stage: todo
area: frontend
milestone: M5
priority: P0
slice: false
depends_on: [M4-02]
created: 2026-11-21
owner:
---

## Goal
`apps/web/src/matrix/` implements the M5 contract in `types.ts` (D-28), replacing the stubs at the end of `store.ts`. `services/invite/` gains what remove-from-space needs.

## Acceptance criteria
- [ ] `Space.colour` / `Space.archived` from `work.pasodrum.space`; spaces sorted workspace → client by name → archived last
- [ ] `Channel.outside` (clients + guests, joined or invited) only when my role in that space is owner/admin/member
- [ ] `createClientSpace`: space with D-27 levels (`matrix/levels.ts` `powerLevels()`), `work.pasodrum.space {kind:'client', colour}`, channels as restricted children, team invited (auto-accepted by our app), client emails via the invite service as role `client`; `Error('name-taken')` (case-insensitive, trimmed); any failure leaves nothing half-made; resolves after the space is in the snapshot
- [ ] `updateSpace` (name → space name; colour → state), `spaceMembers` (team first, then clients, pending carry `pending`), `removeFromSpace` (kick from space + all its channels, revoke open codes for that person in that space), `setArchived` (D-28 levels; unarchive restores D-27)
- [ ] `anotherApp()` stays as in the stub unless wrong for production (`pasodrum.work`)
- [ ] Integration tests in a new `m5.integration.ts` against the local stack
- [ ] **Client's-eye suite:** a client account can reach zero internal (workspace) rooms or people via the API (hierarchy, directory, joins by id, profile lookups of internal-only people beyond the client space team)
- [ ] `pnpm check`, `pnpm test:matrix`, `pnpm test:invite` green
