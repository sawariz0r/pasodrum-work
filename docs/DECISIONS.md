# Pasodrum work — Decisions & Learnings Log

> A living log. **Decisions** (ADR-style) are append-only; supersede rather than rewrite. **Learnings** capture what we discover as we build. When a decision is reversed, add a new entry that supersedes the old one and mark the old `Superseded`.

Companion: [SPEC.md](./SPEC.md) · [../AGENTS.md](../AGENTS.md)

---

## Decisions (ADR)

Format: **ID · Title · Status · Date** → Context / Decision / Rationale / Alternatives / Consequences.

Cross-link related decisions with `[[D-NN]]`. When superseding, add a new entry and edit the old one's status to `Superseded by [[D-NN]]`.

### D-01 · Use the agents-workflow operating system · Accepted · 2026-11-20
- **Context:** Need cross-session context (specs, decisions, in-flight work) so any agent or human can pick up where the last one left off.
- **Decision:** AGENTS.md + docs/SPEC.md + docs/DECISIONS.md + file-based `tasks/` board (`backlog → todo → implementing → ceo-review → done`), plus `design/INVENTORY.md` as the design gate. CLAUDE.md imports AGENTS.md.
- **Consequences:** Every session begins with AGENTS.md §0.

### D-02 · Stack · Accepted · 2026-11-20
- **Decision:** Vite + React + TypeScript, React Router (URL is navigation state), CSS Modules over design tokens, Radix primitives, TipTap composer, i18next, matrix-js-sdk with Rust crypto (WASM), Vitest, Playwright (Chromium + WebKit), pnpm workspace (`apps/web`, `services/invite`).
- **Not used:** Redux (the SDK client is the store, read via hooks), Tailwind, Storybook, service workers.
- **Rationale:** Proven Matrix SDK path; TipTap needed for mention chips and reused by Docs later; WebKit in CI keeps a Tauri shell viable.

### D-03 · Matrix confined to `matrix/`; classic sync · Accepted · 2026-11-20
- **Decision:** Only `apps/web/src/matrix/` imports matrix-js-sdk (lint-enforced). Our client uses classic `/sync` with lazy-loaded members. Simplified Sliding Sync is required on the server only because Element X needs it.
- **Rationale:** Classic sync is the SDK's proven path and a team-sized account syncs fast. Confinement contains SDK churn.
- **Alternatives:** Sliding sync in our client — newer, less proven in matrix-js-sdk.

### D-04 · Feature-module contract and removal guarantees · Accepted · 2026-11-20
- **Decision:** `defineFeature({ id, rail, routes, channelTabs, messageParts })`, listed once in `features/index.ts`. Removal = delete the folder and the line. No runtime on/off config. Extension points are added when first used (`rail`, `channelTabs` in M1; `routes`, `messageParts` in M7).
- **Guarantees:** tabs render stored ∩ registered; `send()` requires full text body; unregistered room types hidden; catch-all "not available" route.
- **Kept true by:** CI smoke test with `features = []`; fixture room with every feature's data rendering on an empty registry; removal drill (delete `link-cards`) in M7.
- **Alternatives:** Runtime `disabledFeatures` in `/config.json` — dropped by CTO review as a second mechanism nobody needs.

### D-05 · Interop rules for standard clients · Accepted · 2026-11-20
1. Anything a person should read is a standard message with complete `body` and `formatted_body`; our data rides as extra `work.pasodrum.*` keys. `matrix/send.ts` is the only sender and its type makes the body mandatory.
2. Non-chat objects (a board tab, a doc) announce themselves once as an ordinary message with an "Open in Pasodrum work" link.
3. Custom event types only for configuration state or inside feature-owned rooms; never needed to follow a conversation.
4. Only spec relations: threads with reply fallback, edits with text fallback, reactions, replies; mentions via `m.mentions` and standard pills.
5. Never change standard semantics: default room versions, standard join rules and power-level keys, no automatic redactions, no bot required.
6. On receive: unknown content with a body shows the body; without one it is hidden (state) or one quiet line (timeline). By M2 everything Element X can send has a renderer or fallback.
7. Every milestone ends with an Element X + Element Web smoke test on production (see [[D-18]]).

### D-06 · Workspace, client-space and role model · Accepted · 2026-11-20
- **Context:** CTO asked whether a "workspace" is a Matrix space. Yes.
- **Decision:** One company workspace "Pasodrum" = one Matrix space (invite-only). Each client gets its own **client space** = a separate Matrix space marked `work.pasodrum.space {kind:"client"}`. Channels use join rule *restricted* to their own space. Clients join only their client space; guests join neither space, only chosen channels. Roles: Owner = PL 100, Admin = PL 50 in the workspace; Member/Guest/Client = which space you're in. In client-space rooms `invite` needs PL 50.
- **Rail:** Pasodrum tile + one tile per client space the person belongs to. The rail "+" means **New client space** (Owner/Admin only). There is no "Create a workspace" anywhere: one company workspace per server in v1.
- **Rationale:** Clients can't see internal channels because the server refuses them, independent of our UI.
- **Consequences:** Client's-eye API test suite in CI from M5, rerun on every server upgrade. No staff-only rooms inside client spaces.

