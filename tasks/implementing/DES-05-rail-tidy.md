---
id: DES-05
title: Rail tidy — archived client spaces leave the rail; theme into the profile menu, Activity takes its slot; delete a client space
stage: implementing
area: design
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-22
owner: DES-05 session (Claude)
---

## Goal (CEO)
A. "An Archived client space is gray and visible in the sidebar as well, it shouldn't."
B. "Move Light mode icon into the Profile popout menu and replace it with activity? We can remove the text under 'activity' so it's just the icon."
C. "We should be able to delete or archive a space." (added 2026-11-22 via the lead)

## Design
Approved 2026-11-22 (CEO, in the DES-05 chat: "Yes, build"), canvas v93.
Canvas Discovery, section "DES-05 · Rail tidy · for approval" (canvas v90) and "DES-05 C · Delete a client space · for approval" (v91). Groups approve separately.
- **A** — TidyArchivedMenu, TidyArchivedList, TidyArchivedListJP, TidyArchivedOpen.
  - Team: an archived client space has no rail tile, except while you view it (dimmed tile, gone once you navigate away; CEO v93).
  - Owners/Admins: Pasodrum menu, after a divider: New client space + "Archived client spaces" (only when one exists) → a list like Browse's Archived: tile, name, people, Unarchive, and a bin (Owner only) that opens the delete confirm. Click a row = the approved read-only ArchivedSpace view.
  - Clients: unchanged (their own space keeps its tile).
- **B** — TidyRail, TidyProfileMenu, TidyProfileMenuJP, TidyActivityJP, TidyClient.
  - The theme icon leaves the rail. The profile menu gets a Light | Dark row under Language (same segmented style).
  - Activity moves to the theme's slot above the avatar: icon only, unread badge kept, highlighted when you're on Activity. Home, DMs, Docs and Boards keep their labels.

- **C** — TidyDeleteSettings, TidyDeleteSpace, TidyDeleteSpaceJP, TidyDeleteSettingsJP (v92).
  - Owner only, archived client space only (archive first, delete second). Pasodrum can never be deleted.
  - Client space settings → General shows a red "Delete client space" in Archive's place (CEO: settings, not the menu). The confirm dialog shows the space card and one line ("Its channels and everyone's access go. This can't be undone."). Typing the space name arms Delete. Afterwards you land on Pasodrum.
  - Under the hood (to plan): kick everyone, tombstone the space and its channels, drop it from every account's `work.pasodrum.spaces`, revoke its pending invite links. Say what Matrix can't erase (copies on devices, server history without an admin purge).

## Acceptance criteria
- [ ] Rail: no tile for a space with `archived` when you're team; client's view unchanged.
- [ ] Pasodrum menu (Owner/Admin, only when ≥1 archived client space): Archived client spaces → list; row opens the space; Unarchive works from the list.
- [ ] Rail: no theme toggle; Activity icon-only above the avatar with badge and `aria-label` incl. count; current state on /activity.
- [ ] Profile menu: Light | Dark row (MenuSegments), reflects the resolved theme.
- [ ] Delete: Owner only, archived client space only; typed name arms it; the space, its channels and members' access go; pending links are revoked; other spaces are untouched.
- [ ] Tests (D-30): a non-Owner can't delete; Pasodrum can't be deleted; other spaces stay intact.
- [ ] Strings in `en.json` + `ja.json`; `pnpm check` green; browser check EN/JP × light/dark, Owner and client.

## Outcome
Split (CEO: "no over engineering"): **A + B ship first** (this commit); **C (delete) follows** after its review fixes and a Codex review.
- **B:** `app/shell/Rail.tsx`: theme button gone; Activity icon-only above the avatar, with badge, count label and current state. `app/shell/ProfileMenu.tsx`: Light | Dark `MenuSegments` under Language, new `ThemeIcon`.
- **A:** `Rail.tsx` hides a team member's archived client spaces, except the one being viewed (dimmed). `app/channels/ChannelMenus.tsx`: divider + "Archived client spaces" (Owner/Admin, only when one exists). New `app/channels/ArchivedSpaces.tsx`: tile, name, people count, Unarchive. The Owner's bin comes with C.

## Review notes
- Browser (local stack, Sofia = Owner, EN/JP × light/dark): theme row; icon-only Activity, highlighted on /activity; archived tile dimmed while viewed, gone after leaving; Pasodrum menu divider + Archived client spaces; list with Unarchive. Clients aren't in the workspace, so the rail filter doesn't touch them.
