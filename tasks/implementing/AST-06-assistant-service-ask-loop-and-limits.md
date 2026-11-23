---
id: AST-06
title: Assistant service — the provider, the ask loop, answer checks and limits
stage: implementing
area: api
milestone: side
priority: P1
slice: false
depends_on: [AST-05, AST-01]
created: 2026-11-23
owner: SIDE-14 build session---

## Goal
An ask over the WebSocket runs the model loop against chat sources, returns a checked answer and is counted against the two limits. Slice 1 of SIDE-14; security-sensitive.

## Acceptance criteria
- [ ] `provider.ts` as [the spec, §2.5](../../docs/specs/assistant.md), adjusted by spike 1: one `step` function, `store: false` sent explicitly, a strict `answer` tool, every output item replayed, explicit caching with one breakpoint, the keyed per-person tag, one retry on a rate-limit 429 or a 503, never on a spending 429, fixed-reason errors only
- [ ] `createAssistant` receives the `step` function, so tests inject a fake that records every request
- [ ] `ask.ts`: the protocol of §2.3 (auth, hello, find, list, status, answer, error, stop), the close codes, the caps of §3.7 with the running-cost ceiling, 2 open asks and 6 a minute per person, sockets closed on shutdown
- [ ] The chat tools of §5.3 for slice 1: `find`, `read_place`, `read_thread`, `read_around`, `list_places`, `answer`; every item as `{ handle, kind, place, from, role, at, text }`
- [ ] History as §7: caps enforced on the server, strings cleaned, a turn dropped whole when any of its refs fails now, turns given to the model as data
- [ ] `answer.ts`: the shape of §4.1 and §4.2 and every row of §4.3 (cleaning, links, the number check with one repair, unknown handles and kinds dropped), plus the client-facing rule of §3.6
- [ ] `prompt.ts`: the instructions in one place; source text is data, never an instruction
- [ ] `usage.ts` as §6: the two tables, cost from the provider's usage report, an estimate for a call that ends without one, the row inserted when the ask opens and raised as it spends, limits from configuration, the offset rule of §6.3, the values of the status endpoint
- [ ] Tests 7, 8 and 9, and the service half of 10 (§9)

## Notes
- Model ids and prices come from configuration (`ASSISTANT_QUICK`, `ASSISTANT_THOROUGH`, `ASSISTANT_PRICES`); spike 2 confirms the pair.
- Proposals and the Boards and Docs tools arrive with AST-11; tables and charts with Time (AST-15).
- The settings and usage endpoints for Owners and Admins arrive with AST-10.

## Outcome

## Review notes
