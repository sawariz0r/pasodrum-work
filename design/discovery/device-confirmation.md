# Discovery: confirming a new device without a long key (2026-11-21)

Status: **approved by the CEO (2026-11-21): the direction and all 29 boards** (canvas version 50, page "discovery", "Discovery — Confirm by email (clients)"). For the lead: add the inventory rows below, log the draft D-38, and plan the build.

### Proposed `design/INVENTORY.md` rows (approved 2026-11-21)
| Screen | Boards | Status |
|---|---|---|
| Client, new device: Confirm it's you (email; Use another device when one is signed in) | EmailConfirmGate, EmailConfirmGateOther, EmailConfirmGateJP, EmailConfirmGateDark | approved 2026-11-21 |
| Check your email (waiting) | EmailConfirmSent, EmailConfirmSentJP, EmailConfirmSentDark | approved 2026-11-21 |
| You're all set | EmailConfirmDone | approved 2026-11-21 |
| Didn't get the email? (send again, ask contact, start fresh) | EmailConfirmHelp, EmailConfirmHelpJP | approved 2026-11-21 |
| Help is on the way (client) | EmailConfirmHelped, EmailConfirmHelpedJP, EmailConfirmHelpedDark | approved 2026-11-21 |
| The confirm email (EN, JP) | EmailConfirmEmail | approved 2026-11-21 |
| Link page (any device, phone-first): confirm, confirmed, no longer works, help on the way | EmailConfirmLinkAsk, EmailConfirmLinkOk, EmailConfirmLinkExpired, EmailConfirmLinkHelped, EmailConfirmLinkAskJP, EmailConfirmLinkOkJP, EmailConfirmLinkAskDark, EmailConfirmLinkOkDark | approved 2026-11-21 |
| Staff: a client needs your help (DM from Pasodrum) | EmailConfirmStaffHelp, EmailConfirmStaffHelpJP, EmailConfirmStaffHelpDark | approved 2026-11-21 |
| Rules: confirm by email | EmailConfirmRules | approved 2026-11-21 |

Components: `EmailConfirm`, `EmailConfirmLink`, `EmailConfirmStaff`. For clients these replace ConfirmGate/ConfirmGateNoDevice, RecoveryKeySave, RecoveryKeyEnter and the Recovery key row in Settings → Devices; staff and the team keep those (RulesM6).

### Draft D-38 · Clients confirm new devices by email, amends D-31
- **Clients** confirm a new device by email: Confirm it's you → Email me a link → the link page (any device) → **Yes, it's me** → the waiting device is confirmed and history comes back. Emoji with another signed-in device stays as a second option. Clients never see a recovery key.
- **Key held by our server for clients only:** the client's recovery key is created silently and stored encrypted in the invite service (apart from Matrix data). After the tap, the waiting device (authenticated as itself) fetches it once and confirms with it. Accepted tradeoff (CEO): a breach of our server could read client DMs, like client-space channels (D-11). Email is the client's master key. Staff and the team keep their own recovery key; the server never holds it.
- **Link:** single use, 15 minutes, bound to the device that asked; a new email replaces the old link. Opening the link never confirms (mail scanners); only the tap does. No "It wasn't me".
- **Help me:** on every screen where something can go wrong. Sends the contact (who added the client to the space; else its Owners/Admins) a read-only DM from the system sender "Pasodrum" with who, space, what went wrong, email and local time (full plain body, D-05). Signed-in or valid-link only; once per 10 minutes; nothing secret in it.
- **Fallback:** Start fresh + staff confirm on a call + share history (SIDE-03, D-35).


