---
id: SIDE-09
title: Save the recovery key somewhere (Passwords or a file), not just Copy
stage: ceo-review
area: frontend
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-22
owner: side09 session (Claude)
---

## Goal (CEO)
"Make it so that you can prompt to save the recovery key and save it somewhere. So you don't have to copy and then 'aaah where do I save this'."

## Plan (checked in real browsers, 2026-11-22)
- **Chrome, Edge, Arc (Chromium):** "Save to Passwords" → `navigator.credentials.store(new PasswordCredential({ id: 'Recovery key', name: 'Pasodrum work', password: key }))`. Chrome 157 shows its own "Save password?" bubble with no extra gesture (screenshot taken). `store()` resolves before the person answers, so the button's ✓ means "offered".
- **Safari, Firefox, the Mac app:** "Download" → `Pasodrum recovery key.txt` from a Blob URL (revoked right after). Electron has no download handler, so the Mac app shows the macOS Save panel.
- **Copy stays.** Staff only: clients/Externals confirm by email (D-38) and never reach the save step.
- **Cut:** Safari/iCloud Passwords (a submitted username+password form with a JS-set value got no save prompt in Safari), Mac app Keychain via `safeStorage` (the key stays on that one Mac, so it isn't a backup, and it needs a new signed app release), share sheet (a third button).
- Choice lives in `platform/` (`savesPasswords()`, `saveSecret()`, `downloadText()`), since it's browser-shell API.

## Acceptance criteria
- [x] Boards approved (CEO, 2026-11-22); moved to canvas page Devices → "Save the recovery key (SIDE-09)", replacing RecoveryKeySave(+JP, Dark) (canvas v99)
- [x] Save step shows Copy + one of Save to Passwords / Download; ✓ state after
- [x] Key never goes into logs, URLs, localStorage, analytics, or the network (unit tests in `platform/web.test.ts`)
- [x] `pnpm check` green; Chrome and Mac app checked; Safari not clicked through (see Review notes)

## Outcome
- `platform/`: `savesPasswords()`, `savePassword()`, `saveTextFile()`; the desktop app says `savesPasswords: false` (web-side, so the live 1.0.2 app gets it with no new release).
- Save step (`SecurityProvider.tsx`): Copy + Save to Passwords (Chromium) or Download (Safari, Firefox, Mac app); ✓ Saved / ✓ Downloaded after. A rejected password save (an Electron-based browser) falls back to the file.
- Strings `security.savePasswords|savedPasswords|download|downloaded|keyFile` in EN/JP.
- Checked: Chrome (`/dev/app` test mode) → ✓ Saved and no network requests; Chrome test profile showed the "Save password?" bubble; local Electron build → Download opens the macOS Save panel ("Pasodrum recovery key.txt"); the Electron-browser fallback wrote the file with the right key.
- Learning in DECISIONS (Learnings).

## Review notes
- Safari not clicked through (automation can only take screenshots in Safari). It takes the same Download path as the Mac app. CEO: try once in Safari.
- ✓ Saved in Chrome means the browser offered to save it; the page can't tell if "No thanks" was clicked. In the Mac app, ✓ Downloaded also shows if the Save panel is cancelled.
- `design/canvas/Main.dc.html` and `canvas.json` are the live canvas copy (v99), which includes other sessions' canvas edits.
(CEO)
