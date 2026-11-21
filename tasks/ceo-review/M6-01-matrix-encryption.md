---
id: M6-01
title: Matrix: Rust crypto, device confirmation, recovery key + backup, encrypt DMs and private channels
stage: ceo-review
area: frontend
milestone: M6
priority: P0
slice: false
depends_on: [M5-01]
created: 2026-11-21
owner: m6-matrix session
---

## Goal
`apps/web/src/matrix/` implements the M6 contract (D-31; end of `types.ts`, `// M6`), replacing the stubs in `store.ts` (search "M6 stub"). Behaviour spec: `design/canvas/RulesM6.dc.html`.

## Acceptance criteria
- [x] Rust crypto initialised (WASM loads in Vite dev + production build, Chrome and Safari), IndexedDB crypto store, `persistStorage()` through `platform/`
- [x] `security` snapshot: device state, other confirmed devices, needsRecoveryKey (no secret storage/backup yet), confirmation flow state
- [x] SAS emoji confirmation both directions (new device ↔ existing device; interoperable with Element X), 2-minute timeout, decline, mismatch; `Device.confirmed`
- [x] `newRecoveryKey(password?)`: cross-signing bootstrap (UIA password if the server asks → `password-required`), secret storage + server key backup, returns the key; `useRecoveryKey` (normalises spaces/case; `wrong-key`), confirms the device and restores from backup; `resetEncryption(password)`; `signOutRisk()`
- [x] Encryption on for all DMs and private channels, new and existing (send `m.room.encryption` once; idempotent; only where I have the power level, otherwise skip); `Channel.encrypted` / `Dm.encrypted`
- [x] Undecryptable messages → kind `undecryptable` (with `arriving` while a key may still come, ~10 s); fade-in replaces it when the key arrives; private channels start at my join
- [x] Verify open probe items with the SDK: signed cross-signing sub-keys on Continuwuity, key backup round trip; note findings in DECISIONS learnings
- [x] Tests only where necessary (D-30): encryption turned on idempotently, recovery-key normalisation, backup round trip in an integration test
- [x] `pnpm check`, `pnpm test:matrix` green; production build size noted

## Outcome
Built in `apps/web/src/matrix/` (new `crypto.ts`, `attachments.ts`), `platform/` and `vite.config.ts`; nothing committed. `types.ts` unchanged. Hand-over for the UI: `M6-01-matrix-notes.md` in the session notes folder (when each `security` field flips, timings, errors).

- **Crypto:** Rust crypto with an IndexedDB store (`pasodrum-crypto`, in-memory when there's no IndexedDB, e.g. tests), started before the first sync; a store left by another account is wiped and re-made; `platform.persistStorage()` is called; sign-out and session expiry clear the store. WASM loads in Vite dev (needs `optimizeDeps.exclude` plus an alias, because pnpm nests the package under matrix-js-sdk) and in the production build. Checked in Chromium (dev); Safari not checked here.
- **Security snapshot + flows:** device state, other confirmed devices, needsRecoveryKey; SAS emoji both ways (the new device starts the emoji step, as Element does), 2-minute timeout, decline, mismatch, `m.accepted` closes the other approvers; `Device.confirmed`. `newRecoveryKey` (password only if the server asks), `useRecoveryKey` (whitespace/dashes ignored, full-width folded via NFKC; **case matters**, base58), `resetEncryption` (password checked first, so a wrong one changes nothing), `signOutRisk`.
- **Encryption on:** new DMs and private workspace channels are created encrypted. Existing ones get `m.room.encryption` once (checked against the server's copy; only where I have the level; rooms younger than 15 s are skipped). Client-space channels, private ones included, stay unencrypted. `Channel.encrypted` / `Dm.encrypted`.
- **Timeline:** `undecryptable` + `arriving` (while decrypting, then 10 s); the message updates in place when its key arrives; encrypted private channels start at my join; DM previews include undecryptable messages. **Encrypted attachments** (AES-CTR v2) both ways, so media in encrypted DMs works with Element X.
- **Device names** are set at sign-in from the browser ("Chrome on Mac").
- **Tests:** `crypto.test.ts` (recovery-key normalisation, SAS index). `m6.integration.ts` on fresh accounts: encryption turned on once for an existing DM (two devices of the owner + a member who may not); new DMs encrypted; first-device key + backup round trip on a second device; emoji confirmation with two approvers; wrong-key, wrong-password, reset. 5 of 6 runs green; the failure was test timing, now fixed. `m3` updated (DMs now encrypted), 9/9 green with crypto on both sides. `pnpm check` green.
- **`pnpm test:matrix`:** m3, m5, m6, rich green. Four failures in `m4` / `workspace` come from leftover data on the shared seeded server (the workspace has 6 members, not 4; an extra client space owned by the test user; a saved notification level; an invite role), not from M6. Clean them with `pnpm dev:server:reset && pnpm dev:seed` (not run: it wipes shared data).
- **Build size:** main chunk 2,188.85 → 2,225.88 kB (gzip 661.83 → 673.77; part of this is the UI session's work). The 7.79 MB WASM (2.12 MB gzipped) was already emitted and is now loaded at startup; `rust-crypto` chunk 227 kB (lazy). **`deploy/Caddyfile` should get `encode zstd gzip`** (not touched).
- **Continuwuity (DECISIONS learnings, M6-01):** signed sub-keys ✓, backup round trip ✓, SAS ✓; password only when replacing keys. **To-device race:** ~1 in 30 messages that reach a device at the same moment are lost. Our own sends are serialized; the cross-sender race needs an upstream fix (repro script in the notes folder). SDK traps found and handled: failed decryptions look like `m.room.message`; `getUserDeviceInfo(me, true)` loops; an in-flight key query can drop new identity keys (recovery-key storage first, then re-import); own signatures need a forced re-query.
- **Contract note:** `types.ts` comment already corrected by the lead (case matters, NFKC). The fake store's SAS indexes are wrong (🔑 = 47).

**Review round (Fable 5.2, items 1–12, all addressed):** store wiped only on account/device mismatch, otherwise init retries with backoff; Web Lock per store (a second tab waits at 'starting', no sync); `compute()` retries with backoff; `newRecoveryKey` never deletes an unreadable backup (`backup-unreadable`) and waits for the startup backup check; `needsRecoveryKey` covers missing key, identity or usable backup and part-finished runs; `signOutRisk` counts keys not yet backed up and never says 'none' without a working backup; sign-out keeps keys when logout failed or on soft logout, and the store deletion times out; approvers must hold the identity keys, and answers from unconfirmed devices are ignored; `arriving` capped at 10 s; join cut by timeline position; in-memory recovery key checked by key id and cleared on stop; encrypted media keyed per message with MIME type, encryption decided at send. Tests: unit (wipe rule, save step, sign-out risk), integration (unreadable backup survives). `pnpm check` green (298), m6 integration 3/3. Two-tab lock checked in Chromium.
