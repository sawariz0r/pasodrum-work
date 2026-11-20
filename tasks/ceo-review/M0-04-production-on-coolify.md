---
id: M0-04
title: Production on Coolify
stage: ceo-review
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
- [x] Continuwuity live at https://pasodrum.work (Let's Encrypt, HTTP→HTTPS, `.well-known`, password login, sliding sync) — checked 2026-11-20
- [x] `web` service (app + Caddy forwarding Matrix paths) added and tested locally
- [x] Domain moved from `continuwuity` to `web` in Coolify (internal port 80); CEO registers his own account first with the one-time bootstrap token (it becomes server admin)
- [x] `pnpm dev:seed` + `pnpm probe` against production — all must-haves pass, 15/18 (2 mail rows skipped), same as local; see docs/probe-results-pasodrum.work.md (`MATRIX_BASE`, `MATRIX_SERVER`, `REGISTRATION_TOKEN` from `dev/.env.production`)

## Notes
CEO sets up the Coolify resource and DNS. Run seed/probe against production with:
`set -a; . dev/.env.production; set +a; pnpm dev:seed && pnpm probe` (Coolify: Base Directory `/deploy`, Compose Location `/docker-compose.yml`) where `dev/.env.production` (gitignored) has MATRIX_BASE, MATRIX_SERVER, REGISTRATION_TOKEN (no BOOTSTRAP_TOKEN: the CEO's account already used it). Seed accounts get removed before a second real person joins (D-18).

## Outcome
- Production Continuwuity live at https://pasodrum.work (Coolify, Let's Encrypt). CEO's admin account `@oscar:pasodrum.work` created first with the bootstrap token.
- `pnpm setup:prod` writes `dev/.env.production` after checking the token with the server. Seed accounts on remote servers get a random password stored in the gitignored seed file.
- `node dev/invite-me.ts <localpart>` adds a real account to the seeded workspace + client space as Owner.
- Live 2026-11-20: https://pasodrum.work serves the app (sign-in renders, no console errors); `/_matrix` and `.well-known` reach continuwuity through the web container; assets immutable-cached; no dev URL in the build.
- Gotcha: a Coolify domain row belongs to one service; changing its port doesn't move it. Delete and re-add on `web` (port 80).

## Review notes
(CEO)
