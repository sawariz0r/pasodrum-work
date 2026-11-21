---
id: M9-01
title: Desktop shell spike — Tauri vs Electron
stage: implementing
area: infra
milestone: M9
priority: P1
slice: false
depends_on: [M1-03]
created: 2026-11-22
owner: claude (m9-shell-spike session)
---

## Goal
A one-day spike each of Tauri and Electron wrapping the existing web app against the `platform/` interface (D-08), then one recommended shell logged as a Proposed decision for the CEO to pick.

## Acceptance criteria
- [ ] `apps/desktop-tauri/` and `apps/desktop-electron/` each run the web app locally on macOS.
- [ ] Each checked for: notifications + dock badge; deep links (`pasodrum://` and https); sign-in with the Matrix session (IndexedDB + Rust crypto WASM store) surviving a restart; external links in the system browser; storage persistence; an auto-update path; bundle size and idle memory.
- [ ] What Windows would need noted for each (not built).
- [ ] Comparison table below; recommendation logged as a new D-number (Proposed) in `docs/DECISIONS.md`.
- [ ] No UI built (desktop boards are designed in a parallel session). Spike folders committed on the branch only; nothing to `main`.

## Notes
- Interface: `apps/web/src/platform/index.ts`, `web.ts`, SPEC §6, D-08.
- Today the app only calls `platform.persistStorage()` and `platform.deviceName()`; notify/badge/route/openExternal are not wired yet, so the spikes exercise them from a harness.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
