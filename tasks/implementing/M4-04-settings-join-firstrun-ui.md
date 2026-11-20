---
id: M4-04
title: UI: settings, join page, first sign-in
stage: todo
area: frontend
milestone: M4
priority: P0
slice: false
depends_on: [M3-02]
created: 2026-11-20
owner:
---

## Goal
Batch D settings, the join page and first run work end to end.

## Acceptance criteria
- [ ] Profile menu → Settings (ProfileMenuSettings); Settings: Profile (name, photo, time zone from device, editable), Notifications (default + per channel levels), Appearance & language (theme, EN/JA; synced via setSetting), Devices (+Dark: list, sign out one/others) — save as you change
- [ ] Join page at /join/:code (InviteLanding join/done/expired + JoinUsed + JoinWrongAccount, JP): preview, name + password with strength bar, claim, then sign in and open the invited channel; phone-friendly (D-15); Another app disclosure (server + username, copy buttons)
- [ ] First run (FirstRunTeam, FirstRunClient, JP): opens the channel you were added to, everything before you joined counts as read, no tour
- [ ] Tests with fakes (join states, claim errors, settings saves); browser check EN/JP × light/dark, join page at phone width
- [ ] `pnpm check` green

## Notes
Owns app/settings/ (new), app/join/ (new), the profile menu entry, /settings and /join routes. Re-read App.tsx and locale files before each edit (M4-03 edits them too).

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
