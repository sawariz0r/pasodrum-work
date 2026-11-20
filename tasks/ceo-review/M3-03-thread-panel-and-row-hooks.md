---
id: M3-03
title: Thread panel, thread hover action, drafts in the composer, profile hooks in rows
stage: ceo-review
area: frontend
milestone: M3
priority: P0
slice: false
depends_on: [M2-02, M2-03]
created: 2026-11-20
owner: claude (M3-03 agent)
---

## Goal
Threads open in a panel beside the channel per Batch C, and rows/composer hook into threads, drafts and profile cards.

## Acceptance criteria
- [x] Thread panel (ThreadNew/ThreadLoading/ThreadError/ThreadComposer, ClientThread): root + replies + composer (Draft.threadRootId); opened from the hover bar Thread button (MsgHoverM3) and from the thread summary on a root; URL carries the open thread (?thread=rootId); Esc closes
- [x] Thread summary row on roots (count, participants, last reply time, unread dot) per Batch C — built as the canvas draws it: participants + "N replies" (no time/dot on the boards)
- [ ] ≤800px: the thread replaces the conversation with a back arrow (Window800 rules); 1024: sidebar folds (Window1024) — replace done (under 1000px, per Foundations); the 1024 fold needs the shell (M3-02), hook provided
- [x] Composer saves/restores drafts per channel and per thread via app/drafts.ts (debounced), clears on send
- [x] Names and avatars in rows open the profile card via useProfileCard().open(userId, anchor)
- [x] markThreadRead when the thread panel is open at the bottom
- [x] Tests with the fake store (extend fakeStore openThread with sample replies); browser check against the boards EN/JP × light/dark
- [x] `pnpm check` green

## Notes
Owns new app/thread/ plus targeted edits in app/timeline (MessageRow, ChannelView) and app/composer (draft persistence, threadRootId prop). Don't edit app/shell or app/pages (M3-02).

## Outcome
- **app/thread/**: `ThreadPanel` (header with Close, or back arrow under 1000px; root on top, "N replies" rule, replies at 32px/14.5px, skeleton, error + Retry, floating composer with dock measuring like the channel), `useOpenThread()` / `useThreadNav()` (the `?thread=` param), icons, tests. Panel slides in (12px + fade, `--dur-3`; fade only with reduced motion). Esc closes unless a dialog/menu/listbox is open or an IME is composing.
- **Placement:** ChannelView portals the panel into `<main>`'s parent (the shell row), so it runs full height with its own 56px header like the boards, without touching shell files. ≥1280: 340–420px; 1000–1279: 380px; under 1000: covers the conversation (rail stays), back arrow — Foundations says "under 1000 px", Window800 is one instance of that.
- **Timeline:** `Timeline` gained `thread` (root, failed, retry; markThreadRead/loadOlderInThread instead of markRead/loadOlder; no day dividers or empty state) and `onOpenThread`; `TimelineActions.openThread` drives the hover-bar Thread button and the summary row (both absent inside a thread). MessageRow: summary row, `compact`, name/avatar buttons → `useProfileCard().open(userId, el)`.
- **Composer:** `threadRootId` prop (send with `Draft.threadRootId`, "Reply in thread"/"Reply…"/"Send reply", ArrowUp edit and reply bar read the thread timeline, drop target is the panel). Drafts per channel/thread via app/drafts.ts: restored on mount, saved 400 ms after typing and on unmount, cleared on send.
- **fakeStore:** sample replies for `$!general-1` (4) and `$!eng-sync` (2) with matching `thread` summaries; `openThread` honours `loadMs`; `threadFails` option; thread sends append to the thread and bump the summary; edit/remove/react apply wherever the message shows.
- **Strings:** `thread.*` + `timeline.replyInThread` in en/ja.
- **For M3-02 (shell):** at 1000–1279px the sidebar should fold while a thread is open (Window1024: header sidebar button, drawer). Read `useOpenThread()` from `app/thread/useThread.ts` and apply the existing under-1000 drawer rules in that range when it is non-null.
- **Store semantics (matrix/ as built):** the root comes from `threadTimelines[rootId].messages[0]` (the channel copy only while loading); markThreadRead is called whenever the panel is at the bottom. Avatars everywhere in rows, quotes, summary, viewer, delete dialog and reply bar resolve `avatarUrl` via `store.mediaUrl(ref, { thumbnail: true })` (new `timeline/PersonAvatar`). No amber corner in rows: the boards don't draw one there.
- **For M3-01 (matrix):** the contract has no failure flag for a thread timeline; ThreadPanel reads an optional `failed?: boolean` on `threadTimelines[rootId]` (ThreadError). Please add `failed?: boolean` to `Timeline` (or say otherwise). Uploads are per channel, so a file attached in the thread composer also shows in the channel tray (sent with whichever composer sends first).
- **Checks:** `pnpm check` green (150 tests). Browser on /dev/app: EN/JP × light/dark at 1440/1024/800 match ThreadNew/ThreadError/Window800; hover bar matches MsgHoverM3; thread open, send in thread (summary counts up) and error state checked live. At 1024 the conversation is cramped until the shell folds the sidebar. Also wrapped dev/TimelineHarness in a router (ChannelView now reads the URL).

## Review notes
(CEO)

Lead review: thread panel tested against the local server (open from hover bar, reply, summary on root). Thread replaces the conversation below 1000px per Foundations.
