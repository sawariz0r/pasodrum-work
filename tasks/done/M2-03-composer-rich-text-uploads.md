---
id: M2-03
title: Composer: rich text, mentions, emoji, uploads, edit
stage: done
area: frontend
milestone: M2
priority: P0
slice: false
depends_on: [M1-06]
created: 2026-11-20
owner: claude (composer agent)
---

## Goal
The composer and edit-in-place match Batch B: formatting, mentions, emoji, links, replies and uploads.

## Acceptance criteria
- [x] TipTap composer replacing the plain textarea: format bar (bold, italic, strike, link, bullet + numbered list, quote, inline code, code block) per ComposerFormat; Markdown-ish shortcuts; Enter sends via isImeEnter, Shift+Enter newline
- [x] Mention picker on @ (keyboard navigable, members from store), mention chips → Draft.mentions + html pills; emoji picker (emojibase EN/JA search) and :shortcode: autocomplete
- [x] Link dialog per LinkDialog; replying-to bar per ComposerReply with cancel
- [x] Upload tray: attach button, paste image, drag-and-drop overlay (DropOverlay), per-file progress, failed tile with retry/remove, too-large tile; Send waits for uploads and is blocked by failed ones
- [x] `MessageEditor` (edit in place, MsgEdit): Enter saves, Esc cancels, empty save opens delete confirm
- [x] `app/composer/context.ts` exposing startReply/startEdit for the timeline actions
- [x] Sends via store.send(Draft) with body (plain fallback), html, mentions, replyTo; setTyping while typing
- [x] Tests (IME, mentions, uploads states, edit save/cancel); checked in a browser against Batch B boards in EN/JP × light/dark
- [x] `pnpm check` green

## Notes
Owns app/composer/ (move the M1 Composer here from app/timeline/ and leave a re-export). TipTap + emojibase are installed.

## Outcome
- `app/composer/` now owns the composer; `app/timeline/Composer.tsx` re-exports it. ChannelView wraps timeline + composer in `ComposerProvider` (kept the timeline agent's `context.ts` API: replyToId, editingId, startReply, cancelReply, startEdit, stopEdit).
- TipTap composer: format bar (bold, italic, strike, link, numbered and bulleted lists, quote, inline code, code block) with pressed states, Markdown shortcuts, autolinks, paste a URL over selected text to make a link. Plain Enter sends through `isImeEnter`. Shift+Enter starts a new line, list item or code line. Esc cancels a reply; ↑ in an empty composer edits your last message.
- `@` mention picker: members from `store.members`, people already mentioned left out, keyboard navigable, chips become `Draft.mentions` and `https://matrix.to/#/@id` pills. Emoji picker plus `:shortcode:` autocomplete and `:code:` auto-replace. Search covers EN and JA names and tags plus GitHub/emojibase shortcodes. The data loads lazily, and emoji newer than the device can draw are skipped. `EmojiPicker` takes `onPick`, so it can be reused for reactions.
- Link dialog (text + address, Save disabled until valid, the selected text stays highlighted), replying-to bar with cancel, upload tray (attach, paste, drag over the channel with the drop overlay, progress, failed tile with retry, too-large tile, remove). Send waits for uploads in progress and is blocked by failed or too-large ones; files with no text send too.
- `MessageEditor` (MsgEdit): Enter saves (only if changed), Esc and Cancel cancel, saving empty opens the delete confirm (MsgDeleteConfirm, `DeleteConfirm.tsx`).
- `setTyping` while the draft has text; false on send, clear and unmount.
- Fake store: `send` keeps uploads still in progress in the tray (matches the real store); optional `uploadMs` simulates progress and preview URLs (`/dev/app` uses 2.4 s).
- Tests: `composer/Composer.test.tsx` (Enter/Shift+Enter, IME, blank drafts, formatted html, mention → draft, upload states block Send, waiting for uploads, paste, reply, edit save/cancel/empty → delete), `draft.test.ts`, `emoji.test.ts`. The ChannelView composer tests moved there.
- Checked in headless Chrome against ComposerFormat, ComposerReply, EmojiPicker, MentionPicker(+JP), LinkDialog, UploadProgress, UploadFailed(+JP), UploadDark, DropOverlay, MsgEdit and MsgDeleteConfirm, in EN/JP × light/dark.
- Deviations: the mention picker has no presence dots (the store has no presence yet, D-19). The `:shortcode:` list reuses the MentionPicker look (no board of its own). Avatar colours come from the app's hash, not the canvas's fixed colours. Delete confirm opens with focus on its close button (Radix default).


## Review notes
(CEO)

Lead review: browser-tested against the local server: mention picker from channel members, ⌘B / ⌘E formatting, `**bold**` shortcut on real typing, emoji picker with JA search, edit in place (Enter saves, edited marker), upload tray preview + send with caption. Bundle is now 2.0 MB / 611 KB gzip (TipTap + SDK) — code-split in M8.
