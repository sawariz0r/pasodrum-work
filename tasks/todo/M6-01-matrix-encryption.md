---
id: M6-01
title: Matrix: Rust crypto, device confirmation, recovery key + backup, encrypt DMs and private channels
stage: todo
area: frontend
milestone: M6
priority: P0
slice: false
depends_on: [M5-01]
created: 2026-11-21
owner:
---

## Goal
`apps/web/src/matrix/` implements the M6 contract (D-31; end of `types.ts`, `// M6`), replacing the stubs in `store.ts` (search "M6 stub"). Behaviour spec: `design/canvas/RulesM6.dc.html`.

## Acceptance criteria
- [ ] Rust crypto initialised (WASM loads in Vite dev + production build, Chrome and Safari), IndexedDB crypto store, `persistStorage()` through `platform/`
- [ ] `security` snapshot: device state, other confirmed devices, needsRecoveryKey (no secret storage/backup yet), confirmation flow state
- [ ] SAS emoji confirmation both directions (new device ↔ existing device; interoperable with Element X), 2-minute timeout, decline, mismatch; `Device.confirmed`
- [ ] `newRecoveryKey(password?)`: cross-signing bootstrap (UIA password if the server asks → `password-required`), secret storage + server key backup, returns the key; `useRecoveryKey` (normalises spaces/case; `wrong-key`), confirms the device and restores from backup; `resetEncryption(password)`; `signOutRisk()`
- [ ] Encryption on for all DMs and private channels, new and existing (send `m.room.encryption` once; idempotent; only where I have the power level, otherwise skip); `Channel.encrypted` / `Dm.encrypted`
- [ ] Undecryptable messages → kind `undecryptable` (with `arriving` while a key may still come, ~10 s); fade-in replaces it when the key arrives; private channels start at my join
- [ ] Verify open probe items with the SDK: signed cross-signing sub-keys on Continuwuity, key backup round trip; note findings in DECISIONS learnings
- [ ] Tests only where necessary (D-30): encryption turned on idempotently, recovery-key normalisation, backup round trip in an integration test
- [ ] `pnpm check`, `pnpm test:matrix` green; production build size noted
