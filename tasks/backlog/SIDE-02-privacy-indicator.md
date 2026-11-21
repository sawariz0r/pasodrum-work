---
id: SIDE-02
title: Show clearly that a conversation is private (end-to-end encrypted), in plain words
stage: backlog
area: frontend
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-21
owner:
---

## Goal (CEO)
Make it clear to a not-very-technical client that a DM / private channel is end-to-end encrypted — reassuring, not "Pentagon-level security". No technical lingo.

## Direction to design (needs canvas boards + CEO approval first)
- Start of the conversation (the DM intro / channel start): one calm line, e.g. EN "Only you and Henrik can read this conversation." / JP 「このメッセージは、あなたと Henrik さんだけが読めます。」 — names the people, says what it means; no "E2EE", "encrypted", "keys".
- Header: a small lock beside the name on encrypted conversations; hover/focus shows the same sentence. Unencrypted conversations show nothing (never "not encrypted").
- Amends D-11's "no encryption claims in copy" for encrypted conversations only — log as a decision when approved.
- Check it reads right for group DMs ("Only the people here can read this conversation.") and private channels.
