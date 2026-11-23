---
id: AST-09
title: Assistant — slice 1 together: review, browser check, ship
stage: todo
area: infra
milestone: side
priority: P1
slice: false
depends_on: [AST-02, AST-05, AST-06, AST-07, AST-08]
created: 2026-11-23
owner:
---

## Goal
The service and the panel work together on the local stack, the security review is done, and slice 1 is ready to go to production the way the CEO chose. Slice 1 of SIDE-14.

## Acceptance criteria
- [ ] End to end on the local stack with seed accounts and a real provider key: an ask about a channel, a thread, "this message", a follow-up, Look closer, Stop, both limits
- [ ] `pnpm check`, `pnpm test:invite` and the matrix integration tests green
- [ ] One independent Fable review of `gate.ts`, `reader.ts`, `ask.ts`, `answer.ts` and `mask.ts` against [the spec, §3 and §4](../../docs/specs/assistant.md); must-fix findings fixed, edge cases dropped
- [ ] Browser check in English and Japanese, light and dark, in Chromium and WebKit, against the boards; the thread panel unchanged
- [ ] A client account and an External account see no spark and are refused by the service
- [ ] Production checklist, each step with the CEO's yes: the Assistant's variables in Coolify; the provider's hard limit switched on (AST-02); `pnpm assistant:cover` for each client space (dry-run first); the Element X smoke test
- [ ] Landed the way the CEO chose when asked before the first build step; pushing `main` deploys
- [ ] `AGENTS.md` status and `docs/PHASES.md` updated; SIDE-14's Outcome notes what is live

## Notes
- Until a client space is marked, the Assistant does not read it (D-54, call 5).
- Production has real people: only Oscar's account or the CEO's test account there, never Shiori's (AGENTS.md §5).

## Outcome

## Review notes
