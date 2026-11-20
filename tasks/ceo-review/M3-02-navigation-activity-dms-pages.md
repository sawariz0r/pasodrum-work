---
id: M3-02
title: Navigation, Activity, Threads/Drafts views, DMs, new message, profile card
stage: ceo-review
area: frontend
milestone: M3
priority: P0
slice: false
depends_on: [M2-02]
created: 2026-11-20
owner: claude (M3-02 agent)
---

## Goal
The D-23 navigation and the Batch C pages work against the store contract.

## Acceptance criteria
- [x] Rail: Home, DMs, Activity (badges per Batch C), space tiles; routes /dms, /dms/:id, /activity, /threads?space=…, /drafts; sidebar sections Threads, Drafts (grey count), channels, the space's DMs, client spaces
- [x] Activity page (All · Mentions · Replies) per Activity/Mentions/ActivityEmpty boards; opening an item navigates to the message (channel or thread) and marks it read; list order stable while open
- [x] Threads view (Threads/ThreadsEmpty) for the current space; Drafts view (Drafts/DraftsEmpty) from app/drafts.ts
- [x] DMs page with the 340px list column + conversation (reuse ChannelView), DM header and empty state (DMs, DMEmpty); New message dialog (one or several people, reuses existing DM) per NewMessage/NewMessageGroup
- [x] Profile card (ProfileCard boards) implementing ProfileCardContext: name, local time from timeZone, work email, Message button → openDm
- [x] Client perspective per ClientDMs/ClientNewMessage; external people get the amber corner badge
- [x] Narrow widths per Batch C narrow boards when published (drawer below 1000px; DMs list/conversation at ≤800)
- [x] Tests with the fake store (extend fakeStore with threads/activity samples); browser check against the boards EN/JP × light/dark
- [x] `pnpm check` green

## Notes
Owns app/shell/, new app/pages/ (Activity, Threads, Drafts, DMs), app/people/. Don't edit MessageRow/Composer (M3-03); use ProfileCardContext and app/drafts.ts.

## Outcome
Built against the D-24 contract on the fake store (extended: followed threads, mentions/replies incl. a thread mention, six DMs incl. a group, an empty one and external Henrik Dahl, profile time zones). Not committed.

- **Shell** (`app/shell/`): routes `/w/:space/c/:channel`, `/w/:space/dm/:dm` (DM from the sidebar, sidebar kept), `/threads?space=`, `/drafts?space=`, `/dms` (→ newest), `/dms/:id`, `/activity?item=&thread=`. Rail: tiles, Home/DMs/Activity with unread badges (DMs with unread; unread Activity items). Sidebar: compose (New message), Threads (red count of unread threads in this space), Drafts (grey count, this space), collapsible Channels / Direct messages (+ = New message) / Client spaces (workspace only). Narrow (Batch C narrow boards): sidebar pages keep the drawer below 1000px; Window1024 fold — while `?thread` is open at 1000–1279px the sidebar folds into the drawer; DMs/Activity keep the 340px list down to 801px, and at ≤800px the list fills the window and an open item replaces it with a back arrow (no auto-open of the newest DM there).
- **Pages** (`app/pages/`): Activity column (All · Mentions · Replies, kind badge, quote for replies, unread dot, stable order, opening marks read and shows the channel/DM beside the list; thread items add `?thread`). Threads view (unread first, frozen order; a card opens the thread panel beside the list via `?thread`, selected card ringed — Threads1024). Drafts view (from `app/drafts.ts`, per space; opens the conversation; Delete fades 180ms then clears). DMs column + DM conversation (header, ChannelView reuse).
- **People** (`app/people/`): ProfileCardProvider implementing `ProfileCardContext` (local time + city from `timeZone`, JP city names, work email, Message → `openDm`, Esc/outside closes, flips above when no room); New message dialog (search suggestions from `searchPeople('')`, chips, Enter adds, Backspace removes, Message reuses existing DM); DmIntro (DMEmpty); avatars resolve refs via `mediaUrl(…, {thumbnail})`.
- Small edits outside my folders: `timeline/ChannelView.tsx` (DM name + intro), `timeline/Timeline.tsx` (`intro` prop), `places.ts` (paths), fake `markRead` clears DM unread.
- Tests: `app/pages/pages.test.tsx` (navigation, sidebar, DMs, threads, activity filters/read/order, drafts, new message reuse/group, profile local time EN/JP); App.test sidebar assertion updated. `pnpm check` green (151 tests). Browser-checked at 1440 EN/JP × light/dark, 1024 (Threads/Activity/thread fold) and 800 (DMs/Activity list ↔ detail).

**Deviations / open:** Composer placeholder for DMs reads “Message #Tove Rask” (composer owns the wording; needs a DM key). DM list previews show only once a DM's timeline is loaded — the contract has no last message per DM (`Dm.last?` would fix it). Thread cards show an unread dot, not a count (`ThreadSummary.unread` is boolean). No presence dots, no Search/workspace menu/Add people/+channel/+client space (D-19). Client perspective not browser-checked (fake signs in as team); narrow boards still pending.

## Review notes
(CEO)

Lead review: browser-tested against the local server (Activity, DMs, New message with external badge, profile card). Fixed: DM composer placeholder ("Message Jonas Berg" / "Jonas Berg さんへのメッセージ" from the canvas), DM preview skipping join lines. Joined line now neutral ("… joined" / "…が参加しました") so it reads right in DMs too. Open: /dms with no DMs shows the last channel instead of an empty state.
