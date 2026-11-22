---
id: DES-07
title: Desktop Restart shows that it's working, and says when the install failed
stage: ceo-review
area: design
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-22
owner: restart-fix session (Claude)
---

## Goal (CEO)
"When I press restart in the Electron app, nothing happens. No indication of failure, no indication that something is ongoing."

## Findings (2026-11-22)
- Installed app 1.0.1 at `~/Applications/Pasodrum work.app`; 1.0.2 downloaded 13:22. Squirrel's prepared bundle (`update.8tkroj5`) is gone and `ShipItState.plist` has `launchAfterInstallation = false`: preparing failed, yet electron-updater still fired `update-downloaded`, so the card showed.
- `MacUpdater.quitAndInstall()` then waits forever for Squirrel; `main.cjs` swallows every updater error (`updater.on('error', () => { quitting = false; })`), logs nowhere.
- The bundle is owned by `root:wheel` (the 1.0.0 → 1.0.1 install ran privileged), so every update needs an admin prompt; a stale system job `work.pasodrum.app.ShipIt` is still registered.

## Proposal (canvas v101, Discovery "DES-07 · Restart feedback · for approval")
Board `DesktopRestart`:
- **CHANGED** vs DesktopUpdate: after Restart the button keeps its colour and shows three dots + "Restarting…" / "再起動中…" (the approved Share earlier messages busy button), until the app quits.
- **NEW**: install failed → macOS alert "Couldn't install the update" / "更新をインストールできませんでした", buttons Later / Download (あとで / ダウンロード). No detail line; the error goes to `~/Library/Logs/Pasodrum work/updater.log`. Download opens /download/mac.

## Build plan (after approval; Fable plan, 2026-11-22)
1. `apps/desktop-electron/main.cjs`: file logger; track Squirrel's own `update-downloaded`; Restart re-triggers Squirrel if it never got the update; error after a press → alert, reset `quitting`; background errors log only. `ipcMain.handle('restart')` resolves only on failure.
2. `preload.cjs` → `ipcRenderer.invoke('restart')`; `Platform.restartToUpdate(): Promise<void>`; `app/notify/update.ts` + `SideCard.tsx` busy state; new string `desktop.restarting` (en/ja).
3. Ship as Mac app 1.0.3 (release + publish:feed); web part deploys with `main`.
4. CEO unsticks the current install first (chown the bundle, boot out the stale job, clear the ShipIt cache).

## Acceptance criteria
- CEO approves the Discovery board.
- Pressing Restart shows the busy button at once; the app quits and relaunches on the new version, or the alert appears and Restart works again.
- `pnpm check` green; failure path checked with a local unsigned build; success path with a signed 1.0.3 → 1.0.4 local feed.
- After approval: board moves to the Desktop app page, tags removed, inventory row `approved`.

## Outcome
Board approved by the CEO 2026-11-22 ("Approve, build it"); canvas v102, `DesktopRestart` on the Desktop app page. Not committed.
- `main.cjs`: updater log at `~/Library/Logs/Pasodrum work/updater.log`; Squirrel's own `update-downloaded` tracked; Restart asks Squirrel again when it never got the update; an error after a press resolves the renderer's promise and opens the macOS alert (Download → /download/mac, Later); background errors log only. `ipcMain.handle('restart')`; menu uses the same path. Version 1.0.3.
- Web: `Platform.restartToUpdate(): Promise<void>`; `restartUpdate()`/`useRestarting()` in `app/notify/update.ts`; card button keeps its colour with dots + `desktop.restarting` (Restarting… / 再起動中…), `aria-busy`, ignores presses. Old shells return nothing, so the busy state clears at once there.
- `pnpm check` green (361 tests).
- Local test (ad-hoc build `PasodrumTest` 1.0.3 + local 1.0.4 feed): reproduced the bug (Squirrel failed to prepare, "Update ready" still offered); the failure went to the log with no alert at launch. Not yet checked: pressing Restart in that build (computer-use access declined), the busy card in a browser (it only shows inside the Mac app), the signed success path.
