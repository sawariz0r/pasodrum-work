---
id: SIDE-07
title: Docs and Boards follow the active space; My issues and All issues across spaces
stage: implementing
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
- Boards: Discovery section "SIDE-07" (DocsSpace*, BoardsSpace*, BoardsMineAll*, BoardsAll*).

## Notes
D-37 already scopes by the selected space tile; this tightens it (switcher drives it, client items folded). Needs design boards first.
