---
id: M0-05
title: Element X smoke test
stage: done
area: infra
milestone: M0
priority: P0
slice: false
depends_on: [M0-04]
created: 2026-11-20
owner:
---

## Goal
Element X (iOS/Android) signs in to production, sees the workspace channels it's allowed to, and chats with an account using Element Web.

## Acceptance criteria
- [x] Sign-in works (sliding sync)
- [x] Client account sees only its client space
- [x] Thread replies and mentions readable
- [x] Custom state / extra keys don't break rendering
- [x] Findings recorded in docs/probe-results.md

## Notes
Must-have rows from the probe table.

## Outcome
CEO signed in with Element X on production as @oscar:pasodrum.work and checked the seeded workspace, client space and threads; client view checked in Element Web as henrik. Result: "LGTM".

## Review notes
(CEO)
