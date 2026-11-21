---
id: M0-02
title: Docker dev stack (Continuwuity, Mailpit, Caddy)
stage: done
area: infra
milestone: M0
priority: P0
slice: false
depends_on: [M0-01]
created: 2026-11-20
owner: claude
---

## Goal
`pnpm dev:server` starts a local Continuwuity with registration-token signup, Mailpit and Caddy, reachable at a local HTTPS-ish origin with CORS and .well-known served.

## Acceptance criteria
- [x] dev/docker-compose.yml with continuwuity, mailpit, caddy
- [x] Server name for dev is disposable (e.g. pasodrum.localhost)
- [x] Registration token from dev/.env (gitignored), example in dev/.env.example
- [x] Simplified Sliding Sync enabled if the server supports it
- [x] `pnpm dev:server` / `pnpm dev:server:reset` documented in AGENTS §5

## Notes
Image and config keys must be verified against Continuwuity's current docs; record surprises as Learnings.

## Outcome
- `dev/docker-compose.yml` (Continuwuity, Caddy on :8008, Mailpit UI on :8025), `dev/continuwuity.toml`, `dev/Caddyfile`, `dev/.env.example`; `dev/.env` generated locally (gitignored).
- Scripts: `pnpm dev:server`, `dev:server:stop`, `dev:server:reset`, `dev:server:logs`.
- Verified: `/versions` up to v1.18 with `org.matrix.simplified_msc3575: true`; login flows password + token; `.well-known/matrix/client` served; CORS correct on GET and preflight (single header, from Continuwuity).
- Not verified yet: SMTP delivery to Mailpit (config accepted, no errors) — covered by M0-03 probe.
- Findings logged under Learnings in DECISIONS.md.

## Review notes
(CEO)
