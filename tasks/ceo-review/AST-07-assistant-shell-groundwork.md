---
id: AST-07
title: Assistant — shell groundwork and the store contract
stage: ceo-review
area: frontend
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-23
owner: SIDE-14 build session---

## Goal
The shell gets the places an Assistant feature will plug into, and `matrix/` gets the commands it will call. With no feature registered nothing changes on screen. This part stays when the feature is removed (D-04, D-54). Slice 1 of SIDE-14.

## Acceptance criteria
- [ ] Right-panel host at `Workspace` level ([the spec, §2.4](../../docs/specs/assistant.md)): one slot for the thread and the Assistant, last opened on top, the thread still in the URL, the fold at 1000 to 1279 px keyed on any right panel open. The thread behaves exactly as before at 1280 and above, 1000 to 1279, and under 1000.
- [ ] The `assistant` slot on `Feature` (first wins, like `translation`); `app/registry.test.tsx` renders the shell with it empty
- [ ] `HeaderEnd` at the right end of every page header: channel, DM, Threads, Drafts, Search, Browse in `app/`; the Docs and Boards headers in their features
- [ ] One extra last row in ⌘K from the registry; ⌘J in the host, doing nothing while a dialog is open (after spike 5)
- [ ] `app/screenContext.ts` with call sites in the channel, the thread panel, the Activity item and the DM screen (which reports `closed`), as §5.1
- [ ] `useIsTeam()` replaces the copies in Translate, Boards, the rail and `roles.ts`; one sign-out hook replaces the `forgetTranslations()` call in `app/App.tsx`
- [ ] `matrix/assistant.ts` behind store commands: `assistantAsk` (opens the socket, answers `find` and `list` itself, resolves with the answer), `assistantStatus`, `messagesByRef`
- [ ] The find wrapper returns refs only, never message text, and skips encrypted conversations (AST-14 changes that)
- [ ] `wire.ts` mirrored from the service, with a script in `pnpm check` that fails when the two copies differ
- [ ] `app/testing/fakeStore.ts` implements the new commands with scripted answers, for `/dev/app` and tests
- [ ] `pnpm check` green; browser check that channels, DMs, threads, Docs and Boards look and behave as before

## Notes
- Lint boundaries: only `matrix/` talks to servers; `app/` never imports `features/*`.
- No new strings are expected here. If one is needed, both locale files.
- Shared files (`Shell.tsx`, headers, `Switcher.tsx`) may be in use by other sessions; keep the diff small and check `git status` before starting.

## Outcome
Built 2026-11-23, committed locally on `main`, not pushed. Nothing changes on screen with no Assistant feature registered.
- New in `apps/web/src/app/`: `rightPanel.ts`, `shell/RightPanel.tsx`, `shell/HeaderEnd.tsx`, `screenContext.ts`, `team.ts`, `signOut.ts`; the `assistant` slot and `ScreenContext` in `registry.ts`.
- New in `apps/web/src/matrix/`: `assistant.ts` (the socket client, the find wrapper, `list`), `assistantWire.ts`, and the store commands `assistantAsk`, `assistantStatus`, `messagesByRef`, with fakes.
- `HeaderEnd` placed in the eight page headers; one extra last row in ⌘K; ⌘J bound in the host.
- `scripts/check-assistant-wire.ts` in `pnpm check`.
- Checks: `pnpm check` green (366 tests). Browser check on the local stack: the thread panel behaves as before at 1440, 1100 and 800 px.
- Differences from the spec: the Assistant's open state is a small module store, not a React provider. The Activity screen reports two contexts (its own and the channel's); the feature picks Activity's. Close codes map to `not-allowed`, `unavailable` or `failed`.
- Not done: spike 5 (whether every browser lets the page take ⌘J and Ctrl J); it stays in AST-01.

## Review notes
