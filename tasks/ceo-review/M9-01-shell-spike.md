---
id: M9-01
title: Desktop shell spike — Tauri vs Electron
stage: ceo-review
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
- [x] `apps/desktop-tauri/` and `apps/desktop-electron/` each run the web app locally on macOS.
- [x] Each checked for: notifications + dock badge; deep links (`pasodrum://` and https); sign-in with the Matrix session (IndexedDB + Rust crypto WASM store) surviving a restart; external links in the system browser; storage persistence; an auto-update path; bundle size and idle memory.
- [x] What Windows would need noted for each (not built).
- [x] Comparison table below; recommendation logged as a new D-number (Proposed) in `docs/DECISIONS.md`.
- [x] No UI built (desktop boards are designed in a parallel session). Spike folders committed on the branch only; nothing to `main`.

## Notes
- Interface: `apps/web/src/platform/index.ts`, `web.ts`, SPEC §6, D-08.
- Today the app only calls `platform.persistStorage()` and `platform.deviceName()`; notify/badge/route/openExternal are not wired yet, so the spikes exercise them from a harness.

## Outcome
Both shells run the real web app from its URL (`http://localhost:4173` here, `https://pasodrum.work` in production) through one shared seam: the shell injects `window.pasodrumShell`, `platform/desktop.ts` uses it (committed). Each shell has its own folder: `apps/desktop-tauri/`, `apps/desktop-electron/`. Full evidence is in each `RESULT.md`. Recommendation: **Tauri**, logged as **D-44 (Proposed)**.

| Check (macOS 27, arm64, local stack) | Tauri 2.12 (WKWebView) | Electron 45 (Chromium 156) |
|---|---|---|
| Notification banner | ✅ shown, no prompt (old NSUserNotification API) | ❌ not shown: unsigned build never gets the permission |
| Notification click → app opens at route | ⚠️ no plugin support; workaround built, not clicked yet | ⚠️ API exists, untested (no banner) |
| Dock badge set/clear | ⚠️ API ok, not seen (Dock hidden) | ⚠️ API ok, not seen |
| `pasodrum://` link, app running / cold | ✅ / ✅ | ✅ / ✅ |
| https links open the app | needs Developer ID + `applinks` + AASA file | same |
| Crypto WASM + encrypted DM | ✅ | ✅ |
| Signed in after Cmd-Q and kill -9 | ✅ (1 of 5 kills: blank window once) | ✅ |
| External links → system browser | ✅ | ✅ |
| `storage.persist()` | ❌ false (WebKit may evict under pressure) | ✅ true |
| Auto-update without a certificate | ✅ full cycle 0.1 → 0.2, still signed in | ❌ stops at Squirrel's signature check |
| App / installer size | **11 MB / 4.7 MB** | 259 MB / 114 MB |
| Memory at idle | **~124 MB** (5 processes) | ~211 MB (4 processes) |
| Shell code | 347 lines Rust/JS, Rust toolchain, `target/` 1.1 GB | **134 lines JS**, npm only |
| Build time cold / warm | 90 s / 6–18 s | 67 s / 57 s |
| Windows | WebView2 (Chromium), NSIS/MSI | NSIS |

**Both need for production:** an Apple Developer ID plus notarization (Gatekeeper, https links) and a Windows Authenticode certificate.

**What breaks or is missing:**
- **Tauri:** notification click needs native macOS notification code (~½ day). `persist()` is false: if WebKit evicts the store, the device signs in again and restores keys from backup. Its dmg step fails on macOS 27 (`hdiutil` "Resource busy"); I built the dmg by hand. Devices are all named "Pasodrum work" (fix: `deviceName()` override in `desktop.ts`).
- **Electron:** notifications and updates stay unproven until we have a Developer ID. It ships its own Chromium, 20× the download.

**Data left on the local stack** (none on production, Shiori untouched): a Lea↔Jonas DM (2 messages), a Lea↔Ingrid DM (1 message), a few spike devices for sofia/jonas/ingrid. sofia's cross-signing key is the probe's fake `masterprobe`, so her encrypted rooms never load; use `lea_freelance.dev` for encryption tests.

**Not done:** no UI (desktop boards are in DES-03). Nothing on `main`.

## Review notes
(CEO)
