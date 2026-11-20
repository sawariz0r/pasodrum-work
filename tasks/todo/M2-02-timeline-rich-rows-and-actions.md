---
id: M2-02
title: Timeline: rich rows, media, actions, viewer
stage: todo
area: frontend
milestone: M2
priority: P0
slice: false
depends_on: [M1-06]
created: 2026-11-20
owner:
---

## Goal
Message rows render everything Batch B designs, with hover actions, reactions, the image viewer and the new-messages line.

## Acceptance criteria
- [ ] Rows per Batch B: formatted text (parse sanitized html → React, never innerHTML), inline code, code block, long message (>15 lines → 10 + fade + Show more), reply quote (click jumps to original when found; fallback style when not), edited marker, deleted row, unsupported row, system summary row
- [ ] Media: images inline (single/grid, aspect-correct placeholders while loading via mediaUrl), video and audio players, file and multi-file cards with download
- [ ] Image viewer (lightbox) with download, keyboard (Esc, arrows), focus trap
- [ ] Hover bar (React · Reply · More) with D-20 motion; reactions row (mine state, counts, who-reacted tooltip, click toggles); More menu (react, reply, edit own, delete own → confirm dialog, copy link → toast, copy text)
- [ ] Edit: row mounts `MessageEditor` from app/composer (owned by M2-03) while editing
- [ ] New-messages line on entering a channel with unread; Jump to latest when scrolled up with unread below; typing indicator in the reserved space above the composer
- [ ] Mentions of me highlighted (mention background)
- [ ] Tests with the fake store; checked in a browser against Batch B boards in EN/JP × light/dark
- [ ] `pnpm check` green

## Notes
Owns app/timeline/ (not the composer). Reply/edit actions call into the composer via a small context the M2-03 agent exposes (coordinate through app/composer/context.ts: `startReply(messageId)`, `startEdit(messageId)`).

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
