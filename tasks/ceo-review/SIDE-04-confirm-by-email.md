---
id: SIDE-04
title: Confirm by email for clients and Externals (D-38)
stage: ceo-review
area: security
milestone: SIDE
priority: P1
slice: false
depends_on: [M6-02, P-01]
created: 2026-11-21
owner: email-confirm session (branch claude/email-confirm-06bda5)
---

## Goal
Clients and Externals confirm a new device by email instead of a recovery key (D-38), matching the approved EmailConfirm* boards in EN/JP × light/dark. Staff unchanged.

## Acceptance criteria
- [x] Invite service: encrypted key store (clients/Externals only), confirm start / link preview / tap / one-time collect, help DM from the "Pasodrum" system account, rate limits.
- [x] Matrix layer: silent key creation, hand-over and migration; email path; system DM mapping.
- [x] App: EmailConfirm screens, link page `/confirm/:code` (phones too), staff help card; recovery-key UI hidden for clients/Externals.
- [x] Tests (D-30): key only to the asking device after the tap, once; opening doesn't confirm; expired/replaced links fail; staff keys never stored; help rate limit; one local e2e.
- [x] `pnpm check` + web build green; production script for the system account (not run).

## Notes
Plan: side-session notes `email-confirm-plan.md` + `email-confirm-lead-overrides.md`. Boards: `design/canvas/EmailConfirm*.dc.html`; rules `EmailConfirmRules`.

## Outcome
- **Invite service** (`services/invite/src/confirm.ts`, `help.ts`): 9 endpoints under `/api/invites/confirm` (no Caddy change). Keys sealed AES-256-GCM (AAD = user ID, `CONFIRM_KEY_SECRET`), refused and deleted for anyone in the workspace. The link is bound to the user, device and session that asked; opening never writes; the tap and the release are atomic and single use. Help DMs come from `@pasodrum` in unencrypted, read-only rooms, at most one per 10 minutes.
- **Matrix layer** (`matrix/confirm.ts`, `store.ts`): silent first key and M6 migration through one keyId reconcile rule (never resets a backup); email path polls, collects once, then `useRecoveryKey`; the system DM is trusted only from `@pasodrum` in a room it created; a staff session makes one call so the service drops any key held from before they joined.
- **App:** EmailConfirm screens (gate, other device, sent, done, help, helped), the link page `/confirm/:code` (works on phones and signed out), the staff help card, the recovery-key UI hidden for clients and Externals, and gallery entries.
- **Tests:** `services/invite/test/confirm.integration.ts` (4 groups: one device, after the tap, once, also against a re-login with the same device ID; opening doesn't confirm; replaced or expired links; staff never stored; help limit) and `apps/web/src/matrix/emailConfirm.integration.ts` (client on a new device → Mailpit → tap → confirmed, history readable). Also walked through by hand in a browser on the local stack.
- **Production:** Coolify generates `SERVICE_PASSWORD_64_CONFIRMKEYS` and `SERVICE_PASSWORD_64_SYSTEM`; the invite service creates the Pasodrum account itself at startup; turn Resend click/open tracking off for the sending domain.
- **Gaps** logged in INVENTORY (failure line, no-key, sign-out/reset copy). JP "Email {name}" button reads 「{{name}} さんにメールを送る」 (the locale check needs the same variables); faces use the app's colour per person; the email's tile is a ✓ glyph (mail clients drop SVG).

## Review notes
