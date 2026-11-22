---
id: OPS-01
title: Clear test accounts off production
stage: ceo-review
area: infra
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-22
owner: ops01 session
---

## Goal (CEO)
On pasodrum.work keep only Oscar, Shiori and one test client in Nordlys. Everything else goes.
Scope added (CEO, 2026-11-22): "emptying #general in pasodrum etc as well. So we have a clean slate." Keep Shiori's welcome pages and the Pasodrum tasks (workspace Boards project).

## Acceptance criteria
- Dry run lists every account seen on production, marked KEEP / REMOVE; CEO says yes in the session chat before anything is applied.
- Removed accounts are deactivated (no erase unless the CEO asks); their open invite codes are revoked.
- Oscar, Shiori, the `@pasodrum` system account (D-38) and the kept client are untouched.
- Second dry run finds nothing left to remove; `/_matrix/client/versions` 200, `/api/invites` 401; the kept client can sign in.
- AGENTS.md §5 and PHASES.md say production is no longer seeded and what is left there.

## Notes
- Dry run 2026-11-22 (read-only, as the seed accounts): seed accounts sofia, ingrid, jonas, tanaka, henrik_nordlys.no, lea_freelance.dev all sign in; `oscar+test_prpl.se` exists (removed from Nordlys by Oscar); Oscar is the server admin (D-18), sofia created every seeded room (room v12 creator) but Oscar holds 100 in all of them; no open invite codes in any room.
- A full account list needs the admin room (`!admin users list-users`), which only Oscar can use; the survey covers every account that shares a room with a seed account.
- Method: each seed account deactivates itself with the standard API (`/account/deactivate`, seed password from the gitignored seed file). Accounts whose password we don't hold need `!admin users deactivate <id>` from Oscar.
- Room survey 2026-11-22: Pasodrum #general (23 msgs), #design, #lead, 汐里✨ (archived); Nordlys #project-updates (2), #questions, page "Test" (Henrik), project Meter portal; 5 DMs with test accounts; Probe board and 日本語チャンネル (Sofia alone). KEEP: welcome pages (EN/JP) and project "Pasodrum work" (2 issues assigned to Sofia).
- Proposed clean slate: retire old rooms (unlink from the space, remove every member) and create fresh empty channels by the app's defaults (Pasodrum #general; Nordlys #project-updates, #questions). Matrix never deletes history; retired rooms keep their events on the server with nobody in them.
- Never run `pnpm dev:seed` against production again.

## Outcome
Applied 2026-11-22 after the CEO's yes in this session's chat ("Yes, all three": plan A replace channels, keep the Nordlys space, keep Henrik). 73 writes, all OK.
- **Deactivated (no erase):** sofia, ingrid, jonas, tanaka, lea_freelance.dev. All now get `M_USER_DEACTIVATED` at sign-in.
- **Kept:** Oscar, Shiori (account untouched; moved from the old channels into the new ones, invites pending until she opens the app), `@pasodrum`, Henrik (signs in; in Nordlys + both new channels).
- **Rooms:** new empty Pasodrum #general and Nordlys #project-updates + #questions, levels Oscar 100 / Shiori 50. Old #general, #design, #lead, #project-updates, #questions, Meter portal, page "Test" and the 3 DMs the test accounts started are unlinked and empty. 汐里✨ is unlinked only (Oscar made it, so only he can leave it).
- **Kept content:** welcome pages EN/JP, project "Pasodrum work" (2 issues reassigned Sofia → Oscar). Lea's External record cleared.
- **Invite service:** revoke-all ran for all 6 removed IDs (no open codes existed). Stored confirm keys can't be listed or deleted over the API. Any left for Lea stay sealed and can't be released (she has no live session).
- **Second dry run:** no seed account left active; `/_matrix/client/versions` 200, `/api/invites` 401, `#workspace` alias resolves; Nordlys hierarchy = Nordlys, project-updates, questions; no pages left in Nordlys. The workspace side couldn't be read without Oscar's or Shiori's session, so it's checked by the apply log only. Browser check skipped (Chrome not signed in; no passwords typed on production).
- **Left for Oscar:** `!admin users deactivate @oscar+test_prpl.se:pasodrum.work` in the admin room; leave 汐里✨ and the 2 DMs he started (Ingrid, Tanaka).
- Docs: AGENTS.md §5 (no seeding/probe on production; what's left), PHASES.md, DECISIONS learning.
