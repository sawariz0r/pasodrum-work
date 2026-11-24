---
id: OPS-02
title: Invite emails on production
stage: ceo-review
area: infra
milestone: side
priority: P0
slice: false
depends_on: []
created: 2026-11-24
owner: client-join fixes session (Claude)
---

## Goal
Invite and confirm emails go out on production, and when they can't, the log says why.

## Acceptance criteria
- [x] No silent fallback to a Mailpit host; the service says `MAIL IS OFF` at start and keeps running (D-56).
- [x] A failed send logs the provider's reason.
- [ ] CEO: `RESEND_API_KEY` is set on the invite service in Coolify and the start log says `mail via Resend`.
- [ ] A real invite email arrives on production.

## Notes
The app is built to email the client (D-26, M5-01). On the CEO's test the invite was created and only the send failed, silently. Most likely cause: the key is empty or wrong in Coolify (not confirmed; needs the CEO). Confirm by email (SIDE-04) uses the same mailer, so it is affected too.

## Outcome
2026-11-24: code built, nothing committed. Unit tests cover "not configured" and a failed Resend reply. Locally the rebuilt service starts with `mail via Mailpit` and an invite returned `emailed: true`.
Waiting on the CEO: check the key in Coolify. After the next deploy the invite service log shows `mail via Resend` or `mail via NOTHING`, and any failure as `invite mail failed: … <reason>`.

## Review notes
(CEO)
