---
id: M8-01
title: M8 find & finish — ⌘K switcher, message search, failed actions, sign-in errors, DMs empty
stage: ceo-review
area: fullstack
milestone: M8
priority: P1
slice: false
depends_on: [M7-01]
created: 2026-11-21
owner: lead
---

## Outcome
- ⌘K switcher (header magnifier or ⌘K/Ctrl+K): recent conversations, Channels / DMs / People, "Search messages for …".
- Search page: local scan (Japanese substring, full/half-width, case), newest first, highlight, "Search older messages"; private conversations skipped until the device is confirmed.
- Failed actions: inline "Couldn't … Try again." in dialogs, toast for menu actions — every action the audit found silent.
- Sign-in: "Something went wrong", "Too many attempts". DMs page with no DMs.
- Finish: focus returns after dialogs, reduced-motion jumps, flaky tests fixed, threads list only shows threads I'm in, bundle split (535 kB gzip first load).
- Not done (by choice): shortcuts sheet; light-theme contrast 4.43–4.45:1 on accent-soft pill / hovered subtle text (design call).

## CEO to try by hand
1. ⌘K from a channel: recent list, type a name, Enter; "Search messages for …".
2. Search a Japanese word that sits inside a longer word, and an English word with different case; click a result → lands on it; "Search older messages".
3. Make something fail (e.g. go offline, then Archive / Remove / Make owner): line in the dialog or a toast.
4. Sign in with a wrong password several times quickly → "Too many attempts".
5. An account with no DMs → "No direct messages yet".
