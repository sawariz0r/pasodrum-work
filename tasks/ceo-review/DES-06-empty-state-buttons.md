---
id: DES-06
title: One button and layout for the Docs and Boards empty states
stage: ceo-review
area: design
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-22
owner: des06 session
---

## Goal (CEO)
"why does the No projects yet + button and the Docs No pages yet + button differ in button sizes etc?" Make both empty states use one button and one layout.

## Findings (2026-11-22)
The approved boards themselves differ; the code matches each board.

| | Docs "No pages yet" (DocsNone) | Boards "No projects yet" (BoardsNoProjects) |
|---|---|---|
| Button height / radius | 36 / 9 (= `ui/Button` md) | 40 / 10 (custom) |
| Font | 14/600 | 15/600 |
| Padding / icon gap | 11 left, 14 right / 6 | 15 left, 18 right / 8 |
| Title → button | 20 | 22 |
| Tile, title, icon | 64 tile, 22 title, 16 plus | same |

Code: `features/docs/Docs.module.css` `.noneButton` and `features/boards/Boards.module.css` `.emptyButton` override `ui/Button`. The DMs empty state (`app/pages/Pages.module.css` `.dmsEmptyButton`) copies the Boards 40px button too (out of scope here; it lives in the shared Main board).

## Proposal (canvas v95, Discovery "DES-06 · Empty-state buttons · for approval")
Both use the plain `ui/Button` md (36, radius 9, 14/600, padding 16, gap 7) with no overrides; tile → title → button 20 apart. 8 CHANGED boards: EmptyStateDocs/Boards × EN/JP × light/dark. Canvas components gained a `des06` prop (default off, approved boards unchanged).

## Acceptance criteria
- CEO approves the Discovery boards in chat.
- Docs and Boards empty states render the same button and spacing, from one shared `ui/` piece; the per-feature button and layout styles are deleted.
- `pnpm check` green; browser check of both empty states side by side, EN/JP × light/dark; before/after screenshot to the CEO.
- After approval: boards move to the Docs/Boards pages, replacing DocsNone(+JP) and BoardsNoProjects(+JP); `des06` default flips to on.

## Outcome
Built 2026-11-22, waiting on the CEO's approval of the Discovery boards (not pushed).
- New `ui/EmptyState` (tile, title, action slot, `children` for the drawer toggle). Docs `NoPages` and Boards `NoProjects` use it with a plain `<Button icon>` (md). Deleted `.none/.noneTile/.noneTitle/.noneButton` (Docs) and `.empty/.emptyIcon/.emptyTitle/.emptyButton` (Boards); the JP letter-spacing rule moved into `ui/EmptyState`. Boards title is now an `h1` like Docs.
- Browser check on the local stack (sofia, client space with no pages/projects), EN/JP × light/dark: both buttons measure 36 high, radius 9, 14px, padding 16, gap 7; tile → title → button 20/20. Before/after image in the session notes folder (`DES-06-before-after.png`).
- `pnpm check`: typecheck, lint, locales green; unit tests 356/356 green with `--testTimeout=30000` (default 5 s timed out at random under load average ~58 from parallel sessions).
- After approval: move the 8 boards to the Docs/Boards pages replacing DocsNone(+JP) and BoardsNoProjects(+JP), flip `des06` default on, mark the INVENTORY row approved.
- Follow-up: DMs empty state (`.dmsEmptyButton`, 40px) and NotAvailable (`.unavailableAction`, 38px) still differ; could use `ui/EmptyState` too.
