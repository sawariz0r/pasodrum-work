---
id: M9-02
title: Electron desktop app (Mac), signed + auto-update, Download app back on
stage: ceo-review
area: frontend
milestone: M9
priority: P1
slice: false
depends_on: [M9-01]
created: 2026-11-22
owner: claude (m9-shell-spike session)
---

## Goal
A signed, notarized Electron app for Mac that loads https://pasodrum.work, matches the approved DES-03 boards, updates itself, and is offered via "Download for Mac" in the browser once a signed build is up.

## Acceptance criteria
- [x] `apps/desktop-electron/` grows from the spike into the app (D-44): one window (remembers size and position, first launch 1280×800, min 800×600), Mac `hiddenInset` title bar, close keeps it in the Dock, ⌘Q quits.
- [x] Web app, desktop only (`window.pasodrumShell` present): 40 px title bar in the rail colour with ← →, the search field (opens ⌘K), drag region (DesktopWindow, EN/JP × light/dark).
- [x] Notifications for mentions + DMs (DesktopNotification) through `platform.notify`. Clicking one brings the window forward at that message. NotifyAsk card as approved.
- [x] Badge = unread mentions + DMs, capped at 99+, cleared when nothing is unread (DesktopBadge, Mac Dock).
- [x] Links: pasodrum.work links stay in the app; everything else goes to the default browser.
- [x] Device name "Pasodrum work on Mac" (JP "Mac の Pasodrum work").
- [x] Update: electron-updater, generic feed on our domain (`https://pasodrum.work/download/mac/`). Downloads in the background and installs on quit. "Update ready" sidebar card (NotifyAsk's slot) → Restart; Mac app menu "Restart to Update" / "Check for Updates…" (DesktopUpdate).
- [x] Can't reach: a local page when the window can't load the app; Try again, plus automatic retry (DesktopOffline).
- [x] Signing + notarization config and scripts. The CEO puts the Apple values in the keychain/env and runs the signing step; agents never handle Apple credentials.
- [ ] "Download for Mac" (profile menu, join page header, join done) only in a browser on Mac, and only once a signed build is on the feed (DesktopDownload).
- [x] `pnpm check` green; checked in the built app and in a browser.

## Notes
- Boards: canvas page "Desktop app" → `design/canvas/Desktop{Rules,Window,Download,Update,Badge,Offline,Notification}.dc.html`; NotifyAsk(JP) too. Inventory section "Desktop app (DES-03, M9)".
- Seam: `apps/web/src/platform/desktop.ts` (`window.pasodrumShell`). Only `platform/` talks to the shell.
- Windows: no build this task (no Authenticode yet). Windows-only parts (drawn window controls, tray, taskbar overlay, Download for Windows) wait for a Windows task.
- Rules: no Shiori; never sign in to production from tooling; nothing to `main` without the CEO's yes.

## Outcome
Built on branch `claude/m9-shell-spike-cff79a` (not on `main`). Plan: Fable; build: three Opus agents (shell/signing/feed, title bar/downloads, notifications/badge/cards).

- **Shell** (`apps/desktop-electron/`, ~155-line `main.cjs`): one window that remembers its place (first 1280×800, min 800×600), `hiddenInset` traffic lights at {16,13} (red centre 22.75/19.75 pt vs the board's 22/20). Close hides it to the Dock; ⌘Q quits. EN/JP app menu with Restart to Update / Check for Updates…; links outside pasodrum.work go to the browser; "Can't reach" page (EN/JP, light/dark, retries every 5 s). Unpackaged runs default to localhost, so tooling can never reach production.
- **Web app (desktop only):** 40 px title bar in the rail colour (← →, search field opens ⌘K), drag region, header search icon hidden. Deviation: the 40 px offset is padding on the page root, not `body`, because dialogs' scroll lock zeroed body padding and pushed the app under the bar (layout fix, no visual change). Agent B's off-board hover on ← →/search was removed.
- **Notifications + badge (web and desktop):** mentions + DMs notify, but never for the conversation on screen while the window has focus, and never for muted channels. The badge counts unread mentions + DMs and caps at 99+. Clicking a notification routes to the message. The NotifyAsk card shows after the first send (not for clients, not in the app). Reading is now marked only while the window has focus. Unit-tested (`notify.test.ts`, 9 tests). Not built: the sender avatar in the banner (Electron on Mac can't show it).
- **Updates:** electron-updater, generic feed `https://pasodrum.work/download/mac/` served from a host folder (`/data/pasodrum-downloads`, Caddy `/download/*`, 404 when missing). "Update ready" card in the Home sidebar (NotifyAsk's slot; pages without that sidebar, like Activity, don't show it).
- **Signing:** hardened runtime + JIT entitlements, `CSC_NAME="PRPL development AB (754ZSYKPH7)"`, notarization through the `pasodrum-notary` keychain profile. No secrets in the repo. `pack` (ad-hoc) turns hardened runtime off because unsigned builds crash with library validation, so the first signed build is the first real test of the entitlements.
- **Download for Mac:** profile menu, join header, join done. Mac browsers only; off until `MAC_DOWNLOAD = true` in `platform/web.ts` after the first signed upload.

**Checked by the lead in the packaged app against the local stack:** title bar and traffic lights match the board; drag region set; device registered as "Pasodrum work on Mac"; badge 120 → "99+" in the Dock, 0 → cleared; a notification route from the main process lands on the page (`/activity`); `pnpm check` green.
**Signed build (CEO ran `release`, 2026-11-22):** Developer ID (754ZSYKPH7) signature, notarized + stapled, `spctl`: accepted / Notarized Developer ID. Runs with hardened runtime (crypto WASM, session kept). Notification banner shows with the app icon; clicking it brings the app forward on the route (`/dms`). Update: installed 1.0.0 → local feed with 1.0.1 → downloaded → "Update ready" card → restart → 1.0.1 installed and relaunched. dmg 120 MB, app 259 MB. The published first version is **1.0.1** (that build is in `release/`).
**Title bar fix (CEO bug, 2026-11-22):** the installed app on production put the traffic lights on the rail, because production's web app doesn't draw the 40 px bar yet. The shell now opens with the native Mac title bar and switches to the inset buttons only when the loaded page marks `<html data-desktop>` (our web app and the can't-reach page). The choice is remembered for the next launch. Checked: current production → native title bar, nothing overlapping; branch build → buttons inside the 40 px bar on Home, DMs, Activity, Docs, Boards, Settings, client space (Nordlys), EN/JP × light/dark. Sheet: side-session notes `m9-titlebar-sheet.png`. Version 1.0.2, so installed 1.0.1 copies update to the fix. Not reachable locally: the staff Pasodrum workspace (staff devices need confirming); same shell layout.
**Was:** **Not checked yet (needs the signed build):** notification banners on screen and clicking one (macOS keeps no permission for ad-hoc builds), installing an update, Gatekeeper/notarization, a real join done page from a live invite. DM notifications are covered by unit tests only (local encrypted DM accounts couldn't confirm their device).

**CEO steps:** `apps/desktop-electron/README.md` → "Release". One-time: Developer ID cert, `xcrun notarytool store-credentials pasodrum-notary`, `mkdir -p /data/pasodrum-downloads/mac` on the server. Then `npm --prefix apps/desktop-electron run release`, `spctl` check, `publish:feed`, flip `MAC_DOWNLOAD`, push (needs your yes).

## Review notes
(CEO)
