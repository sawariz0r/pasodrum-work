---
id: SIDE-03
title: "Share history" — staff restore a client's DM history after a lost recovery key
stage: backlog
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [M6-01]
created: 2026-11-21
owner:
---

## Goal (CEO)
When a client loses their recovery key and resets, a staff member can give back the history of their DM ("I've got your back").

## Safety (agreed direction)
- Staff-initiated only, per conversation, only to the client's current confirmed identity.
- Before sharing: staff and client compare the emoji (user verification) **on a call or in person** — never inside the same chat — plus a clear "Only do this if you've confirmed it's really {name}" step.

## First: spike (≈1 h)
- Does our matrix-js-sdk / Rust crypto version support sharing room history keys with another user (MSC4268 key bundle, or forwarding megolm sessions)? Element X behaviour? Continuwuity only relays encrypted to-device + media, so it should work.
- Then design boards (Batch side) → CEO approval → build.
