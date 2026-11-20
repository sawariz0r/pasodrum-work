---
id: M0-04
title: Staging server with HTTPS
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
A disposable staging Continuwuity is reachable over real HTTPS so Element X and Safari can be tested.

## Acceptance criteria
- [x] Host chosen: CEO's Coolify, Docker Compose build pack (D-17)
- [x] `deploy/docker-compose.yml` (env-only config, Coolify TLS, generated registration token) — boots locally, serves https `.well-known`, sliding sync on
- [ ] Repo pushed to `sawariz0r/pasodrum-work`; Coolify resource created with `SERVER_NAME` + domain
- [ ] `pnpm dev:seed` + `pnpm probe` against staging (`MATRIX_BASE`, `MATRIX_SERVER`, tokens from `dev/.env.staging`)

## Notes
CEO sets up the Coolify resource and DNS. Run seed/probe against staging with:
`set -a; . dev/.env.staging; set +a; pnpm dev:seed && pnpm probe` where `dev/.env.staging` (gitignored) has MATRIX_BASE, MATRIX_SERVER, REGISTRATION_TOKEN, BOOTSTRAP_TOKEN.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
