---
id: M0-01
title: Repo OS and pnpm workspace
stage: ceo-review
area: foundations
milestone: M0
priority: P0
slice: false
depends_on: []
created: 2026-11-20
owner: claude
---

## Goal
The repo has the operating docs, a pnpm workspace with `apps/web` and `services/invite` stubs, and a `pnpm check` that runs (even if it checks little yet).

## Acceptance criteria
- [x] AGENTS.md, SPEC, DECISIONS, tasks/, design/INVENTORY.md in place
- [x] pnpm workspace with apps/web (Vite+React+TS) and services/invite (Node+TS) stubs
- [x] `pnpm check` runs typecheck + lint + unit tests offline
- [x] Boundary lint rules sketched (matrix/ only SDK importer, platform/ only native APIs)
- [x] .gitignore covers node_modules, .env, dev data

## Notes
SPEC §6 for folder layout; D-02, D-03.

## Outcome
- Repo OS: AGENTS.md, CLAUDE.md, docs/SPEC.md, docs/DECISIONS.md (D-01…D-16), tasks/ board, design/INVENTORY.md.
- pnpm workspace: `apps/web` (Vite 8 + React 19 + TS 5.9, renders nothing until M1 screens are approved), `services/invite` stub.
- `pnpm check` = typecheck (both packages) + ESLint + Vitest; ~4 s locally.
- Boundary lint in `eslint.config.js`: SDK only in `matrix/`; `app/` can't import feature folders; `ui/` can't import SDK/matrix/app/features. Verified by a throwaway file that tripped both rules.
- `platform/index.ts` holds the Platform interface; `features/index.ts` is the empty registry.

## Review notes
(CEO)
