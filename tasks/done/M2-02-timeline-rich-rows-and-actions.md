---
id: M2-02
title: Timeline: rich rows, media, actions, viewer
stage: done
area: frontend
milestone: M2
priority: P0
slice: false
depends_on: [M1-06]
created: 2026-11-20
owner: claude (M2-02 agent)
---

## Goal
Message rows render everything Batch B designs, with hover actions, reactions, the image viewer and the new-messages line.

## Acceptance criteria
- [x] Rows per Batch B: formatted text (parse sanitized html → React, never innerHTML), inline code, code block, long message (>15 lines → 10 + fade + Show more), reply quote (click jumps to original when found; fallback style when not), edited marker, deleted row, unsupported row, system summary row
- [x] Media: images inline (single/grid, aspect-correct placeholders while loading via mediaUrl), video and audio players, file and multi-file cards with download
- [x] Image viewer (lightbox) with download, keyboard (Esc, arrows), focus trap
- [x] Hover bar (React · Reply · More) with D-20 motion; reactions row (mine state, counts, who-reacted tooltip, click toggles); More menu (react, reply, edit own, delete own → confirm dialog, copy link → toast, copy text)
- [x] Edit: row mounts `MessageEditor` from app/composer (owned by M2-03) while editing
- [x] New-messages line on entering a channel with unread; Jump to latest when scrolled up with unread below; typing indicator in the reserved space above the composer
- [x] Mentions of me highlighted (mention background)
- [x] Tests with the fake store; checked in a browser against Batch B boards in EN/JP × light/dark
- [x] `pnpm check` green

## Notes
Owns app/timeline/ (not the composer). Reply/edit actions call into the composer via a small context the M2-03 agent exposes (coordinate through app/composer/context.ts: `startReply(messageId)`, `startEdit(messageId)`).

## Outcome
Rows render everything in Batch B, read through `useWorkspace`/`useStore` only, developed against the fake store.

- **Text:** `RichText.tsx` parses the sanitized html with DOMParser and an allow-list walk into React elements (never innerHTML). Mentions (`a[data-mention]`) become pills, links open in a new tab with `rel="noopener noreferrer"`, and unsafe schemes are dropped. Code blocks have Copy on hover. "(edited)" sits after the last word. Long messages (over 15 measured lines) show 10 lines with a fade and Show more; they stay open until you leave the channel.
- **Rows:** reply quote (jumps to the original and flashes it when loaded; fallback quote with no avatar and no click otherwise; "Message deleted" when the original is gone), deleted, unsupported (with fallback text or "can't be shown"), system (joined/left with `Intl.ListFormat`, さん in JP), mention-of-me tint.
- **Media (`Media.tsx`):** single image up to 360×280, aspect kept, placeholder until `mediaUrl` resolves. Consecutive images or files from one sender with no caption join one grid or card (`buildItems` groups). Video has poster, play and duration, then native controls. Audio has a play row with progress. Files show a typed tile and size, with Download.
- **Actions:** hover bar (React · Reply · More) and More menu per the board (own: Edit, Copy text, Copy link, Delete; others: Copy text, Copy link). Delete goes through the confirm dialog; Copy link shows a 2 s toast. Reply and Edit go through `app/composer/context.ts`, and the row mounts `MessageEditor` while editing. Reactions show mine, toggle on click and name who reacted after 500 ms. The React buttons open the composer's `EmojiPicker` (`ReactionPicker.tsx` positions it).
- **Viewer:** Radix dialog (focus trap, Esc), ← → across the channel's images, click toggles fit / 100 %, Download.
- **New line, Jump to latest, typing:** the New line goes above the first unread at open and stays until you leave. The pill counts messages that arrive while you are scrolled up. Typing sits in the composer's reserved 22 px.
- **Shared changes:** ui Dialog gets `top` and `role`, Button a `danger` variant, Avatar sizes 16 and 30. New tokens `quotebar`, `editbg`, `tip`/`ontip`, `viewerscrim`, `mono`. Formatters in `format.ts`: list, size, duration. Fake store has rich `!general` and `!eng` histories, per-ref SVG media and a richer `send`.
- **Verification:** `rows.test.tsx` and `items.test.ts` (row types, media, viewer keyboard, reactions, actions, New line, jump, typing). `pnpm check` is green. Checked against the boards at 1440 in EN/JP × light/dark with headless Chrome over CDP, with the composer stubbed while it was crashing mid-build.
- **Deviations:** no voice-message waveform row, because the contract has no voice flag; voice clips render as audio. The release-notes sample collapses only because it is over 15 lines (the rule), whereas the board shows it collapsed at 12. The More menu has no React/Reply items, since the board puts those in the hover bar.

## Review notes
(CEO)

Lead review: browser-tested against the local server in JA/dark: system join line, New line, mention pill, reactions (mine), More menu (opens upward near the bottom), delete confirm with preview, deleted row, inline image.
