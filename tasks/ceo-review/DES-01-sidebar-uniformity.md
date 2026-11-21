---
id: DES-01
title: Uniform sidebar items across Home, Docs and Boards (padding, sizes, states)
stage: ceo-review
area: design
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-21
owner: DES-01 session (Claude)
---

## Goal (CEO)
Sidebar rows under category headings differ between Boards, Docs and Home (padding and other details). Make them one component with one spacing, typography and hover/active/unread treatment. Canvas first (one rules board + before/after), then align the code.

## Design
Approved 2026-11-21 (CEO, in the DES-01 session chat): SidebarRowRules, SidebarRowsHome, SidebarRowsDocs, SidebarRowsBoards (canvas page Overview & foundations, section "Sidebar rows"). Selected row: option B, quiet grey. Decision D-41.

## Outcome
- One shared row + heading in `ui/SideRow.tsx` / `ui/SideRow.module.css` (`sideRow` classes + `SideHeading`), used by Home (`app/shell/Sidebar.tsx`), Docs (`features/docs/DocsColumn.tsx`) and Boards (`features/boards/BoardsColumn.tsx`). Duplicated row/heading CSS deleted from `Shell.module.css`, `DocsColumn.module.css`, `Boards.module.css`.
- Rows: 30 high, 10 px sides, 16 px icon slot, names start at 44 px in all three columns, 14.5 regular, muted at rest, ink semibold + badge when unread. Docs sub-page chevron moved to the end of the row (sibling button, not inside the link); nesting 18 px per level. Boards: My issues is a normal row with a quiet count; project swatch in the icon slot. Headings = Home's (13 semibold, chevron 12, + button 24).
- Columns 248 wide everywhere (260 overrides removed); title row 58 like Home.
- `--sideactive` / `--onsideactive` → quiet grey / ink (light `#e4e1da`/`#1d1c22`, dark `#303037`/`#ecebf0`); also applies to the Settings nav.
- Not touched: SIDE-07's scoping/fold logic (only row/heading JSX + imports changed in DocsColumn/BoardsColumn).

## Review notes
- `pnpm check` green (typecheck, lint, 346 tests, locales); web build OK.
- Browser (local stack, seeded `ingrid`): Home, Docs, Boards measured by script — width 248, head 58, every row 30 high, names at x=44 (Docs nested 62, DMs 46 by design), 14.5 px; selected row grey/ink. Checked EN dark, EN light, JP light (Boards, Docs) and the Settings nav. Docs chevron opens/closes sub-pages. Docs drag-and-drop not exercised by hand (code path unchanged; review checked DropLine maths).
- Must-fix review (Opus): no findings.
- Canvas: older boards (Main, DocsPage, BoardsPage…) still draw the old rows/green selection; SidebarRowRules wins (noted in INVENTORY and D-41).
