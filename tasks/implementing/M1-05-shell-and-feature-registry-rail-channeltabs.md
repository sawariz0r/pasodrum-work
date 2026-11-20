---
id: M1-05
title: Shell, sign-in and feature registry
stage: implementing
area: frontend
milestone: M1
priority: P0
slice: true
depends_on: [M1-01, M1-02, M1-03]
created: 2026-11-20
owner: claude
---

## Goal
The approved shell and sign-in flow run in the browser against the D-19 store contract, with the feature registry wired for rail items and channel tabs.

## Acceptance criteria
- [ ] React Router: `/signin`, `/w/:spaceId/c/:channelId`, `/` redirects to the last or first channel, catch-all → NotAvailable page (approved artboard)
- [ ] Sign-in (SignIn, SignInJP, SignInWrongPassword, SignInServerDown, SessionExpired artboards): email → password, Change, Other server, errors, IME-safe Enter; SSO button only if the server offers it; no Forgot password link yet (D-19)
- [ ] App start skeleton (AppStart) while connection is 'starting'
- [ ] Shell per Main/MainJP/Dark: rail (space tiles with active state and attention dot, theme toggle, profile avatar menu per LanguageMenu: English/日本語, sign out), sidebar (space name, channels with private lock, unread bold, mention badge), header (channel name), tab bar (Messages + registered channelTabs), main area mounts `<ChannelView channelId>` from app/timeline (owned by M1-06)
- [ ] Connection banners (Offline, Reconnecting with Try now → reconnectNow, BackOnline briefly)
- [ ] Narrow windows per Window1024/Window800/Window800Sidebar: at ≤800px the sidebar becomes a drawer opened from the header
- [ ] Theme (light/dark, remembered) and language switch take effect instantly; `<html lang>` and `data-theme` set
- [ ] Registry: `defineFeature` + `app/registry.ts` with `rail` and `channelTabs` extension points; `features/index.ts` stays empty; tab bar renders stored tabs ∩ registered types (stored tabs come later; M1 = Messages only)
- [ ] M1-07 included: CI test renders the shell with `features = []` and with a fixture of stored tabs whose types aren't registered — no errors, only Messages tab
- [ ] Component tests with `createFakeStore()`; checked in a browser against the canvas in EN/JP × light/dark
- [ ] `pnpm check` green

## Notes
D-04, D-09, D-19. Only controls that work (D-19 list). Strings in locales (add keys to both en/ja; Japanese must come from the approved JP artboards).

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
