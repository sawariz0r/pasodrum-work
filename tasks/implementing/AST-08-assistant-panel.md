---
id: AST-08
title: Assistant — the panel
stage: implementing
area: frontend
milestone: side
priority: P1
slice: false
depends_on: [AST-07]
created: 2026-11-23
owner: SIDE-14 build session---

## Goal
`features/assistant`: the panel as the approved boards draw it, for asks about channels and threads. It builds only what is already drawn; chips and asks for other screens come with AST-13. Slice 1 of SIDE-14.

## Design gate
Approved 2026-11-23 (`design/INVENTORY.md`, source in `design/discovery/canvas/`): AssistantRules, AssistantFollow, AssistantThread, Assistant1024, Assistant800, AssistantLookup (l1 to l3, l5), AssistantCloser(+JP), AssistantDepth(+JP), AssistantStates (all but Sealed), AssistantPlaces (p1, p2, p6), AssistantTone(+Dark). Components: `Assistant.dc.html`, `AssistantBits.dc.html`.

## Acceptance criteria
- [ ] `defineFeature` with the `assistant` slot and the "Ask about this" message action, one line in `features/index.ts`; removing the folder and the line leaves `pnpm check` green
- [ ] Header (Start over, Close; Back under 1000 px), the chip for a channel and for "this message" with ×, the divider when the context changes, the ask box with the depth picker (Quick · seconds, Thorough · about a minute, "not enough left today"), Send and Stop
- [ ] The spark, lit while open, with a dot when an answer landed while closed; the ⌘K row; ⌘J; offered only when `useIsTeam()` and the status endpoint both say so
- [ ] States with the boards' exact strings: empty, working (one status line and a skeleton), answer, nothing found, can't do it, stopped (the ask returns to the box), failed with Retry, offline, today's limit, this month's limit
- [ ] The "Looked in" line in the forms the boards draw, composed with `Intl.ListFormat`, and its list of sources
- [ ] Message rows through `messagesByRef`; opening a source keeps the panel, flashes the message, opens a reply's thread on top
- [ ] Look closer under the newest quick answer: asks again thorough, replaces the answer in place, hidden when Thorough is not available
- [ ] 400 px, 380 px from 1000 to 1279 with the sidebar folded, replacing the screen under 1000; warm grey background, white cards, rows and ask box
- [ ] `session.ts` as [the spec, §7](../../docs/specs/assistant.md): in memory, keyed by the person, cleared on a new day at open, on Start over and on sign-out; a running ask survives closing the panel
- [ ] "Ask about this" is not shown in an encrypted conversation or in a client space that is closed to AI; such screens give no chip
- [ ] Model strings drawn as plain text only: a lint rule bans `dangerouslySetInnerHTML` in the folder, and a render test with hostile strings finds no link, image or markup
- [ ] Every string in `locales/en.json` and `ja.json`, copied from the boards; Enter through `isImeEnter()`; the accessibility rules of §8
- [ ] Browser check in English and Japanese, light and dark, against the boards, on `/dev/app` with scripted answers

## Notes
- Not here: suggested asks, chips for a thread or an Activity item, anything said about a closed client space (AST-13); issue, page and person rows, the text card, proposals (AST-12); sealed rows (AST-14).
- Where the two components differ in Japanese, `Assistant.dc.html` wins (§8).

## Outcome

## Review notes