### D-07 · Identity and invite service · Accepted · 2026-11-20
- **Decision:** `services/invite` (Node + SQLite + SMTP), about five endpoints (`POST /invites`, `GET /invites/:code`, `POST /invites/:code/claim`, resend, revoke). It holds the registration token (never reaches a browser) and issues our own single-use codes. Accounts are created at invite time with deterministic IDs from email (`henrik@nordlys.no` → `@henrik_nordlys.no:pasodrum.work`). Unclaimed accounts expire after 14 days; temporary secret encrypted at rest; rate-limited. The service holds no power in any room.
- **Consequences:** No accept step for invitees; our app auto-accepts invites from inside the person's workspace or client space.

### D-08 · Platform interface; shell choice deferred to M9 · Accepted · 2026-11-20
- **Decision:** Web first. Only `platform/` touches notifications, badge, deep links, auth redirect, external links, storage persistence (interface in SPEC §6). Electron vs Tauri decided by a one-day spike of each in M9.

### D-09 · EN/JP approach · Accepted · 2026-11-20
- **Decision:** No literal strings in JSX (lint); `locales/{en,ja}.json` with typed keys and a parity check; feature strings in feature folders. Language in account data `work.pasodrum.settings`, browser language before sign-in. Inter + Space Grotesk self-hosted, then system JP fonts. One shared `isImeEnter()` guard (incl. the Safari post-composition Enter). `Intl.*` for dates/lists/plurals/sorting. Substring search. Events carry only the sender's fallback text; UI chrome renders in the viewer's language.
- **Consequences:** Every screen approved in EN and JP.

