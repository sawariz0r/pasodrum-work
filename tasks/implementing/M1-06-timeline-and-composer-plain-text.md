---
id: M1-06
title: Timeline and composer: plain text
stage: implementing
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
- [ ] Opens the timeline via `store.openTimeline`, renders messages oldest-first with author grouping (same sender within ~5 min), day dividers (Intl, viewer's language), times
- [ ] TimelineLoading skeleton on first load; OlderHistory: loads older when scrolled to the top, keeps scroll position; jump-free when new messages arrive while scrolled up
- [ ] MessageSending/MessageFailed states: sending dimmed; failed shows Not sent · Retry · Delete
- [ ] Empty channel state per Main empty state (without Add people until M4)
- [ ] Composer: multiline plain text, Enter sends (IME-safe via `isImeEnter`), Shift+Enter newline, send button, placeholder per design ("Message #name"), keeps focus; no format bar/attach/emoji/mention yet (D-19)
- [ ] `markRead` when the channel is open and scrolled to the bottom
- [ ] Plain text rendering: line breaks kept, URLs linkified (open in new tab), no HTML injection
- [ ] Tests with `createFakeStore()` (grouping, IME Enter, failed → retry/discard); checked in a browser in EN/JP × light/dark
- [ ] `pnpm check` green

## Notes
Lives in apps/web/src/app/timeline/ (replace the placeholder ChannelView). D-19 contract via `useWorkspace`/`useStore`.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
