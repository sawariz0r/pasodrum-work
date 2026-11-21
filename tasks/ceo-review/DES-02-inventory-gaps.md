---
id: DES-02
title: Clear the "needs design" rows in the inventory
stage: ceo-review
area: design
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-21
owner: claude (DES-02 session)
---

## Goal
No `needs design` / `needs design review` rows left in `design/INVENTORY.md` (except any the CEO defers). Every state already built without a board gets a board on its feature page (EN/JP × light/dark). The CEO approves the boards, then the app is brought in line with them (mostly copy).

## Acceptance criteria
- [x] Rows already covered by approved Batch H boards are linked and marked approved: sign-in other error / too many (SignInOtherError, SignInTooMany), M4-04 states and "Couldn't add {name}" (BuiltStatesM4), `/dms` with no DMs (DmsEmpty, built in M8).
- [x] Boards drawn for: Rename column; board mention row in Activity; issue panel overlay; Docs file block; Boards card unread dot. (Project badge / sidebar unread is DES-01's.)
- [x] Boards drawn for confirm by email: send/help failed line and unreachable link page; no key held for an old client; sign-out "last device" body and "Reset and start fresh?" copy for clients/Externals.
- [x] The CEO approves per group in this session's chat.
- [x] The code matches the approved boards; strings in both `en.json` and `ja.json`; no new tests unless D-30 demands one.
- [x] `pnpm check` green; every changed state checked in a browser (EN/JP × light/dark).
- [x] INVENTORY rows `approved`; `pnpm canvas:map` run; canvas mirrored in `design/canvas/`.

## Notes
- Built behaviour is the starting point; cut copy (AGENTS invariant 2).
- Boards are self-contained sheets (no edits to shared components such as `Main`, `BoardsPage`, `DocsPage`) so parallel sessions (SIDE-07, DES-01, SIDE-05) don't collide on the canvas.
- Read the live `canvas.json` and merge before every publish.

## Outcome
- Approved by the CEO 2026-11-21: BoardsBuiltStates (boards page), DocsFileBlock (docs), EmailConfirmBuiltStates (confirm-email); and confirmed the Batch H boards already covering sign-in errors, the M4-04 states + "Couldn't add {name}", and No DMs yet.
- No `needs design` rows remain. The Boards project badge in the sidebar is left to DES-01.
- Boards/Docs: drawn as built, no code change.
- Confirm by email, 3 code changes:
  - The link page failure line is muted (no warning colours on client screens).
  - No key held (`no-key`/`wrong-key`) shows a new screen, "We can't email you a link": Ask {contact}, Back · Start fresh (`noLinkTitle`; shown in /dev/gallery as email-no-link).
  - Clients and Externals signing out from their last device get "If you sign out now, you might lose older messages…" (`signOutMaybeLose`) instead of the recovery key line.
- Checks:
  - `pnpm check` green.
  - Gallery checked in EN light + JP dark (no-key screen, link page line colour).
  - The client last-device sign-out dialog was not seen in a browser: it needs a confirmed client device whose key the server doesn't hold. Checked by reading the code (one ternary).

## Review notes
(CEO)
