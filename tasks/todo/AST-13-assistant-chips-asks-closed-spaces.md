---
id: AST-13
title: Assistant — chips, suggested asks and the words for a closed client space
stage: todo
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [AST-08, AST-03]
created: 2026-11-23
owner:
---

## Goal
Build what AST-03's board draws for the screens slice 1 already covers, so the panel is no longer silent where it has nothing drawn. Part of SIDE-14.

## Design gate
Every row of AST-03's board that this task builds must be `approved` in `design/INVENTORY.md` first.

## Acceptance criteria
- [ ] Chips for a thread and an Activity item
- [ ] Up to three suggested asks for a channel, a thread and an Activity item, in `features/assistant/asks.ts`, English and Japanese; the empty panel shows them above the ask box
- [ ] What the panel says in a client space it may not read (D-53), for both reasons: the client has not consented, and the space has no mark yet. Shown from the app's own view of the two state events; the server stays the judge ([the spec, §3.2](../../docs/specs/assistant.md)).
- [ ] The working line changing in place; "and N more" in the "Looked in" list
- [ ] The Japanese and dark variants the board adds, checked in the browser

## Notes
- The DM chip arrives with AST-14.
- Until this ships, those screens give a chip only where one is drawn, and a closed client space gives none.

## Outcome

## Review notes
