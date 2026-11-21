---
id: E2-01
title: Channel rename and archive (Batch E2)
stage: ceo-review
area: frontend
milestone: M5
priority: P1
slice: false
depends_on: [M6-01, M6-02]
created: 2026-11-21
owner: e2-build session
---

## Goal
Build Batch E2 (approved 2026-11-21; read `design/canvas/RulesE2.dc.html` first). Start after M6 is committed (it touches `store.ts`, channel details and Browse).

## Contract (lead adds before the build)
- `Channel.archived?`, `JoinableChannel.archived?`, a "may manage this channel" flag (Owner/Admin/creator; never `#general`)
- `renameChannel(channelId, name)` → `name-taken` / other; `setChannelArchived(channelId, archived)` (D-28 levels per channel; unarchive restores D-27)

## Acceptance criteria
- [x] Channel details → Settings: Name (inline Save, rules as New channel, taken, error→Retry), Archive card; members see Notifications only
- [x] Rename row in the timeline (pencil), archive row (box)
- [x] Archived: quiet bar + Unarchive for those allowed, no reactions/add-person, leaves the sidebar, Browse → Archived group with Unarchive
- [x] `#general` never offers rename/archive; client-space home = first non-archived channel
- [x] EN/JP, light/dark; tests only for permission gating (D-30); `pnpm check`; browser check

## Outcome
Built end to end; not committed (the lead commits and pushes).

- **Store** (`matrix/store.ts`): `renameChannel` (checks names over the space hierarchy plus my channels, then `m.room.name`; `name-taken` / `not-allowed`) and `setChannelArchived` (D-28 levels via `archivedLevels`, then `work.pasodrum.channel {archived}`. If the flag write fails, the levels are put back. Also sets `work.pasodrum.archived` on the channel's `m.space.child`, so Browse can show an archived channel to people who never joined it). The snapshot gets `archived` from the state flag and `manageable` from our own power math (may send `m.room.name` and power levels, so the creator counts in room v12; never a channel named `general`). Timeline rows come from `m.room.name` changes (not the first name) and from changes to the flag. Add people's home channel (`homeOf`) skips archived channels. Unarchiving a client space leaves its separately archived channels archived. Unarchiving a channel inside an archived client space keeps its levels archived.
- **UI**: Channel details → Settings has the Name field (Save inside the field, Enter saves, Escape restores the name, taken ring, error → Retry, check on save) and an Archive / Unarchive card. Members get Notifications only. Archive asks once (ArchiveChannel). Pencil and box rows appear in the timeline. `ArchivedBar` and `useArchived` now cover archived channels as well as archived client spaces (bar, read-only hover and reactions, thread panel). Archived channels leave the sidebar and rail attention, and lose Add people (header, empty state, members tab, sidebar row). Browse lists them last under Archived, with Unarchive for those allowed. `spaceHome` skips archived channels, so a client space's home is its first non-archived channel.
- **Tests (D-30)**: `channels.test.tsx`: Owner sees Name + Archive, `#general` neither, Member sees Notifications only. `matrix/e2.integration.ts`: who may manage (Admin, creator, not a Member, never #general), plus rename, archive, unarchive against the local server (Member gets 403 while archived, the levels come back exactly to D-27, Browse flag and both timeline rows show). `pnpm check` is green. In the full `pnpm test:matrix`, workspace/m3/m4/m5 fail because of leftover state on the local server (a "Fjord Bank" client space, an undecryptable message in #lead), not because of E2.
- **Browser check** on the local server as Ingrid (Admin): rename (taken, saved), archive dialog, archived view, Browse → Archived, archived Settings and unarchive, in EN dark and JP light. Not checked in the browser: the Member view (the tests cover it). Left on the local server: a scratch channel `#design-crit`.

## Review notes (deviations from the boards)
- Hover on an archived channel keeps what archived client spaces already keep: thread, More (Copy text, Copy link) and read-only feature actions such as Translate. The board shows Copy link only.
- Browse → Archived: the channel name is the click target, not the whole row. Opening a channel I'm not in joins it first (needed to read it).
- `.action.danger` now colours the label as well as the icon, which matches the canvas. This also changes Leave channel and Archive client space, which were off-canvas before.
- Rename/archive rows by someone else read "{name} renamed…" / "{name} archived the channel" (JP 〜さんが…). The board only spells out the "You" form.
