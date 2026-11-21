---
id: SIDE-03
title: "Share history" — staff restore a client's DM history after a lost recovery key
stage: ceo-review
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [M6-01]
created: 2026-11-21
owner: share-history-ui session
---

## Goal (CEO)
When a client loses their recovery key and resets, a staff member can give back the history of their DM ("I've got your back").

## Safety (agreed direction)
- Staff-initiated only, per conversation, only to the client's current confirmed identity.
- Before sharing: staff and client compare the emoji (user verification) **on a call or in person** — never inside the same chat — plus a clear "Only do this if you've confirmed it's really {name}" step.

## First: spike (≈1 h)
- Does our matrix-js-sdk / Rust crypto version support sharing room history keys with another user (MSC4268 key bundle, or forwarding megolm sessions)? Element X behaviour? Continuwuity only relays encrypted to-device + media, so it should work.
- Then design boards (Batch side) → CEO approval → build.

## Spike result (2026-11-21, code reading only)
**Feasible.** matrix-js-sdk 45.1.0 already implements MSC4268 key bundles:
- Sender `RustCrypto.shareRoomHistoryWithUser(roomId, userId)` (`rust-crypto/rust-crypto.js:1327`) builds the bundle, uploads it encrypted to media, sends `m.room_key_bundle` only to devices cross-signed by the recipient's *current* identity (`identityBasedStrategy`). Requires staff's own device to be verified.
- Receiver `markRoomAsPendingKeyBundle(roomId, inviter)` + `maybeAcceptKeyBundle(roomId, inviter)` (`rust-crypto.js:219,271`).
- Not on the public `CryptoApi` (only `CryptoBackend`); the SDK calls them on invite/join. For an existing DM we cast inside `apps/web/src/matrix/` and keep the SDK pinned.
- Trust: staff verifies the client (emoji, `requestVerificationDM` → `getUserVerificationStatus`, then share). The receiver needs a trigger — e.g. a "history shared" marker event in the DM that makes the client app run the accept.
- Risks to probe live: Continuwuity authenticated media upload/download for the bundle blob; identity-pin behaviour after reset; Element X MSC4268 support (unverified).
- Fallback (worse): per-room `exportRoomKeys` filter + `encryptToDeviceMessages` + `importRoomKeys` — keys show as unauthenticated.

**Next:** 1–2 h live test on dev (staff + a client after `resetEncryption`), then design boards (staff "Share history" with the confirm step; client "History restored" row), then build (S–M).

## Live test (2026-11-21, local server, `dev/spike-share-history.ts`)
**Works.** After a reset the client read 0/6 old messages; after staff verified (SAS) and called `shareRoomHistoryWithUser`, 6/6. Messages show a grey shield ("authenticity not guaranteed", forwarded by staff); restored keys go into the client's new backup. Continuwuity: bundle upload + authenticated download 200, to-device < 1 s.
- **App must enforce:** (1) staff verified the client's *current* identity — the SDK shares even if unverified; (2) staff's own device is confirmed — otherwise the call succeeds but sends nothing (SDK log warning only).
- Refused (good): staff verified the old identity; client reset again after verification.
- **Client trigger:** `maybeAcceptKeyBundle(dmId, staffId)` after the bundle arrived (no 24 h limit) — fire it on a "history shared" marker event in the DM; or `markRoomAsPendingKeyBundle` right after the reset (24 h window).
- Element X not tested.
**Next:** design boards (staff: Share history with verify-on-a-call + confirm step; client: "history restored" row, grey-shield wording) → build (S–M).

## Outcome (UI, 2026-11-21)
Built to the approved Batch H boards (ShareHistory*, ConfirmPersonAsk, HistoryRestoredRow), EN/JP, light/dark. The matrix layer was already committed (D-35). Nothing committed.

- **Entry:** in a 1:1 DM, the profile card shows **Share earlier messages** in place of Message. It shows only when I'm team (Owner/Admin/Member of the workspace) and the DM is an encrypted 1:1 with an outside person, which is the store's rule (`mayShareHistory` in `app/people/ProfileCard.tsx`). It works on both `/dms/:id` and `/w/:space/dm/:id`, and opened from a name in the timeline too.
- **Flow** (`app/security/share/ShareHistory.tsx`, rendered in the one security card by `SecurityProvider`):
  - Device not confirmed → "This device isn't confirmed" (Cancel / Confirm → the M6 flow).
  - Otherwise `personConfirmed`; if false, `requestPersonConfirmation` → "Call {name}, then compare emoji" (waiting dots, then the emoji).
  - After a match → "Share earlier messages with {name}?" + the "Only do this if…" box → Sharing… → Shared (Share again / Done) or Couldn't share (Cancel / Retry).
  - `not-ready` → "{name} hasn't set up again yet" (OK). `not-confirmed` (they reset meanwhile) → back to comparing emoji.
- **Client side:** a person confirmation in phase `asked` is accepted at once, so the emoji show straight away under "{name} wants to confirm it's you" (They don't match / They match, X declines). A match closes quietly.
- **Timeline:** the system row "{name} shared earlier messages" ("You shared earlier messages" for the sender), with the history-clock icon. `restored` messages get a small grey history-clock after the time on their name line. It is focusable (`role="img"`, `tabIndex=0`, aria-label = the sentence), and on hover or focus it shows "Shared by {name}. We can't confirm who sent it." The first restored message after a normal one always starts a new name line, so the mark is never hidden in a group.
- **Failed action:** the profile card's Message now shows the `failed.message` toast if opening the DM fails (it used to fail silently).
- **Test:** `security.test.tsx` checks that Share shows only for team in a 1:1 DM with an outside person (owner, member, team DM, client, guest). `pnpm check` is green.

**Deviations / undesigned states (small, built in the M6 layout):**
- Asker waiting for the other person: the verify title with waiting dots and Cancel. The board only shows the emoji step.
- Asker failure: "The emoji didn't match" or "No answer from {name}" (declined or timed out), with Cancel / Try again. The asked side's failures close quietly, like the M6 approver.
- No "done" tile after a person match. The asker goes straight to the question; the asked side's dialog just closes.
- Names in these dialogs, the row and the tooltip are first names, as on the boards (same as the privacy line).
- `dev/FakeApp.tsx`: added `?confirm=person` (use with `?as=client`) and `?notready`.

**Hand test (CEO):**
- `/dev/app/dms/!dm-henrik`: header name → Share → compare → They match → Share → Shared. Then Share again, and Done.
- `/dev/app/dms/!dm-henrik?notready` → "Henrik hasn't set up again yet".
- `/dev/app/dms/!dm-henrik?security=unconfirmed` → the header card → "This device isn't confirmed" → Confirm.
- `/dev/app/dms/!dm-jonas`: Message, no Share. `?as=client`: Message.
- `/dev/app/dms/!dm-henrik?as=client&confirm=person` → the ask dialog. `?as=client` alone → the restored marks and the tooltip (hover, and Tab to it).
- **Production:** you need a staff account on a confirmed device, and a client in a 1:1 DM with that staff member that has some older messages.
  1. Client: sign out and sign in again on a fresh browser, choose "Can't confirm?" → Reset. The old messages show as not available.
  2. Staff: open the DM header → Share earlier messages. Call the client and compare the emoji on both screens; both press They match → Share → Shared.
  3. Client: the row "{staff} shared earlier messages" appears, the old messages come back, and each has the grey mark.
  4. Also try sharing before the client has set up again (not-ready), and from a staff device that isn't confirmed.

