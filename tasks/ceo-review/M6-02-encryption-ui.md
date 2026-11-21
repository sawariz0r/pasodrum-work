---
id: M6-02
title: UI: confirm gate, approve dialog, recovery key, reset, undecryptable rows, sign-out warning, Devices
stage: ceo-review
area: frontend
milestone: M6
priority: P0
slice: false
depends_on: [M5-02]
created: 2026-11-21
owner: m6-ui session
---

## Boards (design/canvas/, approved) — read RulesM6 first
ConfirmGate(+JP, Dark), ConfirmGateNoDevice, ConfirmWaiting, ConfirmCompare(+JP), ConfirmDone, ConfirmDeclined, ConfirmTimeoutJP, ConfirmMismatch · ApproveAsk(+JP), ApproveCompare, ApproveDone, ApproveDark · RecoveryKeySave(+JP, Dark), RecoveryKeyPassword, RecoveryKeyEnter(+JP), RecoveryKeyWrong · ResetConfirm(+JP), ResetWrongPassword · UndecryptableDM, UndecryptableThread, UndecryptableJP, UndecryptableDark · SignOutWarn(+JP), SignOutNoBackup · SettingsDevicesM6(+JP, Dark), SettingsDevicesUnconfirmed

## Acceptance criteria
- [x] Gate on encrypted channels/DMs when `security.device === 'unconfirmed'` (Use another device / Use recovery key / Can't confirm?); NoDevice variant when `otherConfirmedDevices === 0`
- [x] Confirmation dialog driven by `security.confirmation` for both roles, all phases; approver dialog appears over whatever is open
- [x] RecoveryKeySave when `needsRecoveryKey` and an encrypted conversation is opened (shown once, Copy, "I've saved it", no close); password step on `password-required`
- [x] Recovery key entry (spaces don't matter, wrong-key state keeps text), reset flow with password, new key from Settings → Devices
- [x] Undecryptable row (+ collapsed run, arriving shimmer, fade-in) in channel, thread and DM list preview
- [x] Sign-out: `signOutRisk()` → SignOutWarn / SignOutNoBackup, else instant
- [x] Settings → Devices: Not confirmed tag, Recovery key row, Confirm on this device
- [x] SAS emoji names EN/JP from the Matrix SAS table (check the JP names against the spec table, not memory)
- [x] EN/JP, light/dark; tests only where necessary (D-30); `pnpm check` green; browser-checked against the fake backend

## Outcome
Built 2026-11-21 against the D-31 contract and the fake store (real store still stubbed by M6-01 at the time).

- **`app/security/`** (new): `SecurityProvider` (one dialog card whose steps cross-fade: waiting, compare/matched, done (closes after 1.2 s), declined/timeout/mismatch, Is this you?, recovery key, reset, password, save key, sign-out warnings), `Gate` (`useGate`, `useNeedsKey`, `ConfirmGate`), `Undecryptable` (quiet line, "N messages…" run, shimmer up to 10 s), `sasNames.ts` (all 64 EN/JP names copied from matrix-spec `data-definitions/sas-emoji.json`, by `index`), icons, CSS.
- **Wiring:** `ChannelView` shows the card instead of timeline + composer for encrypted DMs/private channels on an unconfirmed device (nothing while `starting`), fades the conversation in after, and asks for the recovery key the first time an encrypted conversation opens on an account without one. `items.ts` collapses a run of undecryptable messages from one sender (never an arriving one); `MessageRow` renders them with no hover bar, and a message whose key arrives later fades in. DM list preview says "Not available on this device". Settings → Devices: Not confirmed tag, Confirm on this device, Recovery key → New key. Sign-out from the profile menu goes through `signOutRisk()`. `ui/Dialog` gained optional `closeLabel` (no close button) and `tile` (centred title).
- **Fakes / dev:** every fake DM and `#lead` are `encrypted`; undecryptable rows in Jonas' DM, Ingrid's DM preview, `#lead` and its thread (one reply arrives after 4 s in `/dev/app`); devices carry `confirmed` (Safari on Mac unconfirmed); fake SAS indices fixed to match the table. `/dev/app?security=unconfirmed|nodevice|newkey[&password]`, `?confirm=asked|declined|timeout|mismatch|done`, `?signout=last-device|no-backup` (comment at the top of `dev/FakeApp.tsx`).
- **Tests (D-30):** `security/security.test.tsx`: gate on encrypted DM/private channel and never on public or client-space channels; NoDevice hides Use another device; recovery key with any spacing works and a wrong key keeps its text. `items.test.ts`: run collapsing.
- **Checks:** typecheck, locales and lint over everything except `apps/web/probe-tmp/` are green. `pnpm check` itself fails on lint in `apps/web/probe-tmp/*.mts` and on `matrix/map.test.ts > mediaOf`, both from the M6-01 session's in-progress files. Browser-checked on `/dev/app` (EN and JP, light and dark): gate, NoDevice, waiting → compare → done, declined/timeout, Is this you?, wrong key → key without spaces → done, reset with wrong then right password → save (Escape doesn't close; Copy → Copied), password-first new key, sign-out warning → New recovery key, thread shimmer → fade-in, Settings → Devices both states.

## Review notes (where the build differs from the boards)
- **Settings → Devices → Confirm** opens the confirmation over Settings (another device when one is signed in, otherwise the recovery key). It does not close Settings to show the gate card the way the canvas does.
- **Is this you?**: the meta line is "Just now" with no city, because the contract only carries the device name.
- **`matched` phase** has no board. It shows the compare card with the pulse in place of the buttons.
- **Approver side**: declined, timeout or mismatch closes the dialog quietly (the canvas shows no approver failure screen).
- **Closing**: dialogs pop in, but they close without fading their content out.
- **Not covered**: the thread panel beside the Threads list (not in a channel) is not gated on an unconfirmed device. Threads and Activity list previews don't use the "not available" words. The join-page sign-out doesn't ask first.
- `.claude/launch.json` got a `web-m6ui` entry on port 5175 for this session's preview.

## Review fixes (lead + Fable review, 2026-11-21)
1. Encrypted conversations stay behind a key card ("Save your recovery key" + Save recovery key) until the first key is saved: while `needsRecoveryKey`, while it's being made, after Cancel on the password step, and after a failure ("Couldn't make a recovery key" + Retry). The save dialog opens over that card, not over a live conversation and composer (differs from the RecoveryKeySave board, which shows the conversation behind it).
2. The Threads view thread panel is gated like ChannelView (confirm card or key card). The DM list, Threads list and Activity show "Not available on this device" for encrypted conversations while the device is unconfirmed or starting.
3. Waiting, Is this you? and compare have no close button; Escape and outside clicks do nothing. Only their buttons decide.
4. New key (Settings, sign-out dialog) shows busy and ignores repeat clicks; failure shows a one-line error; Copied resets when a new key is shown.
5. A `signOutRisk()` rejection shows the no-backup warning. The join-page sign-out goes through the same check.
6. They match / They don't match stay disabled until all 7 emoji are there.
7. Unexpected rejections on recovery key, reset, password and New key show the one-line error.
8. An undecryptable message with a thread or reactions isn't folded into a run. jumpTo already lands on a run (its row carries every id in `data-ids`).
9. Recovery key: `normalize('NFKC')`, whitespace and dashes stripped, case kept; the fake is case-sensitive.
10. Reply quotes and Threads previews of an unavailable message say "Not available on this device".
Tests added for 1 and 2 (`security/security.test.tsx`), plus run collapsing with threads/reactions (`items.test.ts`).
- Follow-up: `newRecoveryKey` rejecting `backup-unreadable` (New key, first key, password step) opens Enter your recovery key; once it's accepted, the new key is made and shown. The fake has `backupUnreadable` (`/dev/app?…&unreadable`). While `security.device === 'starting'` (e.g. another tab holds the account), encrypted conversations and the Threads panel show the loading skeleton instead of a blank pane.
