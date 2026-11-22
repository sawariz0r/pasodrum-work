# Phases — where we are and what each phase needs

Handoff file: read this after AGENTS.md §0 to pick up without chat history. Updated 2026-11-21.

Roadmap page: https://claude.ai/artifact/48a49o72pqtecYYWnVSXvk (source `docs/roadmap.html`; republish after each phase). Production: https://pasodrum.work (Coolify, auto-deploys `main`). Repo: `sawariz0r/pasodrum-work` (push via `git@prpl.se:` alias, commit email oscar@prpl.se). Canvas: https://claude.ai/artifact/1sFjCeUornYw7f8rReZBtJ (mirror in `design/canvas/`).

## Status at a glance

| Phase | State | Live? |
|---|---|---|
| M0 server + repo | done | yes |
| M1 walking skeleton | done | yes |
| M2 full timeline | done | yes |
| M3 threads, Activity, drafts, DMs | done | yes |
| M4 channels, people, invites, settings | done | yes |
| M5 client spaces + guests | done | yes |
| M6 encryption | done | yes |
| M7 tabs & cards | done | yes |
| M8 find & finish | done | yes |
| Side: people & access (D-36), Docs & Boards (D-37), confirm by email (D-38), live relay (D-39), client/External marks (D-40) | done | yes |
| M9 desktop shell | desktop boards approved (DES-03, canvas page "Desktop app"); shell spike next | — |

## Waiting on the CEO

- Test confirm by email (SIDE-04): first turn OFF click and open tracking for noreply.prpl.se in Resend.
- Test the client DM line ("Henrik Dahl is from Nordlys") in a real DM.

## How we work (the loop that has worked)

