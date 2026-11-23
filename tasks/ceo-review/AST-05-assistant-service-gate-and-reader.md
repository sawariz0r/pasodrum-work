---
id: AST-05
title: Assistant service — the module, the gate and the reader
stage: ceo-review
area: api
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-23
owner: SIDE-14 build session---

## Goal
The fenced `assistant` module exists in `services/invite`, refuses everyone who is not team, and can read each kind of chat source with the caller's own access and nothing else. No model call yet. Slice 1 of SIDE-14; security-sensitive.

## Acceptance criteria
- [ ] `services/invite/src/assistant/` mounted by two lines in `app.ts`, with every fence of [the spec, §2.1](../../docs/specs/assistant.md): a GET-only function for the homeserver, its own `assistant.db`, configuration passed in, `isClientAccount` and `isClientOf` as its only view of the invite records
- [ ] The import check in `pnpm check`: nothing imported from outside the folder except `ws`, `yjs` and Node's own modules; no `process.env`; `fetch` only in `provider.ts` and `reader.ts`
- [ ] Configuration in both compose files and `dev/.env.example`; with it missing, `GET /api/assistant/status` answers 503 and the rest of the service runs
- [ ] `/api/assistant /api/assistant/*` in the `@invite` matcher of `deploy/Caddyfile` and `dev/Caddyfile`
- [ ] The four-step gate of §3.1 on the socket handshake and on every HTTP path; the limits before the gate of §2.2 (per-IP on upgrades, 10 seconds and 4 KiB for the first message)
- [ ] The reader of §3.2: the four checks per place; every call a GET with the caller's token and a 10 second timeout; ids format-checked and encoded; an event used only if it names the room asked for
- [ ] The reading rules for messages: text kinds only, edits applied only to a read, undeleted target from the same sender, the newest edit looked up for any message not reached in one scan, deleted messages skipped, the reply quote removed
- [ ] The placing rule and the client-space check (D-53): the mark in the workspace's state, the answers in the client space's, the table of states, conversations outside any space, a client's own messages in a workspace channel skipped, only a room's kind remembered between asks
- [ ] `mask.ts` (§3.4): text, display names, place names and titles alike
- [ ] `pnpm assistant:cover <space> terms|ask`: a script in `dev/` that writes the mark with the signed-in Owner's or Admin's own token
- [ ] Tests 1, 2, 4, 6 and 11, and the server half of 3 (§9), with the seed additions listed there; the module runs in the test process against the local homeserver

## Notes
- The lead writes `assistant/wire.ts` first; AST-07 mirrors it in the web app.
- Spike results that touch this task: 6 (edit lookup), 8 (admin room), 9 (listing cost). None blocks the start.
- `pnpm assistant:cover` is never run against production without the CEO's yes; dry-run first.
- The Fable review of this code happens in AST-09, before anything ships.

## Outcome
Built 2026-11-23, committed locally on `main`, not pushed. Inert in production: the module is off without `ASSISTANT_OPENAI_API_KEY`.
- `services/invite/src/assistant/`: `index.ts`, `gate.ts`, `reader.ts`, `mask.ts`, `wire.ts`; mounted in `app.ts`; `clientOf` added to `store.ts`; a GET-only homeserver function in `matrix.ts`.
- Configuration in both compose files and `dev/.env.example`; `/api/assistant` in both Caddyfiles.
- `scripts/check-assistant.ts` (`pnpm assistant:fence`, part of `pnpm check`); `dev/assistant-cover.ts` (`pnpm assistant:cover`, with `--dry-run`).
- `services/invite/test/assistant.integration.ts`: 18 of 18 pass against the local stack. `pnpm check` green.
- Spike 6 answered on the way: the homeserver attaches a message's newest edit when it is fetched; the reader uses it when the sender matches and looks it up otherwise.
- Not covered yet, by design: the settings and usage paths (AST-06, AST-10), so test 1 covers the socket and status only; issue and page cases of tests 6 and 11 (AST-11); the 10 second auth timeout has no test.
- After `hello` the socket answers `unavailable` until AST-06 builds the loop. A homeserver error during the gate gives 503, or close 1011 on the socket.
- The Fable review of this code is in AST-09.

## Review notes
