---
id: M5-03
title: UI: Another app, phone hand-off, join page on phones
stage: done
area: frontend
milestone: M5
priority: P1
slice: false
depends_on: [M4-04]
created: 2026-11-21
owner: claude (m5-another-app session)
---

## Boards (design/canvas/, approved)
RulesM5 (bottom section) · ProfileMenuAnotherApp, AnotherApp(+JP), JoinDoneOther · PhoneHandoff(+JP), JoinPhone, JoinDonePhone

## Acceptance criteria
- [x] Profile menu → Another app: server + username from `store.anotherApp()`, Copy each (check 1.2 s, announced to screen readers), Get Element X
- [x] Join done state keeps the same pair behind its disclosure (JoinDoneOther)
- [x] App routes under 640 px wide show PhoneHandoff (what the link points to, Copy link, Open in Element X); `/join/*` stays usable on phones (JoinPhone); after joining on a phone Element X comes first and server/username are shown open (JoinDonePhone)
- [x] Verify the Element X link (`https://mobile.element.io/element/?account_provider=pasodrum.work` or the current equivalent) really pre-fills the server; note the finding in the task Outcome
- [x] EN/JP, light/dark; tests; `pnpm check` green; browser-checked at phone width

## Outcome
Built in `apps/web/src/app/another/` (new folder) plus small edits to `join/`, `shell/ProfileMenu.tsx` (one item) and `App.tsx` (route guard).

- **Another app** (`AnotherApp.tsx`): Profile menu → Another app (Language · Settings · Another app · Sign out). Dialog 440 px wide, 168 px from the top. Shows `store.anotherApp()` server and username, each with Copy, and Get Element X (opens element.io/download in a new tab).
- **Copy** (`AccountPair.tsx`): after a successful copy the icon turns into the accent check (pop-in) for 1.2 s, and a polite live region says "Copied". Every copy puts a new node in the region, so a second copy within 1.2 s is announced again (fixed after review). If the clipboard refuses, nothing changes. The same component draws the join page pair in its card look.
- **JoinDoneOther:** the done disclosure now uses the shared pair (it used to show the check for 1.5 s with no announcement). The `join.otherApp/server/username/copy*` keys moved to a new `another.*` namespace.
- **Phones:** `usePhone()` is `(max-width: 639.98px) and (pointer: coarse)` (D-28 as amended after review: a touch device and narrow). A narrow desktop window or a zoomed-in page keeps the app and can still sign in. The join page's compact layout still follows width alone. Signed in, every app route renders `PhoneHandoffSignedIn`: the laptop tile, "Open on your computer", what the link points to, Copy link and Open in Element X. What it points to: the channel with # (lock if private), the DM's names, the space name, the page name (Activity/DMs/Threads/Drafts/Settings), or the home channel for `/`. `OnExpired` and `SettingsSync` stay mounted; FirstRun and the shell don't. Signed out, `/signin` shows the same page with the brand as the label, and Copy link copies the page they were headed to (`from`). Links are built with `useHref`, so the `/dev/app` basename works. Widening the window brings the app back with no reload.
- **JoinPhone / JoinDonePhone:** the join page's phone breakpoint moved from 480 px to 640 px and now matches the board (16 px header, 8/16/32 main padding, 24/20/22 card, JP title line-height 1.35). After joining on a phone, Open in Element X is the primary action and server/username show open with no disclosure.
- **Tests:** `another/another.test.tsx` (9 tests, including narrow desktop window, wide touch screen and the second-copy announcement): menu → dialog, Copy check for 1.2 s and the announcement (fake timers), Element X link format, signed-in hand-off with channel name and copied link, signed-out hand-off copying the original path, phone join done order, JP strings. The existing join and app tests still pass.
- **Browser check:** `/dev/app` on the fake backend. Desktop: profile menu, dialog, copy check + live region (clipboard stubbed, because the pane denies clipboard writes), Escape closes and the page is clickable again, JoinDoneOther expanded. Phone (375×812): hand-off in dark, light + JP, copied link `http://localhost:5173/dev/app/w/!pasodrum/c/!eng`, join → done with Element X first. No console errors.
- **`pnpm check`:** green after the review fixes (266 tests).

**Element X link finding:** `https://mobile.element.io/element/?account_provider=pasodrum.work` is the current format. Element's provisioning docs (docs.element.io → ESS Pro → Mobile client provisioning) give `https://mobile.element.io/<app>/?account_provider=<server name>&login_hint=…`, with `element` for Element X and `element-pro` for Element Pro. `account_provider` takes the server name, not a URL. It has been supported since Element X 25.05.2 (iOS) and 25.06.0 (Android). If the app isn't installed, the page "guides them to install it". The pre-set lasts only while the app runs, and MDM or a custom build overrides it. We send no `login_hint`: the docs describe it for MAS/OIDC sign-in, and Continuwuity uses password login. We send `anotherApp().server` (the homeserver URL's host), which is the server name on production. **Not verified on a real phone yet:** someone with Element X needs to open the link once on iOS and Android (part of the M5 Element X smoke test).

Follow-ups noticed (not done):
- Closing the Another app dialog leaves focus on the page body, not the profile button. Radix returns focus to the menu item that opened it, which is gone by then. Settings has the same pattern. Fixing it needs an `onCloseAutoFocus` hook on `ui/Dialog`.
- The canvas's done state also shows "Download for Mac" and the header's "Download app". Both wait for the desktop app (M9).

