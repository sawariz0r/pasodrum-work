---
id: AST-12
title: Assistant — pages and issues in the panel (slice 3)
stage: todo
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [AST-11, AST-03]
created: 2026-11-23
owner:
---

## Goal
The panel starts from a page, a project or an issue, answers with issue, page and person rows, offers a New issue proposal that opens the normal dialog filled, and can write a summary to copy. Slice 3 of SIDE-14.

## Design gate
Approved 2026-11-23: AssistantParts (issue, page, person, heading, done row, plain line), AssistantTextCard x3. Waits for AST-03's board: the chips and suggested asks for a page, a project, an issue, My issues and All issues, and the New issue proposal card.

## Acceptance criteria
- [ ] The `assistantParts` and `assistantProposals` slots on `Feature` ([the spec, §2.4](../../docs/specs/assistant.md)); the registry test renders with them empty
- [ ] `features/boards/assistant.tsx`: the issue row; `NewIssueDialog` with optional starting values (project, title, description, assignee) behind `ProposalDialogProps`; context from a project, an open issue, My issues and All issues; its suggested asks from its own locale files
- [ ] `features/docs/assistant.tsx`: the page row; context from a page; its suggested asks
- [ ] The Assistant draws: person rows, group headings, the text card with Copy (then "Copied") and Shorter, the proposal card with Open and Not now, the done row, a removed feature's plain line
- [ ] From proposal to dialog as §4.5: nothing is saved until the dialog's own button; one card, one dialog
- [ ] No feature imports another: Boards and Docs export through the registry, the Assistant reads the slots; removing Boards or Docs leaves `pnpm check` green
- [ ] Strings in each feature's own locale files, English and Japanese; browser check in both languages, light and dark

## Notes
- A page that was never opened shows as a page row by its title and is not read (§3.2).
- Activity's assignment items point at an issue, not a message (§5.1).

## Outcome

## Review notes
