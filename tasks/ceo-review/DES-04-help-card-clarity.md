---
id: DES-04
title: Help card clarity — tell staff what to do next
stage: ceo-review
area: design+web
milestone: side
priority: P2
slice: false
depends_on: [SIDE-04, SIDE-05]
created: 2026-11-22
owner: des04 session (Claude)
---

## Goal (CEO)
The staff "{name} needs your help" card (DM from Pasodrum, D-38) doesn't say what the staff member should DO, especially the first time it shows up. Clarify it without changing it much.

## What staff can really do (checked in code)
Staff can't confirm the device for them. They can reach the client (Email button; the client's "helped" screen promises "They'll call or email you soon") and tell them the step that works:
- `email-missing` (sent screen pill, "Didn't get the email?" screen): the mail goes to the address from their invite, shown on the card. Client can check spam and tap **Send it again** (once a minute).
- `stuck` (gate pill; link page while the link is still open): client taps **Email me a link** and follows the email on any device.
- `link-broken` (link page after it stopped working): links last 15 minutes, work once, and a newer request kills the older link. Client gets a new link on the device they're signing in on and opens the newest email.

Known gap (not in scope): the "We can't email you a link" screen (no-key / wrong-key) also sends `email-missing`, but has no Send it again; only Use another device or Start fresh work there.

## Plan
One action line per reason under the reason line (`security.helpCard.next.*`, EN + JP), same layout and buttons. Mirror the line in the plain body for other apps (D-05).

## Outcome
- **Boards approved 2026-11-22** (in this chat). The staff help component now shows one bold next-step line under the reason. Boards are on Confirm by email: EmailConfirmStaffHelp, EmailConfirmStaffHelpJP, EmailConfirmStaffHelpDark (email didn't arrive), plus EmailConfirmStaffHelpStuckJP and EmailConfirmStaffHelpLinkDark. The Discovery section was removed.
- **App:** `security.helpCard.next.{email-missing,stuck,link-broken}` in en/ja; `HelpCard.tsx` renders it (`.next`, 15px/600). Layout and buttons unchanged.
- **Invite service:** the plain body (other apps, D-05) adds the same line after the reason (`help.ts` `NEXT`). `confirm.integration.ts` body regex updated.
- **Checks:** `pnpm check` green (348 tests). Browser on `/dev/app?help=…` (fake store): EN light (email), JP light + dark (stuck), EN dark (link) match the boards. Not run: `pnpm test:invite` (the running invite container is built from another checkout), and a real help DM on the local stack.

## Review notes