### D-10 · Design gate and the cut rule · Accepted · 2026-11-20
- **Decision:** Every screen and state is designed (by Opus, on the design canvas) and approved by the CEO before it's built. `design/INVENTORY.md` tracks status; a task can't enter `implementing/` unless its screens are approved. Batches are designed one milestone ahead.
- **Cut rule (CEO's words):** "Cut taglines, helper text and secondary labels. If a screen needs it to make sense, fix the layout instead. Make the best decision that will elevate all three: the user experience (UX), developer experience (DX) and agent experience (AX) always, without breaking things."

### D-11 · Encryption scope · Accepted · 2026-11-20
- **Decision:** Encrypt DMs and private channels. Public workspace channels and client-space channels are not end-to-end encrypted (still TLS in transit, stored only on our server).
- **UI rule (CTO):** never flash "unencrypted" / "not encrypted" — it sends the wrong signal. A lock means **private**. No encryption claims in copy.
- **Rationale:** Full encryption costs server search, history for newcomers, and a recovery-key step in every client's first session; "unable to decrypt" is the classic sign of a lesser Matrix app.
- **Consequences:** Device confirmation is asked only when someone first enters an encrypted conversation (M6).

### D-12 · Sign-in mode · Accepted · 2026-11-20
- **Decision:** Password sign-in for v1. The SSO button stays designed and appears only if the server advertises SSO.
- **Rationale:** Clients need accounts without our identity provider.

### D-13 · Continuwuity: GO · Accepted · 2026-11-20
- **Decision:** Keep Continuwuity. All must-haves pass locally and on production (sliding sync for Element X, client isolation incl. user directory, threads); the CEO's Element X test on production passed ("LGTM").
- **Fallbacks in force:** mentions list built locally (`/notifications` missing); message search = local substring scan (server search is whole-word, no Japanese); invite service checks callers with `whoami` (OpenID userinfo blocked with federation off); invite/reset mail sent by the invite service (server mail shows Matrix IDs and server branding).
- **Open for M6:** signed cross-signing keys and history sharing, verified with the SDK.
- **Interim (M0-03, local Continuwuity 26.9.4):** all four API must-haves pass (sliding sync, client isolation, user directory, threads); 17/20 rows pass. Fails with fallbacks: `/notifications` (404 → mentions list built locally), message search (word-based only; no partial words, no Japanese → local substring scan), OpenID userinfo (blocked with federation off → invite service checks callers with `whoami`). Details in [probe-results.md](./probe-results.md). Element X rows pending M0-05.

### D-14 · Server name `pasodrum.work` (provisional) · Accepted · 2026-11-20
- **Decision:** Assume `pasodrum.work` as server name and `work.pasodrum.*` as event namespace. CTO confirms before real accounts exist (before M3). Dev servers are disposable; production is disposable until [[D-18]] ends.

### D-15 · Phones · Accepted · 2026-11-20
- **Decision:** The join page works on phones; the app is desktop-width in v1. Phone users are pointed to their computer or Element X. Full phone layout deferred.

### D-17 · Hosting on Coolify with Docker Compose · Accepted (staging part superseded by [[D-18]]) · 2026-11-20
- **Decision:** Production runs on the CEO's Coolify as a Docker Compose resource from `deploy/docker-compose.yml`, repo `sawariz0r/pasodrum-work`. Coolify's proxy terminates TLS; Continuwuity is configured by env vars only, so nothing else needs mounting. The registration token is generated by Coolify (`SERVICE_PASSWORD_64_REGISTRATION`); `SERVER_NAME` is set per environment.
- **One domain:** a `web` service (Vite build served by Caddy, `apps/web/Dockerfile`, `deploy/Caddyfile`) owns `https://<SERVER_NAME>`; its Caddy forwards `/_matrix/*`, `/_continuwuity/*` and `/.well-known/matrix/*` to continuwuity, which has no public domain. Server name, Element X sign-in and links never move. Hashed assets cached for a year, `index.html` no-cache, SPA fallback to `index.html`.
- **Consequences:** no Mailpit in the deploy. Production has no mail until the invite service lands (M4). The Continuwuity image has no shell, so the compose has no in-container healthcheck.

### D-18 · No staging: deploy straight to production while it's just the CEO · Accepted · 2026-11-20
- **Context:** CEO: "We won't use a staging yet, we'll deploy and iterate to production until we have two actual users and I say so."
- **Decision:** One Coolify deployment = production, server name = the real domain (assumed `pasodrum.work`). We deploy and iterate there directly. Until the CEO says otherwise (at two real users), production is disposable: wiping its data volume is allowed, and test accounts from `pnpm dev:seed` may live there.
- **Consequences:** the CEO registers his own account first with the one-time bootstrap token, so the server admin is a real account, not a seed account. Seed/probe run against production with `dev/.env.production` (gitignored). Before a second real person joins: wipe, or at least deactivate the seed accounts and rooms. Milestone smoke tests run on production. A staging environment returns when the CEO asks for one.

### D-19 · Ship only controls that work; the store contract between matrix/ and app/ · Accepted · 2026-11-20
- **Show only what works:** each milestone shows the parts of the approved layout it makes work. M1: space tiles in the rail, profile menu (language, theme, sign out), channel list with unread/mention counts, channel header with name, Messages tab, timeline and plain-text composer, Batch A states. Later: Home/DMs/Activity and sidebar Threads/Mentions/Drafts/DMs (M3), Add people and members (M4), "+" New client space (M5), formatting/attach/emoji/mention in the composer (M2), Pins/Files/Docs/Boards via features (M7), "Forgot password?" (M4, needs invite-service mail; production has no SMTP).
- **Contract:** app/ talks to the server only through `WorkspaceStore` (`matrix/types.ts`): an immutable `WorkspaceSnapshot` + `subscribe`, read with `useWorkspace(selector)` (`useSyncExternalStore`), plus commands (`openTimeline`, `sendText`, `retry`, …). Entry points: `resolveServer`, `signIn`, `loadSession`, `createWorkspaceStore`. `app/testing/fakeStore.ts` implements the same contract for tests and dev screens, so UI work never needs a server.
- **Sign-in identifier:** a username, or a work email. For an email we try, in order: email bound to an account; the local part when the domain is the server's own (`oscar@pasodrum.work` → `oscar`); the deterministic ID from [[D-07]] (`henrik@nordlys.no` → `henrik_nordlys.no`).
- **Routes:** `/signin`, `/w/:spaceId/c/:channelId` (ids URL-encoded), catch-all "not available". The URL is the navigation state.

### D-34 · Privacy line in encrypted conversations (SIDE-02), amends D-11 · Accepted · 2026-11-21
Encrypted DMs, group DMs and private channels say who can read them, in plain words: "Only you and {name} can read this conversation." / "Only the people here can read this conversation." (JP 「この会話を読めるのは、…だけです。」) at the conversation start, plus a small header lock with the same sentence on hover/focus — DMs only; private channels keep their existing name lock. Never "encrypted"/"E2EE"/"keys"; unencrypted conversations show nothing. Amends D-11's "no encryption claims in copy" for encrypted conversations only. Boards: Private* (Batch G).

### D-33 · M7 scope: pins, files, link cards · Accepted · 2026-11-21
- **No add/remove tab in M7.** Pins and Files are built-in tabs (SPEC: not stored); the only addable types would be Docs/Boards "Soon", and D-19 says ship only controls that work. `work.pasodrum.tab` + the "+" arrive with the first real addable tab. Docs/Boards stay as "Soon" rail pages (SPEC M7).
- **Anyone in a conversation can pin** (Slack-like): `m.room.pinned_events` at level 0 for new rooms; a one-off migration lifts existing rooms.
- **Files tab:** server `contains_url` filter for unencrypted rooms; a scan of decrypted local history for encrypted ones (the server can't see inside).
- **No link cards in encrypted conversations** (a preview sends the URL to our server; keeps D-11). Cards: first link only.
- **Second tab (per-account crypto lock):** "Use here" asks the holding tab over a BroadcastChannel to stop and release; never steal the lock.

### D-32 · Translate (side feature), amends D-11/D-31 · Accepted · 2026-11-21
- **CEO (via the design-discovery session; confirmed directly to the lead 2026-11-21):** Translate is approved and built now as `features/translate` (SIDE-01, branch `side/translate`, merged by the lead after M6-02).
- **Amends D-11/D-31:** Translate also works in encrypted team conversations (team DMs, private channels). It's an internal staff tool: the person who asks sends that one message's text to the model and sees the translation only in their own client. Never in conversations with clients or guests (`Channel.outside` / `Person.external`).
- **Provider:** OpenAI standard API terms with `store: false`. `OPENAI_API_KEY` and `TRANSLATE_MODEL` in Coolify (added in Coolify 2026-11-21); model `gpt-6-luna` (CEO), standard Responses/Chat Completions API.
- **Endpoint:** `/api/translate` beside the invite service; caller checked with `whoami` and must be joined to the workspace space (team only); mentions/code/links replaced by placeholders, never HTML to the model; cache in the client only (memory, keyed on event id + content hash; never persisted, since it holds decrypted text); per-user limits plus a global daily budget, counting successful calls. No binding of text to a message (impossible for encrypted ones), so "never with clients" is a UI rule on top of the team-only endpoint.

### D-31 · M6 contract: encryption · Accepted · 2026-11-21
- **Batch F approved** by the CEO 2026-11-21 (RulesM6 is the behaviour spec).
- **Contract (`matrix/types.ts`):** snapshot `security` {device: starting|confirmed|unconfirmed, otherConfirmedDevices, needsRecoveryKey, confirmation?}; `Confirmation` {role new|approver, otherDevice?, phase waiting|asked|compare|matched|done|declined|timeout|mismatch, emoji? (SAS table index for EN/JP names)}; `Channel.encrypted`, `Dm.encrypted`, `Device.confirmed`, message kind `undecryptable` + `arriving`. Store: `requestConfirmation`, `acceptConfirmation`, `declineConfirmation`, `confirmEmoji`, `dismissConfirmation`, `useRecoveryKey`, `newRecoveryKey(password?)`, `resetEncryption(password)`, `signOutRisk()`.
- **Build:** matrix-js-sdk Rust crypto (WASM) with IndexedDB store; cross-signing bootstrap + server key backup with a recovery key (secret storage) before the first encrypted send; SAS emoji device confirmation (interoperates with Element X); `persistStorage()` via `platform/`.
- **Turn on encryption:** every DM (new and existing) and every private channel (new and existing) gets `m.room.encryption` (megolm). Irreversible by design (D-24). Public workspace channels and client-space channels stay unencrypted (D-11).
- **Gate:** an unconfirmed device sees the confirm card instead of an encrypted conversation; public/client-space channels never ask.
- **Private channels** don't show messages from before you joined (no history sharing dependency).

### D-30 · Test only what's really necessary · Accepted · 2026-11-21
- **CEO:** speed over coverage until the product settles; move fast, refactor and stabilise later.
- Write tests only for: security and isolation (who can see or join what, invite service authz), data that could be lost or corrupted, and logic that is easy to break silently (power levels, ordering, IME Enter). Skip tests for layout, copy and straightforward UI wiring; a browser check covers those.
- `pnpm check` stays the gate (typecheck, lint, existing tests, locales). Playwright e2e per milestone is dropped for now; manual browser check before push stays.

### D-29 · Work emails stay on the public profile · Accepted · 2026-11-21
- Any signed-in account can read any local profile by ID (Matrix default; Continuwuity can't limit it to shared rooms), including our `work.pasodrum.email` field. **CEO:** staff work emails aren't secret (guessable, sent to clients anyway), so they stay on the profile. Names and time zones are readable by ID as in any Matrix server.
- Revisit if profiles ever carry something private, or if clients shouldn't be able to list who works here. The alternative designed: per-space state `work.pasodrum.member` keyed by own user ID (only that user can write; only space members can read).

### D-28 · M5 contract: client spaces, outside mark, Another app · Accepted · 2026-11-21
- **Batch E approved** by the CEO 2026-11-21 (incl. Owners only step down themselves).
- **Space state:** `work.pasodrum.space` (state key `''`) carries `{kind, colour?, archived?}`. `Space.colour` comes from it (absent → the old id-hash colour); `Space.archived` sorts the tile last and dims it.
- **Archive** = raise `events_default` (and `m.reaction`/`m.room.redaction` events) to 50 in every channel of the space, so the server makes them read-only for everyone below Admin; Owners/Admins see the quiet bar with Unarchive and never post either (the UI shows the bar to all). Unarchive restores the D-27 levels. Nobody is removed. Known gap (room version 12, D-27): whoever created a channel outranks every level, so a team Member who made a channel can still post there after archiving; accepted.
- **Outside mark:** `Channel.outside` = clients and guests in the channel (joined or invited), filled only when my role is owner/admin/member. DMs need no field: `Person.external` already marks them.
- **Remove from space:** kick from the space and every channel in it, then revoke that person's open join codes for the space via the invite service (new endpoint if needed). Account is never deactivated (D-26 amendment).
- **createClientSpace:** the name check is client-side over spaces I can see plus a server-side re-check of the room directory/hierarchy I can reach; on failure the store leaves (and forgets) whatever it created, so nothing half-made shows.
- **Another app:** `anotherApp()` = `{server: host of the homeserver URL, username: the ID's localpart}` (D-07); the UI never builds it from IDs itself.
- **Phones (D-15):** app routes on a phone — `(max-width: 639.98px) and (pointer: coarse)`, so narrow desktop windows and high browser zoom keep the app — show the PhoneHandoff page; `/join/*` works on phones.
- **Outside mark gate:** shown when any of my roles is owner/admin/member (from `myRoles`), never from `me.external` (the real store doesn't set it for me).

### D-27 · Power levels that implement D-25 · Accepted · 2026-11-20
- **Levels:** Owner 100, Admin 50, client-space team ("staff") 10, everyone else 0.
- **Workspace space:** `m.room.power_levels` 50 (Admins can switch people Member↔Admin but can never touch Owners or go above 50 — Matrix enforces this), `invite` 50 (only Owner/Admin add Members), `m.space.child` 0 (any member can create workspace channels).
- **Client space:** team members of that client space get 10; `invite` 10, `m.space.child` 10 (its team, Owners and Admins add people and create channels; clients at 0 can't). Owner/Admin carried over at 100/50.
- **Channels:** inherit the levels of their space; `invite` 0 in workspace channels (any member can add guests), 10 in client-space channels; `m.room.power_levels` 50.
- **Owners:** one Owner can't demote another (same level) — Owners step down themselves (Batch E, approved 2026-11-21).
- **Room version:** keep the server default (v12). Its rule that a room's creator keeps top power can't be undone, so whoever creates a channel stays its top admin; acceptable at our size and noted here.

### D-26 · Mail via Resend from noreply.prpl.se; invite service shape · Accepted · 2026-11-20
- **Mail (CEO):** production mail (invites, later password reset) is sent by the invite service through the Resend HTTP API, from a verified sending domain `noreply.prpl.se` (From: `Pasodrum work <invites@noreply.prpl.se>`, configurable). The API key is sending-only, limited to that domain, and lives only in Coolify (`RESEND_API_KEY`). Locally mail goes to Mailpit (its HTTP send API), so no SMTP library is needed anywhere.
- **Service:** `services/invite` = Node 24 + built-in `node:sqlite` (no native deps). Endpoints under `/api/invites`: create (caller verified with `whoami`; must be allowed to add people where they're adding), preview by code, claim (name + password), resend, revoke, list pending for a channel ("Copy join link"). It registers accounts with the registration token (deterministic IDs per D-07), keeps the temporary password encrypted at rest (`INVITE_SECRET`), claims by changing the password via the standard API, revokes by deactivating. Codes are random, single-use, expire after 14 days. Rate-limited per caller and per IP.
- **Routing:** the web container's Caddy forwards `/api/invites/*` to the service (same origin, no CORS). The join page lives in the web app at `/join/:code`.
- **Amendment (lead, M4-01):** revoke invalidates the code only (state `revoked`); it never deactivates, since Matrix never frees an ID. Re-inviting an unclaimed account issues a fresh code for it (201).

### D-25 · Roles and channel creation (Batch D answers) · Accepted · 2026-11-20
- **Role changes:** Owners make or remove Owners. Owners and Admins change people between Member and Admin. Done from the profile card / channel members. (Supersedes the Owner-only rule drawn on RoleChange/RulesM4; canvas to be updated.)
- **Channels in a client space:** Owners, Admins and the team members of that client space can create them; clients never can.
- **Links:** no shared invite link. "Copy link" = a channel's plain address (no access); "Copy join link" on a pending person = their single-use link (D-07).

### D-24 · M3 contract; DMs start unencrypted until M6 · Accepted · 2026-11-20
- **Contract (matrix/types.ts):** snapshot gains `dms`, `threads` (followed), `threadTimelines`, `activity`; `Message.thread` summary on roots; `Person.external`; `Draft.threadRootId`; store gains `openThread`, `loadOlderInThread`, `markThreadRead`, `markActivityRead`, `searchPeople`, `openDm`, `profile`. Fake store implements basics; drafts live in `app/drafts.ts` (local, per person, per device); profile card opens via `app/people/ProfileCardContext.tsx`.
- **Activity** is built in matrix/ from synced history (mentions of me + replies to my messages, incl. thread replies to my roots); the server has no `/notifications` (D-13). Read state = my read receipt (threaded where applicable).
- **DMs:** created with `is_direct`, recorded in `m.direct`, preset private, **without encryption until M6** — our client has no crypto yet, and an encrypted DM would be unreadable here. M6 turns encryption on for DMs (new and existing; irreversible by design). `openDm` reuses an existing DM with exactly the same people.
- **Profile:** display name, avatar, `m.tz` profile field for local time, email from `work.pasodrum.email` (else derived from the sign-in ID per D-07).
- **Folders:** matrix/ (M3-01); app/shell + app/pages + app/people (M3-02); app/thread + timeline row/composer edits (M3-03).

### D-23 · Navigation: rail = across everything, sidebar = the space you're in · Accepted · 2026-11-20
- **Decision (Batch C, approved by CEO):** rail holds Home, DMs and Activity (across the workspace and all client spaces) plus space tiles. Sidebar holds the current space: Threads, Drafts, channels, its DMs, client spaces. Mentions is a filter inside Activity (All · Mentions · Replies = what's aimed at you). Threads = conversations you follow. Drafts stay in the sidebar (per device, grey count). Only deliberate duplicate: DMs (sidebar for switching, rail page in full).
- **Behaviour:** opening a thread or Activity item marks it read; lists keep their order while open; DMs/Activity pages show a 340px list column in place of the sidebar; New message reuses an existing DM; client people get the amber corner badge; clients can DM only team people in their client space.
- **Profile card:** name, local time (from the person's time zone on their profile), work email, Message button; never the Matrix ID.

### D-22 · M2 contract: rich messages, uploads, actions · Accepted · 2026-11-20
- **Contract (matrix/types.ts):** `Message` gains optional `kind`, `html`, `media`, `replyTo`, `reactions`, `mentionsMe`, `system`; snapshot gains `typing` and `uploads`; store gains `send(Draft)`, `edit`, `remove`, `react`/`unreact`, `attach`/`retryUpload`/`removeUpload`, `setTyping`, `members`, `mediaUrl`, `messageLink`. The fake store implements them for UI work.
- **HTML:** received `formatted_body` is sanitized in matrix/ to an allow-list (b, strong, i, em, s, del, code, pre, a[href http/https/mailto], ul, ol, li, blockquote, p, br, h1-h6 → rendered as bold text, span[data-mx-color] dropped, mx-reply stripped) and rendered in app/ by parsing to React elements — never `dangerouslySetInnerHTML`. Sent messages always carry `body` + `formatted_body` (D-05).
- **Media:** authenticated media is fetched in matrix/ and handed out as cached object URLs (`mediaUrl`). Upload limit 50 MB (Batch B).
- **Composer:** TipTap (D-02) with mention chips → `m.mentions.user_ids` + standard pills in `formatted_body`; emoji search uses emojibase data (EN + JA annotations).
- **Folders:** matrix/ (M2-01), app/timeline/ rows + actions + viewer (M2-02), app/composer/ composer + editor + uploads (M2-03).

### D-21 · The canvas is the visual source of truth; push to main = production · Accepted · 2026-11-20
- **Canvas (CEO):** "Canvas should be the source of truth." Every visual decision (spacing, type, colour, components, states, motion) lives on the design canvas first; the app matches it. A visual change starts as a canvas change the CEO approves, then the code follows. `design/canvas/` in the repo mirrors the canvas and is re-copied after every canvas publish. When the app and canvas differ, the canvas wins; if the canvas is wrong or missing something, fix the canvas (small design task), not just the code. Motion (D-20) is specified in Foundations → Motion.
- **Deploys (CEO):** Coolify deploys `main` automatically. Every push to `main` is a production release: run `pnpm check` (and the browser check for UI work) before pushing; don't push half-finished work.

### D-20 · Motion: quick, quiet, everywhere · Accepted · 2026-11-20
- **Context:** CEO after first use of the live M1: "it feels kinda basic still… micro animation polish and spacing between the items."
- **Decision:** one motion system in `ui/tokens.css`, used by every component. Tokens: `--ease-out: cubic-bezier(0.2, 0.8, 0.2, 1)`, `--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1)`; `--dur-1: 120ms` (hover, press, colour), `--dur-2: 180ms` (menus, popovers, message appear), `--dur-3: 240ms` (drawer, banners, panels).
- **Where:** hover/active colour on every interactive row and button; press feedback (scale 0.97) on buttons and icon buttons; menus and dialogs scale 0.96→1 + fade from their origin; sidebar active state and rail tile active indicator animate; unread/mention badges pop when they grow; messages fade + rise 4px when they arrive (own sends from the composer); sending → sent eases opacity, failed eases to the danger colour; connection banners slide; drawer slides with a fading scrim; skeletons shimmer; composer focus ring and send button enable state transition; channel switch fades the timeline in.
- **Never:** motion that delays reading or input, bounces, parallax, anything over 240ms, animating layout on every keystroke.
- **Accessibility:** `prefers-reduced-motion: reduce` turns transforms off and keeps short opacity fades only.

### D-16 · Smaller decisions taken without escalation · Accepted · 2026-11-20
- Newcomers see earlier history in channels they're added to (non-encrypted channels).
- Any member can add guests/clients where they may add people; only Owner/Admin add Members and create client spaces.
- Drafts are local per device. Notifications only while the app is open in v1.
- Link-card data is embedded at send time.
- "Save for later" and the voice-clip button removed from the design; voice clips return later as their own feature.

---

## Learnings

Format: **Date · short title** → what was discovered, why it matters, what changes as a result.

**2026-11-20 · Continuwuity setup facts (M0-02)**
- Image `forgejo.ellis.link/continuwuation/continuwuity:latest`, binary `/sbin/conduwuit`, config via `CONTINUWUITY_CONFIG` TOML, env prefix `CONTINUWUITY_`.
- `/versions` advertises `org.matrix.simplified_msc3575: true` (Simplified Sliding Sync for Element X) with no config. Spec versions up to v1.18.
- Login flows: password + token. Configuring OIDC **disables password login** per Continuwuity docs, which backs [[D-12]] (password in v1).
- Continuwuity sends its own CORS headers (incl. preflight). Adding CORS in Caddy too produced a duplicate `Access-Control-Allow-Origin`, which browsers reject. Caddy only proxies.
- A fresh server prints a one-time registration token; the first account must use it and becomes admin. Our configured token works only after that. Seed and invite service must handle this.
- Open registration needs a compile-time feature; token registration is the only path in the stock image, which suits [[D-07]].
- **M0-03 probe:** a client calling `/messages` on an internal channel gets `200` with zero events (not 403); state and members return 403. No leak, but our client must not treat 200 as "allowed".
- Server search tokenises on words: "Thurs" doesn't find "Thursday", and Japanese (no spaces) is never found. Message search will be a local substring scan; ⌘K stays fast for channels/people.
- Server emails (email verification, password reset) show the Matrix ID and "Continuwuity" branding. Client-facing mail (invites, password reset) goes through the invite service with our own EN/JP templates.
- The invite service can claim and revoke accounts with the standard API alone: it holds the temporary password, so claim = `/account/password`, revoke = `/account/deactivate`. No admin-room scripting needed for that.
- Custom profile fields work on the v3 endpoint (`work.pasodrum.email`), so we can store the real email on the profile.
- Continuwuity appends an emoji to every new account's display name by default (`new_user_displayname_suffix`); set to empty in dev and production so clients get their plain name.
- **M3-01:** Continuwuity accepts threaded read receipts but drops `thread_id`, so a room has one read position. Marking a channel read also marks its threads read up to that point; a thread read that would hide unread channel messages is kept on this device only. Revisit if the server adds threaded receipts.
- **M3-01:** the server's user directory returns almost nobody, so `searchPeople` combines space and DM member lists with directory hits. Visibility still follows space membership (clients only share rooms with their client space's team).
- Admin actions (issue tokens, deactivate users, reset passwords) are admin-room commands (`!admin users deactivate`, `!admin token issue`); no HTTP admin API documented. The invite service will drive these through the admin room.

**2026-11-20 · Invite service facts (M4-01)**
- New rooms on Continuwuity are room version 12: the creator isn't in `power_levels.users` and outranks everyone. Permission checks (service and app) must treat `m.room.create` sender + `additional_creators` as top rank.
- A deactivated Matrix ID can never be registered again, so revoke does not deactivate (D-26 amendment): it kills the code and the unclaimed account stays dormant with its sealed temporary password. Inviting that email again issues a fresh code for the same account (201) and supersedes older codes; 409 `exists` only for claimed accounts or ones the service didn't create. Expired invites are never deactivated either.
- The service reads space name, inviter and team with the caller's token at create time and stores them, since it holds no power or membership anywhere (D-07). The join page shows that snapshot.
- Production Caddy trusts `X-Forwarded-For` from private ranges (Coolify's proxy), so per-IP rate limits see the real client.

**2026-11-20 · Composer behaviour (M2-03)**
- Enter always sends, in lists and code blocks too. Shift+Enter adds a line, list item or code line. Every Enter goes through `isImeEnter`. ProseMirror also ignores keys mid-composition.
- Send while an upload is in progress waits for it and then sends. A failed or too-large upload blocks Send until it is retried or removed.
- TipTap: with `useEditor(..., [])` the options are re-applied on every render, so handlers in `editorProps` always see current state; no refs needed. Autolink makes TipTap's Link inclusive, so we extend it with `inclusive: false`.
- emojibase ships emoji newer than macOS/Windows can draw. Skip versions whose sample glyph renders as the missing-glyph box (checked once on a canvas).

**2026-11-21 · Element X deep link (M5-03)**
- `https://mobile.element.io/element/?account_provider=<server name>` opens Element X with the server already chosen, or shows its install page (Element X ≥ 25.05.2 iOS / 25.06.0 Android). `account_provider` is the server name, not a URL. The choice lasts only while the app runs. `login_hint` is for MAS/OIDC sign-in, so we don't send it (Continuwuity uses password login). Built in `app/another/elementX.ts`.
- "Phone" means `(max-width: 639.98px) and (pointer: coarse)`. Width alone would also catch narrow desktop windows and zoomed-in pages, and those people would lose the app and the sign-in page (review of M5-03, D-28 amended).
- **Continuwuity (M5, 2026-11-21):** room v12 IDs hash the create event — two identical `createRoom` calls in the same millisecond merge into one room, so create rooms sequentially. New rooms reach sync piecemeal (first only `m.room.create`), so wait for the state you need. A room forgotten during an in-flight sync comes back as joined. Inviting a nonexistent local user returns 200; kicking a non-member 403; `/messages` on an invisible room 200 with an empty chunk. A failed `createRoom` (e.g. 413) can leave a half-made room without returning its ID. Rename updates member state in every room.
- **Continuwuity 26.9.4 to-device race (M6, 2026-11-21):** ~3% of to-device messages are lost when two arrive for the same device at the same moment (58/60 concurrent, 240/240 sequential). Effects: an emoji confirmation can stall (2-min timeout + Try again recover) and another person's room key can be lost now and then ("Not available on this device"). We serialize our own outgoing to-device sends; the cross-sender race needs an upstream fix. Also confirmed: signed cross-signing sub-keys OK, key backup round trip OK, SAS between our devices OK; first cross-signing upload needs no password, replacing it does.

**2026-11-21 · Encryption on Continuwuity 26.9.4 (M6-01)**
- **Probe items closed:** cross-signing sub-keys come back signed by the master key and the device by the self-signing key; key backup round trip works (new device + recovery key → `restoreKeyBackup` → old message decrypts). SAS emoji confirmation between two of our devices works, and after it the new device receives the cross-signing and backup keys by itself.
- **Password (UIA):** the first cross-signing upload needs none; replacing keys needs `m.login.password`, and Continuwuity accepts it without a UIA session. A wrong password is `401 M_FORBIDDEN`. Re-uploading identical keys needs no password, so `resetEncryption` checks the password first with `POST /delete_devices {devices: []}` (password-guarded, deletes nothing): the SDK's own reset deletes the backup before it asks.
- **To-device race** (entry above): our own sends go out one at a time via `serialToDeviceFetch` in `store.ts`; the cross-sender race still needs the server fix.
- **New rooms:** for a few ms after `createRoom` returns, `GET state/m.room.encryption` 404s even when the room was created encrypted (its initial state is still being written). Turning encryption on for existing rooms therefore skips rooms younger than 15 s.
- **SDK traps:** a failed decryption reads as `m.room.message`/`m.bad.encrypted`, not `m.room.encrypted`. `getUserDeviceInfo(me, true)` downloads every time (my own user never counts as tracked) and each download fires `DevicesUpdated`, so calling it from a refresh loops. A key query in flight while new identity keys go up returns the old identity and the crypto store drops the new private keys: we create the recovery key/secret storage first (the SDK then exports new keys there before publishing) and re-import from it if they vanish. After signing my own device, Continuwuity doesn't flag my keys as changed, so we `markAllTrackedUsersAsDirty` to re-query.
- **Recovery keys are base58: case matters.** Spaces, line breaks and dashes are ignored; lower-casing a key makes it wrong. The `useRecoveryKey` doc comment in `types.ts` ("case doesn't matter") is wrong for real keys (the fake store ignores case).
- **Outside mark glyph (CEO, 2026-11-21):** the amber mark shows a building ("from another company") instead of ↗, which read as "opens a link". Canvas boards to be updated to match.
- **Sidebar (CEO, 2026-11-21):** the workspace sidebar no longer lists "Client spaces" under Direct messages — it duplicated the rail. New client space stays on the rail + and in the workspace menu.
- **E2 contract (2026-11-21):** `Channel.archived`, `Channel.manageable` (Owner/Admin/creator, never #general), `JoinableChannel.archived`, `Message.system.renamed` / `.archived`; store `renameChannel`, `setChannelArchived` (D-28 levels per channel). Archived channels stay in the snapshot (openable from Browse); the sidebar leaves them out.
- **E2 build (2026-11-21):** a channel is archived when it carries `work.pasodrum.channel {archived: true}` (not inferred from levels, which an archived client space also changes); the same flag rides as `work.pasodrum.archived` on its `m.space.child` so Browse knows without joining. `manageable` = may send `m.room.name` and power levels by our own power math (room v12 creators outrank levels), never a channel named `general`. Unarchiving a client space leaves channels archived on their own alone.
