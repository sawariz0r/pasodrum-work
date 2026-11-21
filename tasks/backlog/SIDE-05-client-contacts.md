---
id: SIDE-05
title: Client contacts — staff responsible for a client space ("For Nordlys, Oscar is the main contact")
stage: backlog
area: fullstack
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-21
owner:
---

## Goal (CEO)
Assign one or more staff as a client space's main contact(s). They are who "Need help? Ask <name>" (D-38) points to, instead of "whoever invited the client". Room to grow later into broader "client ownership" (e.g. who gets client notifications, who approves, who's shown first to the client).

## Notes
- Store as space state in the client space (e.g. `work.pasodrum.space` `contacts: [userId]`, Owner/Admin to edit), so the invite service's help lookup can read it.
- UI: Client space settings → People: mark contacts; the client sees the contact's face on help pills.
- Needs design boards first.
