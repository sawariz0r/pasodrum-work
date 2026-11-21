---
id: SIDE-01
title: Side feature: Translate messages (Discovery page on the canvas)
stage: backlog
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [M6-02]
created: 2026-11-21
owner:
---

## Goal
CEO: "one of those side features we probably could implement in isolation while other things are running." Translate a message in place. Boards live on the canvas's **Discovery** page (design-discovery session); scope, cache and reuse notes are in that session's `discovery-translate.md`.

## Gate
Design boards are **not approved yet** — move to `todo/` only when the CEO approves them and the lead has mirrored them into `design/canvas/` + `design/INVENTORY.md`.

## Touch points
1. Hover bar + message body in `app/timeline/` overlap with M6-02's undecryptable rows → schedule after M6's timeline changes land, or keep it to one hook.
2. First use of a message-actions extension point (D-04: arrives when first used) as `features/translate/` — deleting the folder and its registry line leaves the app working.
3. `/api/translate` next to the invite service (same Caddy routing); OpenAI key in Coolify (CEO action), model as a setting (verify the model name the CEO mentioned, "luna", before relying on it).
4. Hides itself using `Channel.outside` / `Person.external` (M5) as the design says.
