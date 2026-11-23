---
id: AST-02
title: Assistant — its own provider project, key and hard limit (CEO)
stage: todo
area: ops
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-23
owner: CEO
---

## Goal
The Assistant gets its own project at the model provider, so its spending limit never stops Translate (D-54, call 2). Only the CEO can do this; it takes about 15 minutes in the provider's console. Part of SIDE-14.

## Acceptance criteria
- [ ] A new provider project for the Assistant, apart from Translate's
- [ ] Its key in `dev/.env` as `ASSISTANT_OPENAI_API_KEY` (never committed), for the spikes (AST-01) and local work
- [ ] The same variable set in Coolify for production, before slice 1 ships (AST-09)
- [ ] Monthly limit $150 on that project with **"Enforce a hard limit" switched on**. Without the switch it only sends an alert.
- [ ] A throwaway project with a $1 hard limit for spike 7, deleted afterwards
- [ ] Zero Data Retention asked for on the Assistant's project. Not needed for slices 1 to 4. It is needed before the consent card can be sent to any client in Japan (D-53).

## Notes
- [Build spec](../../docs/specs/assistant.md) §2.5 (the provider), §6.4 (the backstop), §3.4 (what the provider keeps).
- The in-app limits start at $3 a person a day and $100 a month and are changed in Workspace settings → Assistant once AST-10 ships.

## Outcome

## Review notes
