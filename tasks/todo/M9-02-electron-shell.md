---
id: M9-02
title: Electron desktop app (Mac), signed + auto-update, Download app back on
stage: todo
area: frontend
milestone: M9
priority: P1
slice: false
depends_on: [M9-01]
created: 2026-11-22
owner:
---

## Goal
A signed, notarized Electron app for Mac that loads https://pasodrum.work, matches the approved DES-03 boards, updates itself, and is offered via "Download for Mac" in the browser once a signed build is up.

## Acceptance criteria
- [ ] `apps/desktop-electron/` grows from the spike into the app (D-44): one window (remembers size and position, first launch 1280×800, min 800×600), Mac `hiddenInset` title bar, close keeps it in the Dock, ⌘Q quits.
- [ ] Web app, desktop only (`window.pasodrumShell` present): 40 px title bar in the rail colour with ← →, the search field (opens ⌘K), drag region (DesktopWindow, EN/JP × light/dark).
- [ ] Notifications for mentions + DMs (DesktopNotification) through `platform.notify`. Clicking one brings the window forward at that message. NotifyAsk card as approved.
- [ ] Badge = unread mentions + DMs, capped at 99+, cleared when nothing is unread (DesktopBadge, Mac Dock).
- [ ] Links: pasodrum.work links stay in the app; everything else goes to the default browser.
- [ ] Device name "Pasodrum work on Mac" (JP "Mac の Pasodrum work").
- [ ] Update: electron-updater, generic feed on our domain (`https://pasodrum.work/download/mac/`). Downloads in the background and installs on quit. "Update ready" sidebar card (NotifyAsk's slot) → Restart; Mac app menu "Restart to Update" / "Check for Updates…" (DesktopUpdate).
- [ ] Can't reach: a local page when the window can't load the app; Try again, plus automatic retry (DesktopOffline).
- [ ] Signing + notarization config and scripts. The CEO puts the Apple values in the keychain/env and runs the signing step; agents never handle Apple credentials.
- [ ] "Download for Mac" (profile menu, join page header, join done) only in a browser on Mac, and only once a signed build is on the feed (DesktopDownload).
- [ ] `pnpm check` green; checked in the built app and in a browser.

## Notes
- Boards: canvas page "Desktop app" → `design/canvas/Desktop{Rules,Window,Download,Update,Badge,Offline,Notification}.dc.html`; NotifyAsk(JP) too. Inventory section "Desktop app (DES-03, M9)".
- Seam: `apps/web/src/platform/desktop.ts` (`window.pasodrumShell`). Only `platform/` talks to the shell.
- Windows: no build this task (no Authenticode yet). Windows-only parts (drawn window controls, tray, taskbar overlay, Download for Windows) wait for a Windows task.
- Rules: no Shiori; never sign in to production from tooling; nothing to `main` without the CEO's yes.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
