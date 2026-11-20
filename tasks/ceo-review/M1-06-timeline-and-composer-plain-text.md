---
id: M1-06
title: Timeline and composer: plain text
stage: ceo-review
area: frontend
milestone: M1
priority: P0
slice: true
depends_on: [M1-01, M1-02]
created: 2026-11-20
owner: claude
---

## Goal
`<ChannelView channelId>` shows the channel's messages and a plain-text composer per the approved designs, including loading, sending and failure states.

## Acceptance criteria
- [x] Opens the timeline via `store.openTimeline`, renders messages oldest-first with author grouping (same sender within ~5 min), day dividers (Intl, viewer's language), times
- [x] TimelineLoading skeleton on first load; OlderHistory: loads older when scrolled to the top, keeps scroll position; jump-free when new messages arrive while scrolled up
- [x] MessageSending/MessageFailed states: sending dimmed; failed shows Not sent · Retry · Delete
- [x] Empty channel state per Main empty state (without Add people until M4)
- [x] Composer: multiline plain text, Enter sends (IME-safe via `isImeEnter`), Shift+Enter newline, send button, placeholder per design ("Message #name"), keeps focus; no format bar/attach/emoji/mention yet (D-19)
- [x] `markRead` when the channel is open and scrolled to the bottom
- [x] Plain text rendering: line breaks kept, URLs linkified (open in new tab), no HTML injection
- [x] Tests with `createFakeStore()` (grouping, IME Enter, failed → retry/discard); checked in a browser in EN/JP × light/dark
- [x] `pnpm check` green

## Notes
Lives in apps/web/src/app/timeline/ (replace the placeholder ChannelView). D-19 contract via `useWorkspace`/`useStore`.

## Outcome
- `apps/web/src/app/timeline/`: `ChannelView` (keyed per channel; opens the timeline, reads via `useWorkspace`), `Timeline` (skeletons, empty state, scroll handling, `markRead`, `loadOlder`), `MessageRow`, `DayDivider`, `Composer`, `items.ts` (grouping, day labels, linkify), CSS modules over tokens. No new locale keys were needed.
- Scrolling: sticks to the bottom when at the bottom (also when the composer grows or fonts/language change), jumps to the bottom when you send, otherwise keeps the first message still while older history or its skeleton is inserted above (checked in the browser: anchor moved 0px). Loads older within 400px of the top.
- Text: React text nodes only, `white-space: pre-wrap`, http(s) URLs linked (`target=_blank`, `rel=noopener noreferrer`), other schemes never linked.
- Tests: `ChannelView.test.tsx`, `items.test.ts` (grouping, day dividers EN/JP, IME Enter incl. Safari post-composition Enter, Shift+Enter, failed → retry/delete, markRead, loadOlder, safe text). `pnpm check` green.
- Dev harness: `/dev/timeline?theme=dark&lang=ja&ch=!long` (`apps/web/src/dev/TimelineHarness.tsx`; one line in `main.tsx`). Checked EN/JP × light/dark there.
- Deviations: composer is one row (text + send) since D-19 removes the format bar and attach/emoji/mention; the 22px typing-row space above it is kept. The older-history skeleton sits above the anchored view rather than pushing it down. Day labels past yesterday: weekday within a week (as in the design), then date via Intl (not on the canvas). Avatar colours come from `avatarColor()`. Links use `--link`, underline on hover.

## Review notes
(CEO)

Lead review: tested in the real app (send with emoji, history, Japanese, dark). Edited marker not shown yet (Batch B / M2).