## Agreed (CEO, 2026-11-21)
- **Clients confirm a new device by email.** The new device shows "Confirm it's you", we email a link, the client opens it on any device (phone too), and the waiting device carries on by itself with history back. The words admit it's an extra step and say why it's there.
- **Our server keeps each client's recovery key**, locked in the invite service, apart from Matrix data, so it can send the link any time. The tradeoff we accept: someone who breaks into our server could read client DMs, the same as client-space channels today (D-11). Email becomes the client's master key; a compromised mailbox is the client's risk.
- Clients never see a recovery key. Setup is silent.
- **Staff and the team keep the recovery key** as today. Our server never holds theirs.
- **Fallback** when email doesn't work: the existing staff route (Start fresh, staff confirm on a call, history shared back).
- "Use another device" (emoji) stays for clients who have another device signed in.
- **Help me everywhere (CEO):** every screen where something can go wrong has "Need help? Ask <contact>". One tap sends the contact (the team person who added the client to the space; else the space's Owners/Admins) a read-only DM from the system sender "Pasodrum": who, which space, what went wrong, email, local time. The client sees "<contact> will help you". Signed-in or valid-link only, once per 10 minutes, nothing secret in it.
- **No "It wasn't me" on the link page (CEO):** ignoring the email is enough (the link dies after 15 minutes); the email says "Wasn't you? Ignore this email and change your password"; a worried client uses the help pill. The page still needs a tap on "Yes, it's me" because mail scanners open links.
- LINE/SMS may come later, as a code that proves it's them, never as the carrier of the key.
- Still open: report the dehydration bug upstream (G); group DMs and share history.

## Where we are, and what changes the picture
Today a new device is confirmed by **emoji with another of your devices**, or by typing the **recovery key** (48 characters, case matters). After a reset, staff can **share a DM's history back** once they've confirmed the client by emoji on a call (SIDE-03).

For clients, the only encrypted conversations are **DMs with our staff**. Client-space channels aren't encrypted (D-11), and clients can only DM team people (D-23). So a staff device holds every encrypted message a client has. For a client, the recovery key protects almost nothing that staff can't give back.

## Options

| Option | For a client | Security tradeoff | Server / SDK today | Size | Element X |
|---|---|---|---|---|---|
| **A. Staff are the safety net.** Clients never see a key. Lost everything → sign in, Start fresh, staff confirm on a call, history comes back | "Lost your laptop? Sign in, then call us." | Anyone with the client's password can start fresh. Staff must confirm by emoji on a call before sharing or messaging (the app already blocks until then). SIDE-03 covers 1:1 DMs only | Works now (SIDE-03, MSC4268) | S | Fine; it keeps suggesting "Set up recovery" |
| **B. Save the key in the browser's passwords.** The browser offers to save it; iCloud Keychain / Google fill it on the next device | "Save it like a password. Next time it fills itself." | Same as today; as safe as their password manager | Nothing new | S | Can paste it |
| **C. Recovery sheet.** A one-page PDF to print or keep | "Print this and keep it with your papers." | Paper can be found | Nothing new | S | Can type it |
| **D. Six words instead of the key** (secret-storage passphrase) | "Write down six words." | ≈66 bits vs 256. Fine against online guessing, weaker if our server's data is stolen and attacked offline. 4 words is too weak | SDK supports it | S–M | Element's new screens only take the key |
| **E. Passkey: Face ID / fingerprint unlocks the key** (WebAuthn PRF wraps the key; the wrapped copy lives in our account data) | "Use Face ID." | Strong and phishing-proof, but only an *extra* way in: delete the passkey or switch phone brands and it's gone | Nothing on the server. Chrome/Edge, Safari/iOS 18.4+, Firefox yes; Windows Hello only Win 11 (Feb 2026+); Bitwarden passkeys no. **Apple sync is shaky:** unresolved 2026 reports of one passkey giving different values on iPhone vs Mac. No Matrix app does this yet | M | No (our passkey works on pasodrum.work only) |
| **F. QR sign-in:** scan a code on the new device with a signed-in device; it arrives confirmed (MSC4108/4388) | "Scan this with your other device." | Strong; keys travel over a sealed channel | **Not yet.** Continuwuity merged the new rendezvous (MSC4388) on 20 Nov, unreleased. Our SDK only speaks the 2024 version. Needs OAuth sign-in (Continuwuity has it; we use passwords, D-12). Clients' "other device" is a laptop without a camera-friendly scan (no phone app, D-15) | L | Element X links devices this way, on the 2024 version |
| **G. Dehydrated device:** an offline mailbox that catches keys while you're signed out everywhere | Invisible | Doesn't confirm anything; opening it still needs the key or emoji | **Broken on Continuwuity** (our spike): it stores the device and senders encrypt to it, but fetching its messages fails (server library expects POST, SDK sends GET). Small upstream fix in Ruma/Continuwuity | S after fix | Element Web uses it; Element X doesn't |
| **H. Use the sign-in password as the key** | "Nothing extra." | **No.** Our server sees the password at sign-in, so the server could read everything | — | — | — |

QR *verification* (scan instead of comparing emoji) isn't supported by Element X, so emoji stays.

## Recommendation
1. **Clients: A + B now.** Clients never see a recovery key. It's created silently, with one optional step, "Save to your passwords" (B). If a client loses everything, staff are the safety net, and that part is already built. Staff keep today's recovery key, because they hold everyone's history.
2. **Report G upstream now.** It's a tiny fix, and it stops A from losing messages sent while a client is signed out. **Revisit F** once Continuwuity releases MSC4388 and our SDK speaks it. **E only after** a real-device test on our iPhones, Macs and PCs.

## Decisions for the CEO
1. By default, do clients get **no recovery key**, with staff as their safety net? This accepts that anyone with a client's password can start fresh, so staff must always confirm by emoji on a call.
2. For clients: **"Save to your passwords"** (B), a **printable sheet** (C), both, or neither?
3. Do **staff** keep the recovery key as today?
4. OK to **report the dehydration bug** upstream (G)?
5. **Group DMs that include a client:** extend share history to them, or accept that their history doesn't come back?
