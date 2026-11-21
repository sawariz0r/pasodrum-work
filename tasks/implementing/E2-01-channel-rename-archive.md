---
id: E2-01
title: Channel rename and archive (Batch E2)
stage: todo
area: frontend
milestone: M5
priority: P1
slice: false
depends_on: [M6-01, M6-02]
created: 2026-11-21
owner:
---

## Goal
Build Batch E2 (approved 2026-11-21; read `design/canvas/RulesE2.dc.html` first). Start after M6 is committed (it touches `store.ts`, channel details and Browse).

## Contract (lead adds before the build)
- `Channel.archived?`, `JoinableChannel.archived?`, a "may manage this channel" flag (Owner/Admin/creator; never `#general`)
- `renameChannel(channelId, name)` → `name-taken` / other; `setChannelArchived(channelId, archived)` (D-28 levels per channel; unarchive restores D-27)

## Acceptance criteria
- [ ] Channel details → Settings: Name (inline Save, rules as New channel, taken, error→Retry), Archive card; members see Notifications only
- [ ] Rename row in the timeline (pencil), archive row (box)
- [ ] Archived: quiet bar + Unarchive for those allowed, no reactions/add-person, leaves the sidebar, Browse → Archived group with Unarchive
- [ ] `#general` never offers rename/archive; client-space home = first non-archived channel
- [ ] EN/JP, light/dark; tests only for permission gating (D-30); `pnpm check`; browser check
