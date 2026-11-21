---
id: SIDE-07
title: Docs and Boards follow the active space; My issues and All issues across spaces
stage: ceo-review
area: frontend
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-21
owner: side07 session
---

## Goal (CEO)
Mixing every client's boards/pages with Pasodrum's is confusing; category titles aren't enough.
- Main entrance: go to a client space, press Boards/Docs there → only that client space's projects/pages.
- While in Boards/Docs, switching space in the leftmost space switcher shows that space's boards/pages.
- In Pasodrum: workspace items first; all client spaces' items folded into one "Client boards" / "Client pages" group, collapsed by default, expandable.

## Revised goal (CEO, 2026-11-21, replaces the fold)
- Docs and Boards show only the active space (Nordlys → only Nordlys; Pasodrum → only Pasodrum). No space heading in the sidebar.
- My issues: all my issues across every space.
- Staff: see what anyone on the team has on their plate (global, across boards).
- Staff global view = "All issues" list (Fable design pass): every space, grouped by project, top-right face filter, dashed face = nobody. No separate Team list (CEO rejected it).
- All issues only when the Pasodrum tile is lit (CEO); client spaces and clients get My issues only.
- Boards approved 2026-11-22: BoardsAll(+Person, JP, Dark) on the Boards page; DocsPage/BoardsPage now default to the active-space layout (D-42).

## Notes
D-37 already scopes by the selected space tile; this tightens it (switcher drives it, client items folded). Needs design boards first.

## Outcome (2026-11-22)
- **Built (D-42):** Docs and Boards list only the lit space, with no space heading. In Docs/Boards, a space tile stays there and opens that space (or its empty state). Opening a page or project from another space (Activity, chat) moves the lit tile with it. My issues spans every space, with the space named per group. All issues (team, Pasodrum tile only) at `/boards/all`: every open issue across spaces, active space first, late first, face filter plus a dashed "nobody" face, and custom column names on rows.
- **Code:** `app/prefs.ts` (`rememberSpace`, `useLastSpace`, in memory when storage is blocked), `app/places.ts` (`useFallbackSpace`), `app/shell/Rail.tsx` (tile stays in feature pages), `features/docs/{model,DocsColumn,DocsScreen}`, `features/boards/{model,BoardsColumn,BoardsScreen,Lists,icons,locales}`, `matrix/docsBoardsTypes.ts` (`scopeOf` removed). New tests: `features/boards/model.test.ts` (`allGroups`).
- **Checked:** `pnpm check` green. Browser against the local stack (JP, dark and light): Pasodrum shows its projects plus My issues/All issues; the All issues face filter and nobody filter; the Nordlys tile in Boards and Docs stays and shows Nordlys only (Docs empty state); a deep link back to a Pasodrum project re-lights Pasodrum. EN not clicked through (only new string: `allIssues`).
- **Review:** must-fix pass found nothing must-fix; one borderline item (blocked storage) fixed.
- **Left:** an EN pass in production after deploy.
