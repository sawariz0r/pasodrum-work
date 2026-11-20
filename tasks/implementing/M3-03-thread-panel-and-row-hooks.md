---
id: M3-03
title: Thread panel, thread hover action, drafts in the composer, profile hooks in rows
stage: todo
area: frontend
milestone: M3
priority: P0
slice: false
depends_on: [M2-02, M2-03]
created: 2026-11-20
owner:
---

## Goal
Threads open in a panel beside the channel per Batch C, and rows/composer hook into threads, drafts and profile cards.

## Acceptance criteria
- [ ] Thread panel (ThreadNew/ThreadLoading/ThreadError/ThreadComposer, ClientThread): root + replies + composer (Draft.threadRootId); opened from the hover bar Thread button (MsgHoverM3) and from the thread summary on a root; URL carries the open thread (?thread=rootId); Esc closes
- [ ] Thread summary row on roots (count, participants, last reply time, unread dot) per Batch C
- [ ] ≤800px: the thread replaces the conversation with a back arrow (Window800 rules); 1024: sidebar folds (Window1024)
- [ ] Composer saves/restores drafts per channel and per thread via app/drafts.ts (debounced), clears on send
- [ ] Names and avatars in rows open the profile card via useProfileCard().open(userId, anchor)
- [ ] markThreadRead when the thread panel is open at the bottom
- [ ] Tests with the fake store (extend fakeStore openThread with sample replies); browser check against the boards EN/JP × light/dark
- [ ] `pnpm check` green

## Notes
Owns new app/thread/ plus targeted edits in app/timeline (MessageRow, ChannelView) and app/composer (draft persistence, threadRootId prop). Don't edit app/shell or app/pages (M3-02).

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
