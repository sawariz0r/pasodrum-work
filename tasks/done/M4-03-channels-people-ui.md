---
id: M4-03
title: UI: workspace menu, channels, channel details, roles, Add people
stage: done
area: frontend
milestone: M4
priority: P0
slice: false
depends_on: [M3-02]
created: 2026-11-20
owner: claude (M4-03 agent)
---

## Goal
Batch D channel and people screens work against the store contract.

## Acceptance criteria
- [x] Workspace menu (WorkspaceMenu) and channels "+" menu (ChannelsPlusMenu)
- [x] Create channel (CreateChannel, CreateChannelSpace, CreateChannelTaken, JP) with # → lock when private; Browse channels (+JP) with join
- [x] Channel details from the header: About (topic edit, Copy link = plain channel URL), Members (roles, pending people with Copy join link / resend / remove), Settings, Leave (asks only for private)
- [x] Role change + Make owner from the profile card and members list per D-25 (Owners: Owner; Owners/Admins: Member↔Admin) — D-25 overrides the Owner-only drawing until the canvas is updated
- [x] Add people (AddPeople, AddPeopleMember, AddPeopleClient, AddPeopleErrors +JP): suggestions, email tokens, role switch only for Owner/Admin in a workspace channel, Client tag in client spaces, errors; calls store.addPeople; vocabulary: no "invite" in EN copy
- [x] Show only what works (D-19): these replace the hidden controls from M1–M3
- [x] Tests with the fake store; browser check against the boards EN/JP × light/dark
- [x] `pnpm check` green

## Notes
Owns app/channels/ (new), sidebar workspace menu and channel header entry points in app/shell (coordinate: M4-04 owns the profile menu, /settings and /join routes). Re-read App.tsx and locale files before each edit.

## Outcome
Built 2026-11-21 (left in implementing/ for the coordinator).
- **New `app/channels/`:** `ChannelsProvider` (one place that opens New channel, Add people, channel details), `CreateChannel`, `BrowseChannels` (route `/w/:spaceId/channels`), `ChannelDetails` (About: topic edit, Copy link = `origin + channelPath`; Members: role tags, pending people with Copy join link / Send email again / Remove; Settings: notification level; Leave asks only for private), `AddPeople`, `ChannelMenus` (workspace menu, + beside Channels, sidebar Add people row, channel header: name ▾, faces + count, Add people, details), `RoleControl` (profile-card role + MakeOwner), `roles.ts` (who can do what from `snapshot.myRoles`, D-25/D-27).
- **Small edits:** `shell/Shell.tsx` (provider, browse route, header), `shell/Sidebar.tsx` (menus, Add people row), `people/ProfileCard.tsx` (role row read from the channel in view; the card portals into an open dialog so it works from Members), `people/ProfileCardContext.tsx` (`roleEvents`), `ui/Dialog.tsx` (ReactNode title, `className`/`bodyClassName`), `testing/fakeStore.ts` (M4 fakes: unjoined channels, taken/not-allowed, members incl. guest and pending-by-email, setRole rules, addPeople failures, revoke), `dev/FakeApp.tsx` (`?role=owner|admin|member|guest`), `channels.*` strings in en/ja.
- **Roles:** Owners pick Owner/Admin/Member (Owner asks once); Admins pick Admin/Member; nobody switches themselves or an Owner (power-level limit). setRole uses the workspace id. Members list → name opens the card with the role control.
- **Deviations:** Channel Settings has no Name field (no rename in the store contract — needs `renameChannel` from M4-02 + a follow-up). “New client space” hidden until M5. A server refusal in Add people shows “Couldn’t add {name}” (not drawn; small design follow-up). The empty-channel “Add people” button in the timeline isn’t wired (Timeline not in scope).
- **Verified:** 19 new tests (`app/channels/channels.test.tsx`), `pnpm check` green (229 tests, lint, typecheck, locales). Browser: every board state scripted at 1440×900 on `/dev/app`, EN/JP × light/dark, compared with the canvas renders. Not checked: 800/1024 widths, real server.

## Review notes
(CEO)

Lead review: Add people tested against the real server (email chip with Guest tag, role switch, existing ✓, pending person with Copy join link). Open: no channel rename (contract has none); "Couldn't add {name}" state needs a board; empty-channel Add people now wired.
