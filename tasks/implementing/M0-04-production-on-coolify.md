---
id: M0-04
title: Production on Coolify
stage: implementing
area: infra
milestone: M0
priority: P1
slice: false
depends_on: [M0-02]
created: 2026-11-20
owner: claude
---

## Goal
Production Continuwuity runs on the CEO's Coolify over real HTTPS (no staging, D-18), so Element X and Safari can be tested.

## Acceptance criteria
- [x] Host chosen: CEO's Coolify, Docker Compose build pack (D-17)
- [x] `deploy/docker-compose.yml` (env-only config, Coolify TLS, generated registration token) — boots locally, serves https `.well-known`, sliding sync on
- [x] Repo pushed to `sawariz0r/pasodrum-work`
- [ ] Coolify resource created with `SERVER_NAME` + domain; CEO registers his own account first with the one-time bootstrap token (it becomes server admin)
- [ ] `pnpm dev:seed` + `pnpm probe` against production (`MATRIX_BASE`, `MATRIX_SERVER`, `REGISTRATION_TOKEN` from `dev/.env.production`)

## Notes
CEO sets up the Coolify resource and DNS. Run seed/probe against production with:
`set -a; . dev/.env.production; set +a; pnpm dev:seed && pnpm probe` (Coolify: Base Directory `/deploy`, Compose Location `/docker-compose.yml`) where `dev/.env.production` (gitignored) has MATRIX_BASE, MATRIX_SERVER, REGISTRATION_TOKEN (no BOOTSTRAP_TOKEN: the CEO's account already used it). Seed accounts get removed before a second real person joins (D-18).

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
