---
id: M4-03
title: UI: workspace menu, channels, channel details, roles, Add people
stage: todo
area: frontend
milestone: M4
priority: P0
slice: false
depends_on: [M3-02]
created: 2026-11-20
owner:
---

## Goal
Batch D channel and people screens work against the store contract.

## Acceptance criteria
- [ ] Workspace menu (WorkspaceMenu) and channels "+" menu (ChannelsPlusMenu)
- [ ] Create channel (CreateChannel, CreateChannelSpace, CreateChannelTaken, JP) with # → lock when private; Browse channels (+JP) with join
- [ ] Channel details from the header: About (topic edit, Copy link = plain channel URL), Members (roles, pending people with Copy join link / resend / remove), Settings, Leave (asks only for private)
- [ ] Role change + Make owner from the profile card and members list per D-25 (Owners: Owner; Owners/Admins: Member↔Admin) — D-25 overrides the Owner-only drawing until the canvas is updated
- [ ] Add people (AddPeople, AddPeopleMember, AddPeopleClient, AddPeopleErrors +JP): suggestions, email tokens, role switch only for Owner/Admin in a workspace channel, Client tag in client spaces, errors; calls store.addPeople; vocabulary: no "invite" in EN copy
- [ ] Show only what works (D-19): these replace the hidden controls from M1–M3
- [ ] Tests with the fake store; browser check against the boards EN/JP × light/dark
- [ ] `pnpm check` green

## Notes
Owns app/channels/ (new), sidebar workspace menu and channel header entry points in app/shell (coordinate: M4-04 owns the profile menu, /settings and /join routes). Re-read App.tsx and locale files before each edit.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
