---
id: DES-03
title: Desktop shell boards (M9)
stage: done
owner: design session (des02-inventory-gaps worktree, branch claude/m9-desktop-boards-3438be)
priority: P1
depends_on: []
---

## Goal
Boards for the few states that exist only in the desktop app, so M9 can build the shell. Shell-neutral: they work for Tauri and Electron (the spike decides). The app inside the window is the web app unchanged; no shell redesign.

## Minimum desktop-only states
Reused as is (already approved): DesktopNotification, Offline/Reconnecting/BackOnline (once the app has loaded), SignIn, Window1024/Window800 (narrow windows), device confirmation (M6), InviteLanding.

| State | Board | Tag |
|---|---|---|
| Rules: window, close, links, badge, updates, device name, where Download shows | DesktopRules | NEW |
| Download app: profile menu item (browser on Mac/Windows only) + the two InviteLanding buttons re-enabled, label per OS | DesktopDownload | CHANGED |
| App window + our own title bar (← →, ⌘K search), sign-in, then the workspace | DesktopWindow | NEW |
| Update ready: sidebar card (NotifyAsk pattern) → Restart; Mac app menu | DesktopUpdate | NEW |
| Dock / taskbar badge, Windows tray menu | DesktopBadge | NEW |
| Can't reach Pasodrum work: the window can't load the app at all | DesktopOffline | NEW |

Opening a link needs no screen: rules only (pasodrum.work links inside the app stay in the app; others open the default browser; links opened outside the app open in the browser).

## Done when
- [x] Boards on the canvas Discovery page, section "DES-03 · Desktop shell · for approval", each tagged NEW/CHANGED; EN/JP × light/dark.
- [x] Mirrored in `design/canvas/`, INVENTORY rows `designed`, `pnpm canvas:map` run.
- [x] CEO approves in the DES-03 chat → boards move to a "Desktop app" page, rows `approved`, commit on the branch, ask before pushing to `main`.

## Outcome
2026-11-22: six boards published to the canvas Discovery page (version 84), mirrored in `design/canvas/`, INVENTORY section "Desktop app (DES-03, M9)" rows `designed`, CANVAS-MAP regenerated. Title bar redrawn as our own (CEO asked). Choices to confirm: no Mac menu bar icon, Windows closes to the tray, badge = mentions + DMs only, no link hand-off page. Awaiting CEO approval; nothing committed.
Approved by the CEO 2026-11-22 (custom title bar, no shortcut hint in the search field). Boards moved to the canvas page "Desktop app" (v87); INVENTORY rows approved.
