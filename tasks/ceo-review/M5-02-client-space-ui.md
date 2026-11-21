---
id: M5-02
title: UI: new client space, space settings/people/remove/archive, outside mark, client & guest shells
stage: ceo-review
area: frontend
milestone: M5
priority: P0
slice: false
depends_on: [M4-03]
created: 2026-11-21
owner: claude-ui-session
---

## Goal
Build the Batch E boards against the fake store; works unchanged against the real store when M5-01 lands.

## Boards (design/canvas/, approved)
RulesM5 (read first) · CreateClientSpace(+JP), ClientSpaceCreating, ClientSpaceNameTaken, ClientSpaceCreateError, ClientSpaceCreated · ClientShell, ClientShellMenu, ClientShellJP, ClientShellDark · GuestShell, GuestShellJP · ExternalChannel, ExternalClientSpace, ExternalDM, ExternalJP, ExternalDark · ClientSpaceMenuAdmin, SpaceSettings(+JP), SpacePeople(+Dark), RemoveFromSpace(+JP), ArchiveSpace, ArchivedSpace

## Acceptance criteria
- [x] New client space from rail + / sidebar +, Owners/Admins only; creating pulse, name taken, error → Retry, created (land in first channel, tile pops in)
- [x] Tile colour from `Space.colour`; archived tile dims and sorts last
- [x] Client space menu (admin) → Client space settings: General (name, colour saves on change, Archive), People (team, client, pending with clock), Remove (asked once, lists the channels they leave)
- [x] Archived: composer replaced by one quiet bar; Unarchive for Owners/Admins
- [x] Outside mark: header after channel/DM name (accessible name lists the outside people, click opens Members), beside Send with faces, sidebar rows of workspace channels with outside people; never for clients/guests
- [x] Client and guest shells exactly as RulesM5's table (rail, sidebar, space menu, New message scope, profile menu)
- [x] EN/JP, light/dark match the boards; strings in both locale files; tests in the touched folders
- [x] `pnpm check` green; browser-checked against the fake backend

## Outcome
Built against the M5 contract on the fake store. Nothing in `matrix/` or `types.ts` was touched, and the contract needed no change.

