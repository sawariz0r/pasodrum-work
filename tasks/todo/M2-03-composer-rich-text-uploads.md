---
id: M2-03
title: Composer: rich text, mentions, emoji, uploads, edit
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
The composer and edit-in-place match Batch B: formatting, mentions, emoji, links, replies and uploads.

## Acceptance criteria
- [ ] TipTap composer replacing the plain textarea: format bar (bold, italic, strike, link, bullet + numbered list, quote, inline code, code block) per ComposerFormat; Markdown-ish shortcuts; Enter sends via isImeEnter, Shift+Enter newline
- [ ] Mention picker on @ (keyboard navigable, members from store), mention chips → Draft.mentions + html pills; emoji picker (emojibase EN/JA search) and :shortcode: autocomplete
- [ ] Link dialog per LinkDialog; replying-to bar per ComposerReply with cancel
- [ ] Upload tray: attach button, paste image, drag-and-drop overlay (DropOverlay), per-file progress, failed tile with retry/remove, too-large tile; Send waits for uploads and is blocked by failed ones
- [ ] `MessageEditor` (edit in place, MsgEdit): Enter saves, Esc cancels, empty save opens delete confirm
- [ ] `app/composer/context.ts` exposing startReply/startEdit for the timeline actions
- [ ] Sends via store.send(Draft) with body (plain fallback), html, mentions, replyTo; setTyping while typing
- [ ] Tests (IME, mentions, uploads states, edit save/cancel); checked in a browser against Batch B boards in EN/JP × light/dark
- [ ] `pnpm check` green

## Notes
Owns app/composer/ (move the M1 Composer here from app/timeline/ and leave a re-export). TipTap + emojibase are installed.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
