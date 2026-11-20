---
id: M5-02
title: UI: new client space, space settings/people/remove/archive, outside mark, client & guest shells
stage: todo
area: frontend
milestone: M5
priority: P0
slice: false
depends_on: [M4-03]
created: 2026-11-21
owner:
---

## Goal
Build the Batch E boards against the fake store; works unchanged against the real store when M5-01 lands.

## Boards (design/canvas/, approved)
RulesM5 (read first) · CreateClientSpace(+JP), ClientSpaceCreating, ClientSpaceNameTaken, ClientSpaceCreateError, ClientSpaceCreated · ClientShell, ClientShellMenu, ClientShellJP, ClientShellDark · GuestShell, GuestShellJP · ExternalChannel, ExternalClientSpace, ExternalDM, ExternalJP, ExternalDark · ClientSpaceMenuAdmin, SpaceSettings(+JP), SpacePeople(+Dark), RemoveFromSpace(+JP), ArchiveSpace, ArchivedSpace

## Acceptance criteria
- [ ] New client space from rail + / sidebar +, Owners/Admins only; creating pulse, name taken, error → Retry, created (land in first channel, tile pops in)
- [ ] Tile colour from `Space.colour`; archived tile dims and sorts last
- [ ] Client space menu (admin) → Client space settings: General (name, colour saves on change, Archive), People (team, client, pending with clock), Remove (asked once, lists the channels they leave)
- [ ] Archived: composer replaced by one quiet bar; Unarchive for Owners/Admins
- [ ] Outside mark: header after channel/DM name (accessible name lists the outside people, click opens Members), beside Send with faces, sidebar rows of workspace channels with outside people; never for clients/guests
- [ ] Client and guest shells exactly as RulesM5's table (rail, sidebar, space menu, New message scope, profile menu)
- [ ] EN/JP, light/dark match the boards; strings in both locale files; tests in the touched folders
- [ ] `pnpm check` green; browser-checked against the fake backend