- **New client space** (`channels/NewClientSpace.tsx`): opened from the dashed rail **+** (after the tiles), the **+** beside Client spaces in the sidebar, and the workspace menu (Browse · New channel · Add people · New client space). Owners and Admins only. The left column is a live preview tile with the white ring and amber corner. It has name + five swatches, the channel chips (project-updates and questions on, design-review off, dashed **+** adds one inline), the team (you, then **+** searches `searchPeople`, team only) and client email chips (Enter or `,`, IME-safe; Backspace removes the last one). Name taken: the check is case-insensitive and trimmed over the client spaces you can see, plus a server `name-taken` reject. It shows a red ring, one line, and Create turns off. While creating: the three-dot pulse, fields at 60 %, `aria-busy`. On failure: one line in the footer and Create becomes Retry. When done: the dialog closes, you land in the first channel, and the new tile pops in once (`markFreshSpace`).
- **Tiles**: colour comes from `Space.colour` (`spaceColour()` in `channels/shared.tsx`, used by the rail, sidebar chips and `SpaceMark`). Archived tiles show at 50 %; they sort last through the store's order.
- **Client space settings** (`channels/SpaceSettings.tsx`): opened from Space menu → Client space settings (Owners/Admins in a client space; the menu is Browse · New channel · Add people · Client space settings). **General**: the name saves on blur or Enter (taken check), the colour saves on click, and Archive client space opens the confirm. **People**: Add people, then the workspace (logo) group, then the client group (space tile). Pending people get the dashed clock face. Owner, Admin and Pending tags show. ⋯ gives Message / Copy join link / Send email again (when an invite matches) and Remove from {space}. **Remove** asks once: avatar with corner, email (from `profile`), and chips for the channels they leave (from `channelMembers` of the space's channels). **Archive** asks once: tile, name and face pile.
- **Archived** (`timeline/ArchivedBar.tsx`): the composer becomes one quiet bar ("{space} is archived"). Owners and Admins also get Unarchive there. In an archived space, New channel, Add people (menu, sidebar, header, empty state) and the **+** beside Channels are hidden.
- **Outside mark** (`channels/OutsideMark.tsx`): an amber mark after the channel name (a button that opens Members) and after a DM title (an image, since a DM has no Members). Beside Send it shows the mark plus up to 3 faces (channel: a button to Members; DM: an image; not in the thread composer). On sidebar rows it marks workspace channels only. The accessible name is "Includes people outside Pasodrum: {names}". The mark comes from `Channel.outside` and, for DMs, `Person.external`, so clients and guests never see it. Channel members lists now show the amber corner on clients and guests.
- **Shells** (RulesM5 table): clients get one tile, a space menu with only Browse channels, no **+** beside Channels, no Add people and no client spaces. Guests get the workspace name as a plain heading and no **+**. Client spaces in the sidebar are team-only. New message scope is the server's (`searchPeople`). The profile menu belongs to M5-03.
- **Fake/dev**: `createFakeStore({ perspective: 'client' | 'guest' })` serves what the server would show a client (Henrik: Nordlys only) or a guest (Ola: #design, #launch-site). `/dev/app?as=client|guest` turns it on. `ui/Dialog` gained an `aside` slot (the dialog's preview column) and `busy`.
- **Strings**: a new `spaces.*` namespace in `en.json` and `ja.json`.
- **Tests**: `channels/clientSpaces.test.tsx` (9 tests), `shell/shells.test.tsx` (3), `timeline/archived.test.tsx` (2), `composer/outside.test.tsx` (2). `pnpm check` is green: 259 tests, locales ok.
- **Browser check**: `/dev/app` on the fake backend at 1440×900, on a second Vite server with HMR off because the other sessions' edits kept reloading the shared dev server. Covered: create (taken, creating, error → Retry, land), menu → settings (colour live in the rail), People, Remove confirm and result, Archive → bar → Unarchive, the outside mark (header, composer, row, Members), client shell, guest shell, and JP + light (dialog and taken state). Dark is the pane default and was used for the rest.

Deviations / notes for review:
- The canvas says "Color" in the create dialog's (aria-only) radiogroup label and "Colour" in settings. Both are kept as drawn.
- `spaces.outside` says "Pasodrum" literally (it matches the canvas, and JP has no workspace slot, so the parity check forbids interpolating it).
- In the fake, the pending person in a new space's settings has no Copy join link, because the fake keeps invites per channel only for #design. The real store's `pendingInvites(home)` fills it.

Follow-ups done (lead's request):
- **Archived, read-only everywhere**: `useArchivedSpace(channelId)` lives in `timeline/ArchivedBar.tsx`. The thread panel shows the same bar in place of its composer. The hover bar keeps only Reply in thread and the More menu's Copy text / Copy link (Add reaction, Reply, Edit and Delete are gone). Reaction chips are read-only (`aria-disabled`, they still show who reacted) and have no add button.
- **Focus after menu-opened dialogs**: `ui/menuFocus.ts`. `MenuItem` remembers its menu's trigger on select. `ui/Dialog` (and Settings' own Radix dialog, via `useMenuReturnFocus`) puts focus back on that trigger when it closes, instead of on `<body>`. The tests are `ui/menuFocus.test.tsx` and the Settings / Another app cases in `shell/shells.test.tsx`; the generic one fails without the fix. Not re-checked in a browser.

Review fixes (Fable 5.2 review + CEO call on team chips):
- Team chips have no × (CEO: match the canvas). Backspace in the empty team search still drops the last one added.
- **Role leak**: `useShowExternal()` now checks my roles (Owner/Admin/Member anywhere), not `me.external`, which the real store never sets. The fake client and guest views no longer set `me.external`, and a test (group DM with another client) fails under the old check.
- **Escape**: `ui/Dialog` stays open when Escape comes from an element marked `data-claims-escape`. This covers the inline channel field, the team search and the role menu in Members.
- **Creating**: Cancel, the close button and Escape are off while the space is being made.
- **Remove**: offered only where allowed (`canRemoveFromSpace`: Owners remove anyone else; Admins never Owners or Admins). The confirm lists every channel of the space (joined + `browseChannels`). Pending people's invites are matched with `isInviteFor` (now in `shared.tsx`) across all the space's channels.
- **Client emails**: pasted or typed lists split on comma, space, semicolon and newline (the paste is handled before the text field drops line breaks). Duplicates are ignored case-insensitively. A leftover non-address shows the red ring plus "… isn’t an email address", and keeps Create off.
- **Archived**: General hides Archive client space; the Members tab hides Add people.
- **Message** from space People or channel Members closes the dialog.
- **Tile pop-in**: marked by name before `createClientSpace` resolves, used once by the tile; tested.
- **Rename**: saves once (Enter then blur doesn't save twice). Escape saves an unsaved edit as the dialog closes. A failed save shows "Couldn’t rename to {name}" (new key `spaces.renameFailed`).
- **a11y**: team search has `aria-activedescendant` and option ids, and `aria-controls` only while the list shows. Colour swatches are one tab stop with arrow keys moving the choice.
- 12 new tests in `channels/clientSpaces.test.tsx`. `pnpm check` is green with 279 tests. Browser pass: create dialog (no team ×, Escape in the inline channel field keeps the dialog) and rename-on-Escape (saved, focus back on the space menu button).

