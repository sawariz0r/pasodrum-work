---
id: AST-16
title: Assistant — Handover as context, and Add to handover (slice 6, to scope later)
stage: backlog
area: frontend
milestone: side
priority: P3
slice: false
depends_on: [SIDE-13, AST-09]
created: 2026-11-23
owner:
---

## Goal
Once Handover (SIDE-13) is approved and built: the panel starts from a handover, and "Add to handover" is a proposal that opens Handover's own dialog. A placeholder, about 2 hours once Handover exists.

## Acceptance criteria
- [ ] Scoped against SIDE-13's approved boards; no Assistant board draws Handover yet, so its chip, asks and proposal card need a board first
- [ ] Handover brings its context and its dialog through the registry (`assistantProposals`)
- [ ] Handover's own AI line follows the same client-space check as the Assistant: a client in Japan who has not consented shows with facts only (D-53)

## Notes
- [Build spec](../../docs/specs/assistant.md), slice 6 and §3.2.
- Handover has its own endpoint and its own limits (D-48); showing both in one usage view is "not now".

## Outcome

## Review notes
