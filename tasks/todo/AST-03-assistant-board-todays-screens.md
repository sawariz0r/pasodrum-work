---
id: AST-03
title: Assistant — one small board for today's screens (design)
stage: todo
area: design
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-23
owner:
---

## Goal
Draw what the approved Assistant boards show only with Time data, so the UI for channels, pages and issues can pass the design gate (D-54, call 4). About 2 hours of design, then the CEO's approval. Part of SIDE-14.

## Acceptance criteria
- [ ] Chips for: a thread, a DM, an Activity item, a page, a project, an issue, My issues, All issues (only the channel and "this message" chips are drawn today)
- [ ] Up to three suggested asks for each screen that exists today, in English and Japanese: channel, thread, DM, Activity, page, project, issue, My issues, All issues. Report 1, §2 has English drafts.
- [ ] The New issue proposal card and its done row
- [ ] What the panel says about a client space it may not read (D-53): a client who has not consented, and a space with no mark yet. The lock chip and the line "Not read: … hasn't agreed to AI tools" still exist in both components, unused.
- [ ] The working line changing in place, and the "Looked in" list past five rows ("and 4 more")
- [ ] Japanese and dark variants of the panel boards and of the settings states that exist only in English and light
- [ ] On the Discovery canvas, page "SIDE-14 · Assistant", tagged NEW; source copy in `design/discovery/canvas/`; rows in `design/INVENTORY.md`
- [ ] Approved by the CEO in the lead's own chat

## Notes
- The full list of gaps: [build spec](../../docs/specs/assistant.md) §10, "Gaps".
- Components: `design/discovery/canvas/Assistant.dc.html`, `AssistantBits.dc.html`, `AssistantAdmin.dc.html`. No new components are expected, only new props and frames.
- Done through the design loop in `docs/PHASES.md` ("How we work", step 1): an Opus designer draws, the lead publishes.
- Does not block AST-05 to AST-09, which build only what is already drawn. It blocks AST-12 and AST-13.

## Outcome

## Review notes
