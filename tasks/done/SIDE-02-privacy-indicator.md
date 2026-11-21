---
id: SIDE-02
title: Show clearly that a conversation is private (end-to-end encrypted), in plain words
stage: done
area: frontend
milestone: side
priority: P2
slice: false
depends_on: []
created: 2026-11-21
owner: side session (privacy + other tab)
---

## Goal (CEO)
Make it clear to a not-very-technical client that a DM / private channel is end-to-end encrypted — reassuring, not "Pentagon-level security". No technical lingo.

## Direction to design (needs canvas boards + CEO approval first)
- Start of the conversation (the DM intro / channel start): one calm line, e.g. EN "Only you and Henrik can read this conversation." / JP 「このメッセージは、あなたと Henrik さんだけが読めます。」 — names the people, says what it means; no "E2EE", "encrypted", "keys".
- Header: a small lock beside the name on encrypted conversations; hover/focus shows the same sentence. Unencrypted conversations show nothing (never "not encrypted").
- Amends D-11's "no encryption claims in copy" for encrypted conversations only — log as a decision when approved.
- Check it reads right for group DMs ("Only the people here can read this conversation.") and private channels.

## Outcome (2026-11-21)
Built to the approved boards (PrivateDM, PrivateDMTooltip, PrivateGroupDM, PrivateChannel, PrivateJP, PrivateDark), D-34. Also built OpenElsewhere / OpenElsewhereJP (D-33) in the same pass.

**Privacy line**
- Conversation start of every encrypted DM, group DM and private channel (`Dm.encrypted` / `Channel.encrypted`): 1:1 DM "Only you and {name} can read this conversation." (first name, as on the board; JP 「この会話を読めるのは、あなたと {name} さんだけです。」), otherwise "Only the people here can read this conversation." Shown above the history once the timeline reaches the start, not only when empty (as on the boards). Private channels get the lock tile + name + line; DMs keep their intro (face, name, local time) with the line under it.
- DM header (1:1 and group): small lock after the name, before the outside mark; same sentence on hover/focus; a focusable button with the sentence as its label. No header lock on private channels (CEO). Unencrypted conversations show nothing.
- Code: `app/security/Privacy.tsx`, `timeline/ChannelView.tsx` (+ a `start` prop on `Timeline.tsx`), `people/DmIntro.tsx` (children), `pages/Dms.tsx`.

**Open in another tab** (redesigned after the Fable review: no in-process shutdown)
- `platform`: `lock(name, onWaiting?)` checks whether the lock is free before queueing; `channel(name)` (BroadcastChannel); `reload()`; `yielded()` / `setYielded()` (sessionStorage). Without BroadcastChannel a waiting tab stays on the start skeleton as before; without Web Locks nothing changes.
- Contract: `Security.device` gains `'elsewhere'`; store `useHere()`. Fake store + `/dev/app?security=elsewhere`.
- `matrix/tabs.ts`: a tab that finds the store held shows OpenElsewhere and queues. "Use here" posts `take-over` on a per-account channel. Only the tab holding the lock acts on it: it waits for any running reset or new-recovery-key flow, sets `yielded` and reloads. Unloading releases the lock, so this is as safe as closing the tab. The reloaded page shows OpenElsewhere without asking for the lock. Its "Use here" clears the flag, asks, queues, and starts in place once the lock is free.
- Test: `matrix/tabs.test.ts` (a holder mid-reset yields only after it finishes; a yielded page never asks for the lock until "Use here").

**Checked:** `pnpm check` green. Browser (local server, two tabs of one account): second tab shows OpenElsewhere, "Use here" moves the app over and the first tab shows OpenElsewhere; reverse works. Encrypted DM: line + header lock + tooltip. Fake app: private channel and group DM in JP/light, OpenElsewhere JP.

## Review notes
- Try by hand: two tabs → second shows the screen → Use here → the first reloads into the screen → Use here back. Close the holding tab while a fresh tab waits: the waiting tab starts by itself.
- Known limits: a holder that doesn't answer (an older app version still open, or a frozen background tab) leaves "Use here" queued until that tab is closed or reloaded. With three tabs, a tab that was already waiting can get the app before the one that was clicked; the clicked tab stays queued and gets it next. A yielded tab stays on OpenElsewhere after a manual reload until "Use here" is clicked. Yielding drops whatever the old tab was doing, exactly like closing it (a message still sending fails there). In dev, Vite HMR can leave a tab showing the screen to itself; "Use here" or a reload fixes it.
