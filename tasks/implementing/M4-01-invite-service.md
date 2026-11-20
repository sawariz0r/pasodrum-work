---
id: M4-01
title: Invite service (Node + node:sqlite, Resend/Mailpit)
stage: todo
area: api
milestone: M4
priority: P0
slice: false
depends_on: [M0-02]
created: 2026-11-20
owner:
---

## Goal
services/invite implements the invite API, registers accounts, sends the invite email, and runs locally and in the Coolify deploy.

## Acceptance criteria
- [ ] All endpoints in the API notes, with the permission rules (D-25) checked using the caller's token
- [ ] Registers accounts with the registration token and deterministic IDs (D-07); temporary password encrypted at rest (AES-GCM with INVITE_SECRET); claim = login with temp password → change password → set display name; revoke = deactivate; codes random (≥128 bit), single-use, 14-day expiry
- [ ] Invite email EN/JP matching the InviteEmail board (plain, branded, one button; HTML + text), sent via Resend HTTP API when RESEND_API_KEY is set, else Mailpit's HTTP send API (dev)
- [ ] Rate limits per caller and per IP; no secrets in logs
- [ ] dev/docker-compose.yml runs it (port via Caddy at http://localhost:8008/api/invites); deploy/docker-compose.yml adds an `invite` service with a volume and env (REGISTRATION_TOKEN = ${SERVICE_PASSWORD_64_REGISTRATION}, INVITE_SECRET = ${SERVICE_PASSWORD_64_INVITESECRET}, RESEND_API_KEY, MAIL_FROM, PUBLIC_URL, MATRIX_URL=http://continuwuity:6167, SERVER_NAME); deploy/Caddyfile routes /api/invites/* to it; web dev server proxies /api to it
- [ ] Tests: unit (codes, crypto, templates, permission rules) + integration against the local server (create → email in Mailpit → claim → sign in works; exists; invalid; revoke deactivates; expired/used)
- [ ] `pnpm check` green (service typechecks and its unit tests run)

## Notes
Invite API (same origin, D-26):
- `POST /api/invites` (Bearer = caller's Matrix token) `{email, name?, role: member|guest|client, spaceId, channelIds[], locale: en|ja}` → 201 `{code, userId, link}` · 409 `{error:"exists", userId}` (account already exists: caller just sends Matrix invites) · 400 `{error:"invalid-email"}` · 403 `{error:"not-allowed"}` · 429.
- `GET /api/invites/:code` → `{email, spaceName, spaceKind, inviter?, team:[{id,name}], state: open|used|expired}`.
- `POST /api/invites/:code/claim` `{name, password}` → `{userId, identifier}` · 410 used/expired.
- `POST /api/invites/:code/resend` (Bearer) → 204 · `DELETE /api/invites/:code` (Bearer) → 204 (revoke: deactivates the unclaimed account).
- `GET /api/invites?roomId=…` (Bearer) → `[{code, email, name?, role, createdTs, link}]` pending invites that include that room.
- Permission check uses the caller's token: whoami, then the caller's membership/power level in `spaceId` (Owner/Admin may invite Members; any member may invite guests, and clients in a client space — D-25). The service then registers the account (deterministic ID per D-07), stores the temporary password encrypted, emails the link; the caller's app sends the Matrix invites to the space + channels.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
