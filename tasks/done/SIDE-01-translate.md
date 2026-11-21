---
id: SIDE-01
title: Side feature: Translate messages (Discovery page on the canvas)
stage: done
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [M6-02]
created: 2026-11-21
owner: design-discovery session (side/translate)
---

## Goal
CEO: "one of those side features we probably could implement in isolation while other things are running." Translate a message in place. Boards live on the canvas's **Discovery** page (design-discovery session); scope, cache and reuse notes are in that session's `discovery-translate.md`.

## Gate
Boards approved by the CEO 2026-11-21 (D-32); mirrored into `design/canvas/` and `design/INVENTORY.md` on this branch.

## Touch points
1. Hover bar + message body in `app/timeline/` overlap with M6-02's undecryptable rows → schedule after M6's timeline changes land, or keep it to one hook.
2. First use of a message-actions extension point (D-04: arrives when first used) as `features/translate/` — deleting the folder and its registry line leaves the app working.
3. `/api/translate` next to the invite service (same Caddy routing); OpenAI key in Coolify (CEO action), model as a setting (verify the model name the CEO mentioned, "luna", before relying on it).
4. Hides itself using `Channel.outside` / `Person.external` (M5) as the design says.

## Outcome
Built on branch `side/translate` (D-32).
- **Server** `services/invite/src/translate.ts` + route in `app.ts`: `POST /api/translate` `{segments, to}` → `{segments}`. 413 too large · 401 no/invalid token (whoami) · 403 not joined to the workspace space (clients and guests) · 503 not configured · 400 bad body (≤40 segments, ≤4000 chars, `to` en/ja) · 429 per caller 30/min and 150 successful calls/day · 503 global daily budget of successful calls (`TRANSLATE_DAILY_LIMIT`, default 2000; reserved before the call, handed back on failure) · 502 upstream/invalid response. OpenAI Chat Completions, `store: false`, strict JSON schema, fixed server prompt, 20 s timeout. Logs never carry text. `OPENAI_API_KEY` turns it on; `TRANSLATE_MODEL` defaults to `gpt-6-luna`. Caddy (deploy + dev) forwards `/api/translate`; compose and `.env.example` updated.
- **Web core** `app/translate.ts` (reusable for composer and Docs/Boards): EN↔JP script check on readable text (code, links, mentions removed); links, mentions, code and literal ⟦⟧ become ⟦n⟧ tokens (in plain text too: fenced/inline code, URLs, @mentions) and formatting ⟦n⟧…⟦/n⟧ pairs; the message is rebuilt from the original sanitized nodes plus translated text nodes, never from returned markup; if formatting can't be carried over, the same answer becomes plain text (no second call); offered only within the service's limits (≤40 segments, ≤4000 chars); cache in memory only, keyed on message id + sender + content + target, LRU 300, cleared with the feature's state on any sign-out (`forgetTranslations`/`onForget`). Transport in `matrix/translate.ts`, `store.translate(segments, to)` (fake: "[to] …").
- **Extension point** `messageActions` in `app/registry.ts` (`useButton`, optional `Body`); hooks in `MessageActions.tsx` (button before More) and `MessageRow.tsx` (`TextBody`). Pressed tool style in `Timeline.module.css`.
- **Feature** `features/translate/`: button (only channels of the workspace I'm on the team of, once their member list is loaded — `Channel.outsidePending` — and DMs without outside people; others' text messages); eligibility rechecked before any automatic re-translation, Body with translating / translated / original / failed, EN/JP strings. Removal = delete folder + line.
- **Tests (D-30):** placeholder round-trip, returned markup never rendered, fallback + cache (`app/translate.test.ts`); team-only policy incl. an unjoined space that looks like a workspace and an unloaded member list (`features/translate/translate.test.ts`); registry test no longer depends on the feature list (D-04 removal drill); request/response validation (`services/invite/src/translate.test.ts`); 401/403 gate for client and guest (`services/invite/test/invite.integration.ts`).
- **Checked:** `pnpm check` green; browser against the fake store, EN dark + JP light (button only on foreign-script messages, translate, Show original / Show translation, formatting kept, tooltip).
- **Not checked:** a real OpenAI call (needs the Coolify key on a deploy), the failed state in a browser, the Caddy route in a rebuilt stack, the integration test through Caddy.
- Boards mirrored into `design/canvas/` (canvas.json from the live canvas, with `pages`); INVENTORY section "Side features".

