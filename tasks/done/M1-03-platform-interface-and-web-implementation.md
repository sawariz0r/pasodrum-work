---
id: M1-03
title: Platform interface and web implementation
stage: done
area: frontend
milestone: M1
priority: P0
slice: true
depends_on: [M0-01]
created: 2026-11-20
owner: claude
---

## Goal
`platform/web.ts` implements the Platform interface for browsers, and the rest of the app gets it from one place.

## Acceptance criteria
- [x] `platform/index.ts` exports the interface and `platform` (web implementation today)
- [x] notify: Notification API, only when permission is already granted and the tab is hidden; click focuses window and calls the route callback
- [x] setBadge: prefixes `document.title` with the count (and `navigator.setAppBadge` where available)
- [x] authRedirectUri, onOpenRoute (popstate + notification clicks), openExternal (new tab, noopener), persistStorage (`navigator.storage.persist`)
- [x] No other folder touches these browser APIs: ESLint `no-restricted-properties`/`no-restricted-globals` for Notification, navigator.storage, navigator.setAppBadge outside platform/
- [x] Unit tests with happy-dom
- [x] `pnpm check` green

## Notes
D-08. Keep it tiny; desktop.ts arrives in M9.

## Outcome
- `platform/web.ts`: `createWebPlatform()`. `platform/index.ts` exports `Platform` and `platform` (web today; M9 swaps in desktop behind the same interface).
- notify: only when `Notification.permission === 'granted'` and the tab is hidden; never requests permission (asking is a designed screen later). Click focuses the window, closes the notification and calls the `onOpenRoute` callbacks.
- setBadge: `(n) ` title prefix, replaced on update and removed at 0; `setAppBadge`/`clearAppBadge` when available.
- authRedirectUri: `${location.origin}/auth/callback` (hook only; OIDC unused in v1). openExternal: `_blank` with `noopener,noreferrer`. persistStorage: `navigator.storage.persist()`, `false` without the API.
- Lint guard (eslint.config.js): outside `platform/`, `Notification`, `window.Notification`, `navigator.storage`, `navigator.setAppBadge`, `navigator.clearAppBadge` error with a D-08 message. `navigator.language` is still allowed (i18n needs it). Checked on a throwaway file, now deleted.
- `platform/web.test.ts`: 12 tests on happy-dom with stubbed Notification and navigator APIs. `pnpm check` green.

## Review notes
(CEO)

Lead review: removed the popstate listener from `onOpenRoute` — on the web, deep links are just URLs the router handles; back/forward firing route callbacks would fight React Router. `onOpenRoute` now only carries notification clicks (and desktop deep links in M9).
