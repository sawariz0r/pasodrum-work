# Phases — where we are and what each phase needs

Handoff file: read this after AGENTS.md §0 to pick up without chat history. Updated 2026-11-21.

Production: https://pasodrum.work (Coolify, auto-deploys `main`). Repo: `sawariz0r/pasodrum-work` (push via `git@prpl.se:` alias, commit email oscar@prpl.se). Canvas: https://claude.ai/artifact/1sFjCeUornYw7f8rReZBtJ (mirror in `design/canvas/`).

## Status at a glance

| Phase | State | Live? |
|---|---|---|
| M0 server + repo | done (M0-01…04 in ceo-review; 05–07 done) | yes |
| M1 walking skeleton | done (ceo-review) | yes |
| M2 full timeline | done (ceo-review) | yes |
| M3 threads, Activity, drafts, DMs | done (ceo-review) | yes |
| M4 channels, people, invites, settings | done (ceo-review) | yes — invite mail needs `RESEND_API_KEY` |
| M5 client spaces + guests | **design Batch E awaits CEO approval** | — |
| M6 encryption | Batch F not designed | — |
| M7 tabs & cards | Batch G not designed | — |
| M8 find & finish | Batch H not designed | — |
| M9 desktop shell | Batch H (desktop bits) not designed | — |

## Waiting on the CEO

