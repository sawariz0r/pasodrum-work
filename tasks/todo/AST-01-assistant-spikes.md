---
id: AST-01
title: Assistant — spikes before the build (slice 0)
stage: todo
area: research
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-23
owner:
---

## Goal
Answer the nine unknowns in [the build spec, §10](../../docs/specs/assistant.md) and write each result into that table. No product code. Part of SIDE-14.

## Acceptance criteria
- [ ] 1 · The loop on the Responses API: `store: false`, replayed reasoning items, a strict `answer` tool, explicit caching, usage on every reply; what is reported and billed for a call cut off by Stop. Sets the tokens-per-second figure of §6.2 and whether the adapter streams. Needs AST-02's key.
- [ ] 2 · The quality set (report 4, §6: eight asks, three runs each) at the proposed model pair and one step cheaper. Asks 6 and 7 pass every run. Confirms or changes Quick and Thorough. Needs AST-02's key; about $20.
- [ ] 3 · One bounded find across every joined conversation: time, and whether a literal word search finds enough in Japanese and English. Sets the 4 second budget and the hit count.
- [ ] 4 · `yjs` in a worker thread: the seeded pages come out as the text the browser shows; the size caps and the memory limit hold against two hostile pages. If the text does not match, say so: the fallback is in §10.
- [ ] 5 · ⌘J and Ctrl J can be taken by the page in Chrome, Safari, Firefox and the desktop app.
- [ ] 6 · Whether the homeserver attaches a message's newest edit when the message is fetched (three ways of fetching).
- [ ] 7 · The provider's hard limit on a throwaway project with a $1 limit: the exact reply, how far spending passes it. Needs the CEO (AST-02).
- [ ] 8 · The server's admin room: plain or encrypted (local). Coolify's proxy: passes the caller's address, keeps a quiet socket open for 5 minutes (production path; needs the CEO's yes, read-only).
- [ ] 9 · The cost of the first listing of a person's joined client spaces on a workspace with many pages (local). Rooms with one link only on production (needs the CEO's yes, read-only, with the Owner's own sign-in).
- [ ] Results written into §10 of the spec; any change to the spec's choices listed at the top of the Outcome

## Notes
- Local stack and seed accounts only (`pnpm dev:server`, `pnpm dev:seed`), except the two production checks above, which wait for the CEO's yes.
- Scripts go in `dev/` as `spike-assistant-*.ts`, like `dev/spike-share-history.ts`.
- Spikes 3 to 6 and the local halves of 8 and 9 need no provider key and can start at once.
- Never use Shiori's account (AGENTS.md §5).

## Outcome

## Review notes
