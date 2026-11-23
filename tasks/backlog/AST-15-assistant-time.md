---
id: AST-15
title: Assistant — Time as context and source (slice 5, to split later)
stage: backlog
area: frontend
milestone: side
priority: P3
slice: false
depends_on: [SIDE-12, AST-12]
created: 2026-11-23
owner:
---

## Goal
Once Time (SIDE-12) is approved and built: scopes, months and hours in the Assistant, with estimates, four proposals, tables and bar charts. Most approved Assistant boards are drawn with Time data and are fully matched only here. A placeholder; it is split into build tasks when SIDE-12 has its own build spec.

## Acceptance criteria
- [ ] Split into build tasks after SIDE-12's spec is approved
- [ ] Time brings: context for My week, All clients, a scope and a month; scope and month rows; the value sources behind fact rows; its four proposal dialogs; its views (compare months, hours per week, runs out)
- [ ] The Assistant gains: fact rows with source chips, estimates as ranges with the past work they rest on, the month-note text card with Use, tables and bar charts (`ui/Table`, `ui/Bars`, the `assistantViews` slot), view states, "Changed since this answer"
- [ ] Time's Draft and Review write their usage into the Assistant's table with their own `feature` value; whether they count against the limits is settled in SIDE-12's spec
- [ ] The Internal line in Time's AI usage reads the Assistant's usage (US dollars there, kr in Time: the rate is SIDE-12's to settle)

## Notes
- What Time has to build to ([the spec, §3.2](../../docs/specs/assistant.md), D-53, D-54):
  - its client profile writes the mark `work.pasodrum.ai` in the workspace's state from the client's country;
  - its consent card writes the answer `work.pasodrum.ai.consent` in the client space's state, keyed by the answering person, and lowers that event's level so a client can write it;
  - the card is not sent to any client until Zero Data Retention is in place on the Assistant's provider project (AST-02);
  - for a client in Japan who has not consented: no scope draft, and Time's own tools read nothing in that space.
- Boards matched here: AssistantScope, AssistantDraft, AssistantMonth, AssistantTable, AssistantChart, AssistantViewStates, AssistantTextCard x1 and x2, AssistantDesktopJPDark, and the rest of AssistantParts, AssistantPlaces and AssistantStates.

## Outcome

## Review notes
