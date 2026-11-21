---
id: M4-04
title: UI: settings, join page, first sign-in
stage: done
area: frontend
milestone: M4
priority: P0
slice: false
depends_on: [M3-02]
created: 2026-11-20
owner: claude (M4-04 agent)
---

## Goal
Batch D settings, the join page and first run work end to end.

## Acceptance criteria
- [x] Profile menu → Settings (ProfileMenuSettings); Settings: Profile (name, photo, time zone from device, editable), Notifications (default + per channel levels), Appearance & language (theme, EN/JA; synced via setSetting), Devices (+Dark: list, sign out one/others) — save as you change
- [x] Join page at /join/:code (InviteLanding join/done/expired + JoinUsed + JoinWrongAccount, JP): preview, name + password with strength bar, claim, then sign in and open the invited channel; phone-friendly (D-15); Another app disclosure (server + username, copy buttons)
- [x] First run (FirstRunTeam, FirstRunClient, JP): opens the channel you were added to, everything before you joined counts as read, no tour
- [x] Tests with fakes (join states, claim errors, settings saves); browser check EN/JP × light/dark, join page at phone width
- [x] `pnpm check` green

## Notes
Owns app/settings/ (new), app/join/ (new), the profile menu entry, /settings and /join routes. Re-read App.tsx and locale files before each edit (M4-03 edits them too).

## Outcome
- **Routes (App.tsx):** `/join/:code` works signed out (JoinRoute) and signed in (JoinRouteSignedIn → JoinWrongAccount). `/settings[/notifications|appearance|devices]` opens the Settings dialog over the page you came from (or your home channel on a direct link); unknown tabs fall through to "not available". `Backend` gained `previewInvite`/`claimInvite`.
- **Join (app/join):** preview → join form (name from the email, password with the 4-step bar, show/hide) → claim → sign in → "You’re in" with Another app (server + username from the user ID, copy buttons) → Open in browser lands in the invited channel. Claim errors: used/expired (410) re-read the link and show that state; `weak-password` → "Choose a longer password"; others → "Couldn’t join". Phone width checked at 375px.
- **First run (app/join/FirstRun.tsx):** after joining, waits for a channel in the invited space, marks every channel, DM and Activity item read, sets the time zone from the device, opens the channel. No tour.
- **Settings (app/settings):** Profile (photo upload, name saved on blur/Enter, time zone select with JP city names, email read-only), Notifications (default level), Appearance & language (Light/Dark/Match system, EN/JA), Devices (this device first, sign out one/others; `PasswordRequired` → password prompt → `retry`, wrong password shown). `SettingsSync` writes language/theme to the account on every change (profile menu and rail toggle too). `prefs` gained `ThemePref` with "system".
- **Deviations (D-19, only working controls):** no "Download app"/"Download for Mac" (M9), no "Send me a new link" on expired (no invitee-side API), no "Remove" photo (contract has no removal), no Sound toggle (nothing plays sound), no device location (not in `Device`). Settings Notifications has the default level only (per-channel lives with the channel UI). Password prompt and claim-error/unreachable states are built from existing primitives without a board → inventory row "needs design".
- **Fakes:** fakeBackend join codes (`used`, `expired`, `offline`, `gone`, `weak`, `down`, anything else = open; claimed sign-in is Henrik); fakeStore keeps profile time zone, notify levels, devices, settings; `signOutOtherDevices` asks for the password ("wrong" is wrong). Dev: `/dev/app/join/<code>?signin`, `/dev/app/settings`.
- **Verified:** Join/Settings tests (20), `pnpm check` green; browser (fake store) EN/JP × light/dark for settings and join, join at 375px. Not run against the real invite service.

## Review notes
(CEO)

Lead review: join page tested end to end (wrong-account state → sign out and join → form prefilled → You're in → open app) and guest first run lands in #design. Password prompt / join errors / link-not-found have no boards yet (inventory).
