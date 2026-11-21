---
id: SIDE-03
title: "Share history" — staff restore a client's DM history after a lost recovery key
stage: backlog
area: frontend
milestone: side
priority: P2
slice: false
depends_on: [M6-01]
created: 2026-11-21
owner:
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
