---
id: M7-01
title: M7 tabs & cards — Pins, Files, link cards, Docs/Boards Soon; second-tab handover
stage: done
area: fullstack
milestone: M7
priority: P1
slice: false
depends_on: [M6-01]
created: 2026-11-21
owner: lead
---

## Outcome
- Matrix layer: `pins/pin/unpin`, `files` (server `contains_url`; decrypted scan in encrypted rooms), `linkPreview` (never for encrypted rooms), `canPin`. Pins open to everyone (`m.room.pinned_events` 0): new rooms, `pnpm migrate:pins`, and a startup lift by anyone allowed to change levels. Archive keeps pins at 50.
- UI (Batch G): Messages · Pins · Files tabs, Pin/Unpin + glyph, `?msg=` jump with flash, link cards (first link, fixed height), Docs/Boards "Soon" rail pages. Features: `pins`, `files`, `link-cards`, `docs`, `boards`. Removal drill: deleting `link-cards` keeps `pnpm check` green, links show plain.
- Second tab (D-33): OpenElsewhere + "Use here"; the holder finishes any reset / new recovery key, then reloads into a page that never opens the crypto store.
- M8 perf in the same push: lazy composer/emoji/Settings/Another app; first load 682 → 535 kB gzip.
- Reviewed by Fable twice (matrix layer, UI + handover); findings fixed.

## CEO to try by hand
1. Pin/Unpin from the More menu (yours and others'); Pins tab hover Unpin; click a pin → lands on it with a flash; reload with `?tab=pins`.
2. Files in a public channel and a private channel/DM; images open the viewer, files download.
3. Link cards: with image, without, and a link with no preview (skeleton disappears, plain link stays). None in DMs/private channels.
4. Docs / Boards in the rail (EN/JP, light/dark).
5. Two tabs: second shows "open in another tab"; Use here moves the app; Use here back. Close the holder while the other waits → it starts.
6. Composer, emoji picker, Settings, Another app still open normally (now loaded on demand).
