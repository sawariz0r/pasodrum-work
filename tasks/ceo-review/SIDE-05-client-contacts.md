---
id: SIDE-05
title: Client contacts — staff responsible for a client space ("For Nordlys, Oscar is the main contact")
stage: ceo-review
area: fullstack
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-21
owner: side05 session (Claude)
---

## Goal (CEO)
Assign one or more staff as a client space's main contact(s). They are who "Need help? Ask <name>" (D-38) points to, instead of "whoever invited the client". Room to grow later into broader "client ownership" (e.g. who gets client notifications, who approves, who's shown first to the client).

## Notes
- Store as space state in the client space (e.g. `work.pasodrum.space` `contacts: [userId]`, Owner/Admin to edit), so the invite service's help lookup can read it.
- UI: Client space settings → People: mark contacts; the client sees the contact's face on help pills.
- Needs design boards first.

## Outcome
- **Boards approved 2026-11-21** (SpaceContacts, SpaceContactsJP, SpaceContactsDark, SpaceContactsJPDark, ContactHelpPill), on the canvas page Client spaces & guests. Decision: D-43.
- **Data:** `contacts: [userId]` on the client space's `work.pasodrum.space` (absent when empty). The server already limits that event to Owners/Admins (level 50); no migration.
- **App:** `Space.contacts` + `setMainContact(spaceId, userId, on)` (matrix/, fakeStore). People tab: "Main contact" tag, ⋯ Make / Remove as main contact on Staff rows incl. your own. Marking someone who sits at level 0 in the space (added by Staff) lifts them to staff level there, so the help lookup counts them.
- **Invite service:** help names the first main contact still in the space at ≥ Staff and DMs every one of them; with none, unchanged (inviter, else top Owner/Admin).
- **Tests (D-30):** m5.integration "a Member can't set main contacts…" (raw PUT 403 + `not-allowed`, Owner can mark/unmark, other keys kept); confirm.integration "help goes to the main contact, not the inviter".
- **Checks:** `pnpm check` green (346 tests); `pnpm test:invite` 21/21; `pnpm test:matrix m5`: new test passes, 5 older m5 tests fail the same way on the unchanged base commit (stale local server data). Browser (local stack, Sofia as Owner): tag, menus, own row, EN/JP × light/dark match the boards; a client's `/confirm/me` followed the mark (Ingrid → Sofia).

## Review notes
- Must-fix review: 1 finding (a level-0 colleague could be marked but never reached) — fixed in `setMainContact`.
- Not fixed (edge): help links created before deploy stored up to 5 admins; for their 24 h window link-page help now DMs all of them.
- Local dev: the help tests need `SYSTEM_PASSWORD` in dev/.env matching the existing system account.
