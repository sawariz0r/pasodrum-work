---
id: M6-02
title: UI: confirm gate, approve dialog, recovery key, reset, undecryptable rows, sign-out warning, Devices
stage: todo
area: frontend
milestone: M6
priority: P0
slice: false
depends_on: [M5-02]
created: 2026-11-21
owner:
---

## Boards (design/canvas/, approved) — read RulesM6 first
ConfirmGate(+JP, Dark), ConfirmGateNoDevice, ConfirmWaiting, ConfirmCompare(+JP), ConfirmDone, ConfirmDeclined, ConfirmTimeoutJP, ConfirmMismatch · ApproveAsk(+JP), ApproveCompare, ApproveDone, ApproveDark · RecoveryKeySave(+JP, Dark), RecoveryKeyPassword, RecoveryKeyEnter(+JP), RecoveryKeyWrong · ResetConfirm(+JP), ResetWrongPassword · UndecryptableDM, UndecryptableThread, UndecryptableJP, UndecryptableDark · SignOutWarn(+JP), SignOutNoBackup · SettingsDevicesM6(+JP, Dark), SettingsDevicesUnconfirmed

## Acceptance criteria
- [ ] Gate on encrypted channels/DMs when `security.device === 'unconfirmed'` (Use another device / Use recovery key / Can't confirm?); NoDevice variant when `otherConfirmedDevices === 0`
- [ ] Confirmation dialog driven by `security.confirmation` for both roles, all phases; approver dialog appears over whatever is open
- [ ] RecoveryKeySave when `needsRecoveryKey` and an encrypted conversation is opened (shown once, Copy, "I've saved it", no close); password step on `password-required`
- [ ] Recovery key entry (spaces don't matter, wrong-key state keeps text), reset flow with password, new key from Settings → Devices
- [ ] Undecryptable row (+ collapsed run, arriving shimmer, fade-in) in channel, thread and DM list preview
- [ ] Sign-out: `signOutRisk()` → SignOutWarn / SignOutNoBackup, else instant
- [ ] Settings → Devices: Not confirmed tag, Recovery key row, Confirm on this device
- [ ] SAS emoji names EN/JP from the Matrix SAS table (check the JP names against the spec table, not memory)
- [ ] EN/JP, light/dark; tests only where necessary (D-30); `pnpm check` green; browser-checked against the fake backend