1. **Design first** (D-10, D-21): an Opus designer edits the canvas source in the scratchpad (`…/scratchpad/pd/project/*.dc.html`, tools in `…/scratchpad/tools/`: `dcrender.js`, `bindcheck.js`, `shot.sh`, `run_batch*.sh`, backups per batch). The lead publishes (Artifact publish with `root` = `…/scratchpad/pd`, `file_path` = `project/canvas.json`, `files` = changed boards), mirrors into `design/canvas/`, updates `design/INVENTORY.md`, asks the CEO to approve. The canvas has one page per feature (ids such as `messages`, `channels`, `devices`, `docs`; full list in `design/CANVAS-MAP.md`) plus "Discovery" (`page:"discovery"`). **Every board waiting for approval goes on Discovery** (CEO, 2026-11-21: new boards can't be spotted on the feature pages). Each task gets its own section, under a title note with the task ID ("SIDE-05 · Client contacts · for approval"). Every board is tagged NEW, or CHANGED + the approved board it replaces + a one-line diff. To change an approved board, put a copy on Discovery and leave the original in place. Never mark a row approved without the CEO. Once approved, move the boards to their feature page under its last row, drop the tags, and replace any originals they change. Leave the design-discovery session's boards alone. Always read the live `canvas.json` and merge before publishing; after mirroring run `pnpm canvas:map`. The scratchpad can be wiped — the repo mirror is the durable copy; if lost, copy `design/canvas/` back to a scratch folder to edit.
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

## Next session — pick up here (2026-11-21, late)

**Live on pasodrum.work:** M0–M8; SIDE-01 Translate, SIDE-02 privacy line, SIDE-03 share history, SIDE-04 confirm by email; people & access (Staff/External/Client, access roles); Docs & Boards (live editing, boards, cards in chat, unread markers); live cursors over a WebSocket relay in the invite service (CEO: "flawless"); ⌘K space line + people tags; client company tile / External ↗ / composer risk line.

**Production data done:** `migrate:pins`, `migrate:people`, `migrate-docs --apply`, `seed-welcome` (Shiori's EN/JP welcome pages + example projects; Shiori added to the Nordlys team). The "Pasodrum" system account is created by the invite service at startup (env `SYSTEM_PASSWORD`, `CONFIRM_KEY_SECRET` from Coolify's `SERVICE_PASSWORD_64_*`). **Back up `CONFIRM_KEY_SECRET`** — losing it forces every client to start fresh.

**Production clean slate (OPS-01, 2026-11-22):** first the test accounts and rooms were removed in place. Then the CEO chose a full wipe so nothing of the seed is left (Sofia stayed the room-v12 creator of everything otherwise): Coolify volumes `continuwuity-data` + `invite-data` deleted, `pnpm bootstrap` made Oscar the first admin with an empty workspace + #general, `pnpm add:staff` re-made Shiori, and a "Test Client" client space comes from the app. The welcome pages and the Pasodrum project are gone (CEO accepted).

**Open sessions:** "Build Docs and Boards (D-37)" (keep for follow-ups), "Build confirm by email (D-38)" (archive after the CEO's test), "Design discovery" (icon/mark exploration — CEO said leave it alone). Everything else is archived.

**Backlog (all need canvas boards first):** SIDE-05 client contacts, SIDE-06 quiet board rooms in Element X, SIDE-07 Docs/Boards follow the selected space + "Client boards" fold, DES-01 uniform sidebar rows. Next milestone: M9 desktop shell (needs Batch H desktop boards).

**How the lead worked today (keep doing it):**
- CEO works in discovery sessions on the canvas; the lead only builds after the CEO says "approved" **in the lead's own chat** (a session relaying approval doesn't count). Approved boards move off Discovery to the matching feature page; `design/CANVAS-MAP.md` lists page → section → artboard (`pnpm canvas:map`).
- Build = one session per feature (Fable/Opus plans, Opus agents in parallel on disjoint files), then a **must-fix-only** review (max ~5; CEO: drop edge cases), then the lead commits only that feature's files (use `git hash-object -w` + `git update-index --cacheinfo` for files shared with another in-flight session), verifies the commit in a clean worktree (`git worktree add /tmp/x HEAD`, `pnpm install --frozen-lockfile`, `pnpm check`, web build), pushes, waits for `/_matrix/client/versions` 200 + `/api/invites` 401.
- Fable: use sparingly (CEO resets the budget); Opus is the default for build agents.
- Auto mode blocks production migrations/seeds until the CEO says yes in chat; dry-run first, then apply, then dry-run again (expect 0 writes).
- Don't chain a push after a filtered check (`pnpm check | grep … && git push` pushes on failure) — check the exit code.
- Lint ignores `.claude/` (session worktrees live there).

**Known gaps:** a client in two client spaces is treated as a client of the first only (marks); a newly-joined presence peer can briefly see a slightly older caret; page creators can't be removed from page rooms (Matrix v12 creator); Continuwuity to-device race; crypto store not encrypted at rest.

## Open follow-ups (not blocking)

- **Product gaps:** channel rename (contract); voice clips show as audio files (no waveform); Activity covers recent synced history only (no `/notifications`); thread read state shares one room position (server drops `thread_id`).
- **Server:** Continuwuity loses ~3% of to-device messages that arrive concurrently (DECISIONS learnings). No upstream report for now (CEO); our own sends are serialized. Revisit if "Not available on this device" shows up in real use.
- **Tests:** one M3 thread-unread integration test is flaky (failed 1 of ~3 runs); invite service rate limit (60/h per caller) trips repeated local runs — restart the `invite` container.
- **Production data** is no longer disposable test data (OPS-01): no seeding, no probe runs there. Test on the local stack. Exception: `pnpm seed:welcome-jp` (SEED-01, already run 2026-11-22) signs in as whoever runs it, needs no seed accounts and skips what exists.

## Key decisions to know (full text in DECISIONS.md)

D-04 removable features · D-05 interop · D-06 spaces/roles · D-07 invite identity · D-09 EN/JP · D-10/D-21 canvas is truth, cut rule · D-11 encryption scope · D-12 password sign-in · D-13 Continuwuity GO + fallbacks · D-17/D-18 Coolify, no staging, push = deploy · D-19 show only what works · D-20 motion · D-22/D-24 contracts M2/M3 · D-23 navigation · D-25 roles · D-26 Resend + invite service · D-27 power levels.
