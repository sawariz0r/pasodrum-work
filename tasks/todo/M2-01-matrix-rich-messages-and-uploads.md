---
id: M2-01
title: Matrix: rich messages, media, uploads, actions
stage: todo
area: frontend
milestone: M2
priority: P0
slice: false
depends_on: [M1-04]
created: 2026-11-20
owner:
---

## Goal
matrix/ implements the D-22 contract against the real server.

## Acceptance criteria
- [ ] Message kinds from m.room.message msgtypes (text/emote/notice/image/video/audio/file), redactions → 'deleted', unknown with body → 'unsupported' showing body, membership runs → 'system' summaries between messages
- [ ] formatted_body sanitized per D-22 allow-list; mx-reply fallbacks stripped; `mentionsMe` from m.mentions or a pill to me
- [ ] Replies: `replyTo` from m.in_reply_to, original looked up in the loaded timeline, else fetched once; `found:false` when unavailable
- [ ] Reactions aggregated from m.annotation relations incl. redacted reactions; `react`/`unreact` (unreact redacts my annotation)
- [ ] Edits applied (m.replace) with `edited`; `edit` sends m.replace with m.new_content incl. formatted_body; `remove` redacts
- [ ] `send(Draft)`: body + formatted_body (when html), m.mentions, reply relation with fallback; sends finished tray uploads as image/video/audio/file messages (info: mimetype, size, w/h for images), then clears the tray
- [ ] Uploads: `attach` starts upload immediately with progress (0..1), 50 MB → 'too-large', failure → 'failed', `retryUpload`, `removeUpload`; image previews via object URL
- [ ] Typing: `setTyping` sends typing notifications (throttled, stops after idle); snapshot `typing` from m.typing excluding me
- [ ] `members(channelId)` = joined members as Person (display names); `mediaUrl` fetches authenticated media (thumbnail when asked) → cached object URL; `messageLink` = https://<origin>/m/<channel>/<event>
- [ ] Integration tests against the local server cover each of the above (incl. an Element-style reply fallback and a reaction from another account)
- [ ] `pnpm check` green

## Notes
D-05, D-22. Only matrix/ files (+ the root test script). Keep exported signatures.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
