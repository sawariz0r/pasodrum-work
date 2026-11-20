---
id: M4-01
title: Invite service (Node + node:sqlite, Resend/Mailpit)
stage: ceo-review
area: api
milestone: M4
priority: P0
slice: false
depends_on: [M0-02]
created: 2026-11-20
owner: claude (M4-01 agent)
---

## Goal
services/invite implements the invite API, registers accounts, sends the invite email, and runs locally and in the Coolify deploy.

## Acceptance criteria
- [x] All endpoints in the API notes, with the permission rules (D-25) checked using the caller's token
- [x] Registers accounts with the registration token and deterministic IDs (D-07); temporary password encrypted at rest (AES-GCM with INVITE_SECRET); claim = login with temp password → change password → set display name; revoke = invalidate the code only (D-26 amendment, account stays dormant); codes random (≥128 bit), single-use, 14-day expiry
- [x] Invite email EN/JP matching the InviteEmail board (plain, branded, one button; HTML + text), sent via Resend HTTP API when RESEND_API_KEY is set, else Mailpit's HTTP send API (dev)
- [x] Rate limits per caller and per IP; no secrets in logs
- [x] dev/docker-compose.yml runs it (port via Caddy at http://localhost:8008/api/invites); deploy/docker-compose.yml adds an `invite` service with a volume and env (REGISTRATION_TOKEN = ${SERVICE_PASSWORD_64_REGISTRATION}, INVITE_SECRET = ${SERVICE_PASSWORD_64_INVITESECRET}, RESEND_API_KEY, MAIL_FROM, PUBLIC_URL, MATRIX_URL=http://continuwuity:6167, SERVER_NAME); deploy/Caddyfile routes /api/invites/* to it; web dev server proxies /api to it
- [x] Tests: unit (codes, crypto, templates, permission rules) + integration against the local server (create → email in Mailpit → claim → sign in works; exists; invalid; revoke deactivates; expired/used)
- [x] `pnpm check` green (service typechecks and its unit tests run)

## Notes
Invite API (same origin, D-26):
- `POST /api/invites` (Bearer = caller's Matrix token) `{email, name?, role: member|guest|client, spaceId, channelIds[], locale: en|ja}` → 201 `{code, userId, link}` · 409 `{error:"exists", userId}` (account already exists: caller just sends Matrix invites) · 400 `{error:"invalid-email"}` · 403 `{error:"not-allowed"}` · 429.
- `GET /api/invites/:code` → `{email, spaceName, spaceKind, inviter?, team:[{id,name}], state: open|used|expired}`.
- `POST /api/invites/:code/claim` `{name, password}` → `{userId, identifier}` · 410 used/expired.
- `POST /api/invites/:code/resend` (Bearer) → 204 · `DELETE /api/invites/:code` (Bearer) → 204 (revoke: deactivates the unclaimed account).
- `GET /api/invites?roomId=…` (Bearer) → `[{code, email, name?, role, createdTs, link}]` pending invites that include that room.
- Permission check uses the caller's token: whoami, then the caller's membership/power level in `spaceId` (Owner/Admin may invite Members; any member may invite guests, and clients in a client space — D-25). The service then registers the account (deterministic ID per D-07), stores the temporary password encrypted, emails the link; the caller's app sends the Matrix invites to the space + channels.

## Outcome
- `services/invite`: Node 24 runs the TypeScript directly (no build, no npm deps): `node:http`, `node:sqlite`, `node:crypto`. Files: `app.ts` (routes), `rules.ts` (permissions, state, rate limiter), `matrix.ts`, `store.ts`, `email.ts`, `mail.ts`, `secret.ts`, `ids.ts`, `Dockerfile` (node:24-alpine, non-root, `/data` volume, port 8080).
- Permissions with the caller's token: whoami → space state. Member: workspace + PL ≥ 50. Guest: any workspace member. Client: client space + PL ≥ 50 (the team). Room version 12 creators count as top rank. Resend/revoke: the inviter or PL ≥ 50 in the space. List: caller joined in the room.
- Create registers with the registration token, sets display name (name, else email) and `work.pasodrum.email`, stores the temporary password sealed (AES-256-GCM, key = HKDF(INVITE_SECRET)), snapshots space name/inviter/team, mails the link. Mail failure still returns 201 with `emailed: false`; resend returns 502 then. Resend keeps the code and extends 14 days. Revoke (lead's amendment) only invalidates the code (state `revoked`, claim/resend → 410); the account stays dormant. Creating an invite for an unclaimed service-made account issues a fresh code for it (201, older codes superseded, open invite's rooms carried over); 409 only for claimed or foreign accounts.
- Extras beyond the API notes (harmless keys): preview has `name`, `userId`; list has `userId`, `expiresTs`, `state` (unclaimed invites incl. expired).
- Email: table layout matching InviteEmail (logo, space tile in the rail colour, heading, one button, "works once until …" + host), EN/JP, plus text part. Checked in Mailpit's HTML view.
- Rate limits: per IP (300/min, preview 60/min, claim 20/h) and per caller (120/min, create 60/h, resend 30/h). Logs show method, route name, status only.
- Wiring: dev compose `invite` service + volume, Caddy `/api/invites*`, `pnpm dev:server` now `--build`, Vite proxies `/api`, `INVITE_SECRET` in `dev/.env.example` (generated into `dev/.env`). Deploy compose `invite` + `invite-data` volume; deploy Caddyfile routes `/api/invites*` and trusts XFF from private ranges.
- Tests: 19 unit tests in `pnpm check`; `pnpm test:invite` (5 integration tests, all pass): create → Mailpit → preview → list → claim → sign in → second claim 410; exists 409; invalid 400; no token 401; Member→Member 403; client→client 403; Admin→client 201 (JP mail); resend; revoke → state revoked, claim 410, account still logs in → re-invite same email 201 with new code (old superseded) → claim works → then 409; expired → 410. `pnpm check` green; `docker compose -f deploy/docker-compose.yml build` builds and the image starts.
- Not done: "External emails can't be Member" (SPEC) isn't enforced server-side; expired/revoked accounts are never deactivated (see Learnings). M4-02's `previewInvite` maps unknown states to `open` and doesn't know the `revoked` state/error yet. Coolify needs `RESEND_API_KEY` (and optionally `MAIL_FROM`); `SERVICE_PASSWORD_64_INVITESECRET` is generated by Coolify and must not change.

## Review notes
(CEO)

Lead review: end-to-end in the browser: Add people by email → email in Mailpit ("Sofia Olsen added you to Pasodrum", single-use, 14 days) → join page → claim → signed in. Revoke now only kills the code (re-invite reuses the dormant account). Claim writes the space name to the person's account data so guests see their space.
