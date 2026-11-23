---
id: AST-14
title: Assistant — encrypted conversations ask first (slice 4)
stage: todo
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [AST-09, SIDE-10, AST-04]
created: 2026-11-23
owner:
---

## Goal
"Not read: 2 sealed messages with … · Read them": an encrypted conversation is read only after the person's yes, every time, with the text handed over by their own browser (D-51). Slice 4 of SIDE-14; security-sensitive.

## Design gate
Approved 2026-11-23: AssistantSealed (+JP), AssistantLookup l4, the Sealed state on AssistantStates. Waits for AST-04 (the Sealed boards' words) and for AST-03's DM chip.

## Acceptance criteria
- [ ] The find wrapper in `matrix/` also searches encrypted conversations on a confirmed device, returns nothing for those hits and keeps them in a map inside `matrix/`, keyed by the ask ([the spec, §3.5](../../docs/specs/assistant.md), step 1)
- [ ] Encrypted hits are set aside before the 20-hit cap; at most 10 kept per conversation and 40 per ask; none kept from a conversation with a client of a closed space
- [ ] The ask-first row, composed by the panel from the kept hits; the server and the provider learn nothing of them before the yes
- [ ] "Read them" asks again with the kept messages attached, up to 40 messages and 24,000 characters; "Read it" inside an encrypted conversation hands over its most recent messages to the same caps
- [ ] Service: step 4's checks (joined now, the conversation is encrypted, the rule for conversations outside any space, sender and time from the server's own copy, a missing or deleted event dropped); attached text for a plain conversation is dropped and the server's own read used
- [ ] Rows from an encrypted conversation carry the shield; the "Looked in" line counts them; the chip on a sealed DM
- [ ] "Every time": the kept map is dropped when used, when the next ask starts, when the panel closes and on sign-out; a turn that used sealed text is left out of history; Look closer and Shorter on it ask again without the text
- [ ] The rest of test 3 and the hand-over case of test 11 (§9)
- [ ] One independent Fable review of the find wrapper, the attached-text path and the service's checks, before it ships; must-fix findings fixed

## Notes
- Built after sealed DMs exist (D-54, call 3). Until then every DM and every private workspace channel is encrypted and the Assistant reads none of them.
- Encrypted messages in a private workspace channel have no approved wording yet; they stay unread and unmentioned (spec, §10).
- The recovery keys the service holds for clients (D-38) are never used.

## Outcome

## Review notes
