---
id: M1-05
title: Shell, sign-in and feature registry
stage: ceo-review
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
- [x] React Router: `/signin`, `/w/:spaceId/c/:channelId`, `/` redirects to the last or first channel, catch-all → NotAvailable page (approved artboard)
- [x] Sign-in (SignIn, SignInJP, SignInWrongPassword, SignInServerDown, SessionExpired artboards): email → password, Change, Other server, errors, IME-safe Enter; SSO button only if the server offers it; no Forgot password link yet (D-19)
- [x] App start skeleton (AppStart) while connection is 'starting'
- [x] Shell per Main/MainJP/Dark: rail (space tiles with active state and attention dot, theme toggle, profile avatar menu per LanguageMenu: English/日本語, sign out), sidebar (space name, channels with private lock, unread bold, mention badge), header (channel name), tab bar (Messages + registered channelTabs), main area mounts `<ChannelView channelId>` from app/timeline (owned by M1-06)
- [x] Connection banners (Offline, Reconnecting with Try now → reconnectNow, BackOnline briefly)
- [x] Narrow windows per Window1024/Window800/Window800Sidebar: at ≤800px the sidebar becomes a drawer opened from the header
- [x] Theme (light/dark, remembered) and language switch take effect instantly; `<html lang>` and `data-theme` set
- [x] Registry: `defineFeature` + `app/registry.ts` with `rail` and `channelTabs` extension points; `features/index.ts` stays empty; tab bar renders stored tabs ∩ registered types (stored tabs come later; M1 = Messages only)
- [x] M1-07 included: CI test renders the shell with `features = []` and with a fixture of stored tabs whose types aren't registered — no errors, only Messages tab
- [x] Component tests with `createFakeStore()`; checked in a browser against the canvas in EN/JP × light/dark
- [x] `pnpm check` green

## Notes
D-04, D-09, D-19. Only controls that work (D-19 list). Strings in locales (add keys to both en/ja; Japanese must come from the approved JP artboards).

## Outcome
Built in `apps/web/src/app/`: `App.tsx` (routes, sign-in/sign-out/expiry), `signin/`, `shell/` (Rail, ProfileMenu, Sidebar, ChannelTabs, ConnectionBanner, AppStart, NotAvailable), `registry.ts` + `RegistryProvider.tsx` (`defineFeature`, `rail`, `channelTabs`, `visibleTabs` = stored ∩ registered), `prefs.ts` (theme, last place, last identifier), `places.ts`, `backend.ts` (matrix/ entry points behind one interface so dev and tests pass a fake), `icons.tsx`. `features/index.ts` unchanged (empty).

Dev: `/dev/app` runs the real app on the fake store (`?conn=starting|offline|reconnecting`, `?signin` starts signed out; server containing "down" is unreachable, password "wrong" is wrong; `fake.set({...})` in the console). `/dev/timeline` wired for M1-06's harness.

Tests: `app/App.test.tsx` (sign-in flow, username, server down, IME Enter, redirects/last place, rail/sidebar/header/tabs, not available, app start, banners, theme/language, sign out, session expired, drawer) and `app/registry.test.tsx` (M1-07: `features = []`, unregistered stored tabs, stored ∩ registered, rail items). `pnpm check` green. Checked in the browser on the fake store: EN/JP × light/dark at 1440, 1024, 800 (drawer), sign-in email/server down/wrong password, JP dark sign-in.

Deviations from the canvas (D-19 "only controls that work"): sidebar has no workspace-name chevron, New message, Search, Threads/Mentions/Drafts, DMs, Client spaces section or Add people; "Channels" is a plain label (no collapse chevron); header shows only the channel name (no members, pins, details, name chevron); no "Add a tab"; sign-in has no Privacy/Terms/Help footer (no destinations yet) and no Forgot password; SSO button never shows because matrix/ doesn't expose whether the server offers SSO yet (needs a flag from `resolveServer`). AppStart skeleton trimmed to the same parts. Drawer applies under 1000px per the canvas comment/Foundations (covers ≤800). Client tile colour comes from `avatarColor(id)` (canvas uses #2F4A6D). "Open #channel" on Not available goes to the last opened channel, else the first. Sign-in 'other' failures show the "Can’t reach" alert; logged as a needs-design row in INVENTORY. Email error uses the TextField error style (icon + red ring) like Wrong password.

## Review notes
(CEO)

Lead review: tested in the browser against the local server in EN/JA × light/dark, staff and client accounts. Fixed: after a deliberate sign-out, the next person was sent to the previous person's last page (now only expired sessions and pre-sign-in deep links return to where you were). SSO button never shows yet (resolveServer doesn't report SSO; fine under D-12).
