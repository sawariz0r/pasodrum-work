---
id: M3-02
title: Navigation, Activity, Threads/Drafts views, DMs, new message, profile card
stage: todo
area: frontend
milestone: M3
priority: P0
slice: false
depends_on: [M2-02]
created: 2026-11-20
owner:
---

## Goal
The D-23 navigation and the Batch C pages work against the store contract.

## Acceptance criteria
- [ ] Rail: Home, DMs, Activity (badges per Batch C), space tiles; routes /dms, /dms/:id, /activity, /threads?space=…, /drafts; sidebar sections Threads, Drafts (grey count), channels, the space's DMs, client spaces
- [ ] Activity page (All · Mentions · Replies) per Activity/Mentions/ActivityEmpty boards; opening an item navigates to the message (channel or thread) and marks it read; list order stable while open
- [ ] Threads view (Threads/ThreadsEmpty) for the current space; Drafts view (Drafts/DraftsEmpty) from app/drafts.ts
- [ ] DMs page with the 340px list column + conversation (reuse ChannelView), DM header and empty state (DMs, DMEmpty); New message dialog (one or several people, reuses existing DM) per NewMessage/NewMessageGroup
- [ ] Profile card (ProfileCard boards) implementing ProfileCardContext: name, local time from timeZone, work email, Message button → openDm
- [ ] Client perspective per ClientDMs/ClientNewMessage; external people get the amber corner badge
- [ ] Narrow widths per Batch C narrow boards when published (drawer below 1000px; DMs list/conversation at ≤800)
- [ ] Tests with the fake store (extend fakeStore with threads/activity samples); browser check against the boards EN/JP × light/dark
- [ ] `pnpm check` green

## Notes
Owns app/shell/, new app/pages/ (Activity, Threads, Drafts, DMs), app/people/. Don't edit MessageRow/Composer (M3-03); use ProfileCardContext and app/drafts.ts.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
