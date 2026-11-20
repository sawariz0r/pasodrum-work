---
id: M2-01
title: Matrix: rich messages, media, uploads, actions
stage: ceo-review
area: frontend
milestone: M2
priority: P0
slice: false
depends_on: [M1-04]
created: 2026-11-20
owner: claude (M2-01 agent)
---

## Goal
matrix/ implements the D-22 contract against the real server.

## Acceptance criteria
- [x] Message kinds from m.room.message msgtypes (text/emote/notice/image/video/audio/file), redactions → 'deleted', unknown with body → 'unsupported' showing body, membership runs → 'system' summaries between messages
- [x] formatted_body sanitized per D-22 allow-list; mx-reply fallbacks stripped; `mentionsMe` from m.mentions or a pill to me
- [x] Replies: `replyTo` from m.in_reply_to, original looked up in the loaded timeline, else fetched once; `found:false` when unavailable
- [x] Reactions aggregated from m.annotation relations incl. redacted reactions; `react`/`unreact` (unreact redacts my annotation)
- [x] Edits applied (m.replace) with `edited`; `edit` sends m.replace with m.new_content incl. formatted_body; `remove` redacts
- [x] `send(Draft)`: body + formatted_body (when html), m.mentions, reply relation with fallback; sends finished tray uploads as image/video/audio/file messages (info: mimetype, size, w/h for images), then clears the tray
- [x] Uploads: `attach` starts upload immediately with progress (0..1), 50 MB → 'too-large', failure → 'failed', `retryUpload`, `removeUpload`; image previews via object URL
- [x] Typing: `setTyping` sends typing notifications (throttled, stops after idle); snapshot `typing` from m.typing excluding me
- [x] `members(channelId)` = joined members as Person (display names); `mediaUrl` fetches authenticated media (thumbnail when asked) → cached object URL; `messageLink` = https://<origin>/m/<channel>/<event>
- [x] Integration tests against the local server cover each of the above (incl. an Element-style reply fallback and a reaction from another account)
- [ ] `pnpm check` green — matrix/ parts green (lint, unit, integration, matrix typecheck); the gate currently fails on other agents' in-progress app/timeline typecheck and a ui/primitives Dialog test

## Notes
D-05, D-22. Only matrix/ files (+ the root test script). Keep exported signatures.

## Outcome
Implemented in `apps/web/src/matrix/` (2026-11-20):
- `html.ts` (new, pure): DOMParser walk to the D-22 allow-list; unknown tags unwrapped to text; script/style/img/mx-reply… dropped with content; links only http/https/mailto (no attributes added); h1–h6 → `<p><strong>`; pills → `<a href data-mention="@user:server">`, collected for `mentionsMe`.
- `map.ts`: pure `mediaOf`, `stripReplyFallback`, `replyFallback`, `reactionsOf`, `membershipSummary`.
- `send.ts`: still the only sender; `contentOf` (body + formatted_body, m.mentions, reply relation + Element-style fallback, media `url/filename/info`), `editContentOf` (m.replace, `* ` fallback, m.new_content), `sendReaction`.
- `store.ts`: all M2 commands; kinds incl. sticker → image, unknown types with a text fallback (e.g. polls) → 'unsupported'; membership runs → 'system' (net joins/leaves, profile changes and invites hidden); edits refresh on `Replaced`; uploads via `uploadContent` with progress, AbortController, object-URL previews revoked on remove/send/sign-out; typing throttled (resend 4 s, idle stop 5 s); members lazy-loaded on open; `mediaUrl` = authenticated v1 media → cached blob URL (thumbnail 800×600 scale).
- Tests: `html.test.ts`, `send.test.ts`, more `map.test.ts`; `rich.integration.ts` (11 tests, all criteria) + shared `integration.helpers.ts`; `workspace.integration.ts` adapted to system rows. `pnpm test:matrix` 22/22 green.

Decisions taken (no escalation): `found: true` only when the original is in the loaded timeline (a fetched original gives sender/body but stays `found: false`); media `body` is the caption ('' when it is just the file name); `send` posts text first, then each finished upload as its own message (reply relation on the first), then clears the tray except uploads still in flight; replies add the replied-to sender to `m.mentions` (spec); reactions in first-reacted (timestamp) order.

Follow-ups: the server's upload limit is 20 MB (`/media/config`), Batch B says 50 MB, so 20–50 MB files end as 'failed', not 'too-large': raise Continuwuity `max_request_size` in dev/ and deploy/. Upload progress between 0 and 1 needs XHR (browser); in Node it jumps 0 → 1.

## Review notes
(CEO)

Lead review: tested end to end in the browser against the local server (formatted send, mention pill, reaction, edit, delete, image upload → inline display via authenticated media). Integration suite 22/22 on 4 of 5 runs; one failure right after a server restart (timing) — watch for flakiness.
