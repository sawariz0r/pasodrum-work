---
id: AST-04
title: Sealed boards — say that the Assistant can read a sealed conversation after a yes (design)
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
Three approved sentences on the Sealed boards (SIDE-10) say only the two people can read a sealed DM. D-51 made that untrue, and the CEO chose to change them before SIDE-10 is built (D-54, call 1). Part of SIDE-14; it touches SIDE-10's boards.

## Acceptance criteria
- [ ] New words, English and Japanese, for:
  - `design/canvas/SealedRules.dc.html:51`: "closed to everyone else, us included."
  - `design/canvas/Sealed.dc.html:91` (SealedAsk): "Only your devices and Sam's can read it. This conversation stays as it is."
  - `design/canvas/Sealed.dc.html:92` (SealedOpen): "Only your devices and Sam's can read this."
- [ ] The new words are true about us and about the provider: one of the two people can show the conversation to the Assistant; we keep nothing; the provider may keep the text up to 30 days
- [ ] Approved by the CEO; canvas and `design/INVENTORY.md` updated; D-47 and RulesM6 noted
- [ ] `tasks/todo/SIDE-10-sealed-conversations.md` points to the new strings

## Notes
- [Build spec](../../docs/specs/assistant.md) §3.5 and §3.4.
- Belongs to the session that owns SIDE-10's boards. The Assistant's spec session did not edit those files.
- Blocks SIDE-10's copy and AST-14.

## Outcome

## Review notes
