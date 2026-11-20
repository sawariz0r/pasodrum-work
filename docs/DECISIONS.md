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
7. Every milestone ends with an Element X + Element Web smoke test on staging.

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

### D-13 · Server capability findings and Continuwuity go/no-go · Proposed · 2026-11-20
- To be written at the end of M0 from the probe table (SPEC §8). If a must-have row fails, we switch homeserver before M1.
- **Interim (M0-03, local Continuwuity 26.9.4):** all four API must-haves pass (sliding sync, client isolation, user directory, threads); 17/20 rows pass. Fails with fallbacks: `/notifications` (404 → mentions list built locally), message search (word-based only; no partial words, no Japanese → local substring scan), OpenID userinfo (blocked with federation off → invite service checks callers with `whoami`). Details in [probe-results.md](./probe-results.md). Element X rows pending M0-05.

### D-14 · Server name `pasodrum.work` (provisional) · Accepted · 2026-11-20
- **Decision:** Assume `pasodrum.work` as server name and `work.pasodrum.*` as event namespace. CTO confirms before real accounts exist (before M3). Dev/staging servers are disposable until then.

### D-15 · Phones · Accepted · 2026-11-20
- **Decision:** The join page works on phones; the app is desktop-width in v1. Phone users are pointed to their computer or Element X. Full phone layout deferred.

### D-17 · Hosting on Coolify with Docker Compose · Accepted · 2026-11-20
- **Decision:** Staging (and later production) runs on the CEO's Coolify as a Docker Compose resource from `deploy/docker-compose.yml`, repo `sawariz0r/pasodrum-work`. Coolify's proxy terminates TLS; Continuwuity is configured by env vars only, so nothing else needs mounting. The registration token is generated by Coolify (`SERVICE_PASSWORD_64_REGISTRATION`); `SERVER_NAME` is set per environment.
- **Consequences:** no Caddy or Mailpit on staging. Staging has no mail until the invite service lands (M4). The Continuwuity image has no shell, so the compose has no in-container healthcheck.

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
- Admin actions (issue tokens, deactivate users, reset passwords) are admin-room commands (`!admin users deactivate`, `!admin token issue`); no HTTP admin API documented. The invite service will drive these through the admin room.
