---
id: AST-10
title: Assistant — limits and usage in Workspace settings (slice 2)
stage: todo
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [AST-09]
created: 2026-11-23
owner:
---

## Goal
Owners and Admins set the two limits and see usage by day and by person in Workspace settings → Assistant. Slice 2 of SIDE-14.

## Design gate
Approved 2026-11-23: AssistantAdminUsage (+JP, Dark), AssistantAdminStates. Component: `design/discovery/canvas/AssistantAdmin.dc.html`. The Japanese and dark variants of the states come with AST-03; until then those states are checked in English and light only.

## Acceptance criteria
- [ ] Service: `GET` and `PUT /api/assistant/settings` and `GET /api/assistant/usage` as [the spec, §6.5](../../docs/specs/assistant.md), behind the gate plus level 50 in the workspace
- [ ] A `PUT` value is a number from 0 to 10,000 with at most two decimals; anything else is 400; a change takes effect on the next ask
- [ ] Usage: the month and its bars by the server's clock; "Today" and "at today's limit" by each person's own date; people by id, sorted by spending; never asks, answers, tokens or model names
- [ ] The `workspaceSettingsTabs` slot on `Feature`, after People and Access, Owners and Admins only; the registry test renders with it empty
- [ ] Store commands `assistantSettings`, `setAssistantLimits`, `assistantUsage(month)`, with fakes
- [ ] The screen as drawn: two fields saved on leaving the field (a refused value shows the saved one again), the month switcher, the total against the limit with its meter, asks and how many were thorough, bars per day, the table by person with a total row
- [ ] The states: changing a limit, this month's limit reached, someone at today's limit, nothing yet, an earlier month (no Today column)
- [ ] A person who was removed is left out of the table; the total still counts their spending
- [ ] Test 9's last case (Staff gets 403 on settings and usage); strings in both locale files; browser check in English and Japanese, light and dark

## Notes
- Until this ships, the limits are the configured defaults ($3 a person a day, $100 a month).
- Gaps that stay unbuilt until drawn are listed in the spec, §10.

## Outcome

## Review notes