1. **Approve Batch E** (M5) — includes the Owner rule: Owners can only step down themselves (Matrix can't let one PL-100 Owner demote another).
2. **Resend:** verify `noreply.prpl.se` in Resend (SPF/DKIM at prpl.se's DNS), create a sending-only key for that domain, add `RESEND_API_KEY` to the Coolify resource. Until then invites are created but no email is sent ("Copy join link" still works).
3. Review the `tasks/ceo-review/` pile (M0–M4) when convenient.

## How we work (the loop that has worked)

1. **Design first** (D-10, D-21): an Opus designer edits the canvas source in the scratchpad (`…/scratchpad/pd/project/*.dc.html`, tools in `…/scratchpad/tools/`: `dcrender.js`, `bindcheck.js`, `shot.sh`, `run_batch*.sh`, backups per batch). The lead publishes (Artifact publish with `root` = `…/scratchpad/pd`, `file_path` = `project/canvas.json`, `files` = changed boards), mirrors into `design/canvas/`, updates `design/INVENTORY.md`, asks the CEO to approve. The scratchpad can be wiped — the repo mirror is the durable copy; if lost, copy `design/canvas/` back to a scratch folder to edit.
2. **Contract before parallel build:** the lead extends `apps/web/src/matrix/types.ts` (+ stubs in `matrix/store.ts` and working fakes in `app/testing/fakeStore.ts`), logs a decision, writes `tasks/todo/M?-NN-*.md` with exact criteria, then runs agents in parallel by folder (matrix/ · app areas · services/). Relay server semantics from the matrix agent to the UI agents.
3. **Lead integration:** `pnpm check`, `pnpm test:matrix`, `pnpm test:invite`, then a real browser test against the local stack (`pnpm dev:server` + `pnpm --filter @pasodrum/web dev`, seeded accounts, password `pasodrum-dev-password`), fix what it finds, move tasks to `ceo-review/` with review notes, update AGENTS status.
4. **Ship:** commit, verify the exact commit in a clean worktree (`git worktree add /tmp/pd-verify HEAD` → install, `pnpm check`, build), push, wait until https://pasodrum.work serves the new `index-*.js`. (DNS on the lead's Mac caches badly — use `curl --resolve pasodrum.work:443:65.108.71.221`.)

## M5 — client spaces + guests (next)

- **Design:** Batch E boards (RulesM5, CreateClientSpace states, ClientShell*, GuestShell*, External* outside mark, SpaceSettings/SpacePeople/RemoveFromSpace/ArchiveSpace/ArchivedSpace, AnotherApp*, PhoneHandoff*, JoinPhone, JoinDonePhone). Approve first.
- **Contract additions likely:** `createClientSpace({name, colour, channels[], team[], clientEmails[]})` (reuse `matrix/levels.ts` `powerLevels()` per D-27; mark `work.pasodrum.space {kind:'client'}`; colour in that state event), `spaceSettings`/`renameSpace`, `removeFromSpace(spaceId, userId)` (leaves space + all its channels; revoke pending join link via invite service), `archiveSpace`/`unarchiveSpace` (read-only: raise `events_default`; tile dims), external flags on channels/DMs (`Channel.external?`, `Dm.external?`) for the amber ↗ mark (team-only), `renameChannel` (missing from M4).
- **Already in place:** guest grouping (channels under an unjoined parent space, name from `work.pasodrum.spaces` account data written by the invite service at claim); client role; `Person.external`; Add people Client tag.
- **Phone:** phone hand-off page for app routes on small screens (D-15); verify the Element X deep link (`mobile.element.io/element/?account_provider=pasodrum.work`) actually pre-fills the server.
- **Exit:** first friendly client onboarded; automated client's-eye suite (a client account reaches zero internal rooms or people via the API) in CI.

## M6 — encryption (D-11, D-24)

- Design Batch F: confirm this device (both sides), save/enter recovery key, can't-confirm reset, undecryptable row, sign-out warning.
- Build: matrix-js-sdk Rust crypto (WASM; check Vite config), cross-signing, key backup before first encrypted send, turn on encryption for all DMs (existing + new; irreversible) and private channels; undecryptable rows; `persistStorage()`.
- Verify the open probe items: signed cross-signing sub-keys, history sharing for new joiners. Element X ↔ app encrypted DMs.

## M7 — tabs & cards (D-04)

- Design Batch G: Pins tab, Files tab (list/empty/loading), add/remove tab, link card variants, Docs "Soon" tab, Docs/Boards rail pages.
- Build as feature modules: `routes` + `messageParts` extension points arrive; pins, files (`contains_url` filter works), link-cards (server URL previews work), docs/boards "Soon". **Removal drill:** delete `link-cards` on a branch, CI stays green.

## M8 — find & finish

- Design Batch H: ⌘K switcher, search results (empty, JP), shortcuts.
- Message search = local substring scan (server search is whole-word and misses Japanese, D-13). Accessibility, performance (bundle is ~2 MB / 611 KB gzip: code-split TipTap, emoji data, matrix SDK), error-state audit, launch checklist.

## M9 — desktop shell (D-08)

- One-day spike each: Tauri and Electron against `platform/` (notify, badge, deep links, auth redirect, openExternal, persistStorage). Build the winner: installer, update prompt, tray/badge. Re-enable "Download app" buttons (hidden since M4).

## Open follow-ups (not blocking)

- **Needs design (inventory rows):** sign-in failure that isn't wrong password/unreachable; M4-04 states built without boards (password prompt before device sign-out, join claim errors, link-not-found); Add people "Couldn't add {name}".
- **Product gaps:** `/dms` with no DMs shows the last channel instead of an empty state; channel rename (contract); voice clips show as audio files (no waveform); Activity covers recent synced history only (no `/notifications`); thread read state shares one room position (server drops `thread_id`).
- **Tests:** one M3 thread-unread integration test is flaky (failed 1 of ~3 runs); invite service rate limit (60/h per caller) trips repeated local runs — restart the `invite` container.
- **Production data** is disposable until the CEO says otherwise (D-18): seed accounts + test rooms live there; wipe or deactivate before a second real person joins.

## Key decisions to know (full text in DECISIONS.md)

D-04 removable features · D-05 interop · D-06 spaces/roles · D-07 invite identity · D-09 EN/JP · D-10/D-21 canvas is truth, cut rule · D-11 encryption scope · D-12 password sign-in · D-13 Continuwuity GO + fallbacks · D-17/D-18 Coolify, no staging, push = deploy · D-19 show only what works · D-20 motion · D-22/D-24 contracts M2/M3 · D-23 navigation · D-25 roles · D-26 Resend + invite service · D-27 power levels.
