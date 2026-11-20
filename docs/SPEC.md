# Pasodrum work — Product & Technical Spec

> Status: **approved plan, M0 in progress** · Last updated 2026-11-20 · Owner: CEO
> Companion docs: [DECISIONS.md](./DECISIONS.md) · [../AGENTS.md](../AGENTS.md) · [../design/INVENTORY.md](../design/INVENTORY.md)

---

## 1. Vision & north star

Pasodrum work is a Slack-polished workspace for our team and our clients, running on our own Matrix server (Continuwuity).

The team chats in one company workspace. Each client gets its own client space holding everything client-related. A client opens a link, sets a name and password, and is in their channel: no download, no server address, no "accept invite". The bar: clients and the team feel "ooooh, this is neat", never "a lower-quality open-source alternative".

Later, Docs (Notion-like multiplayer) and Boards (kanban, so clients see progress) arrive as removable feature modules.

### Inviolable design rules
1. No Matrix concepts in the UI (rooms, homeservers, IDs, invites to accept).
2. Cut taglines, helper text and secondary labels. If a screen needs them to make sense, fix the layout instead. Elevate UX, DX and AX together, without breaking things.
3. Every screen is designed and approved before it is built, in EN and JP, light and dark.
4. Nothing we send breaks standard clients (Element X, Element Web).
5. Every feature is removable without breaking the app or old data.

### Product principles
- Familiar beats novel: Slack/Element layout, our own polish.
- The server enforces who sees what; the UI only reflects it.
- Standard Matrix first; custom data only adds to standard messages.
- Japanese is a first-class language, not a translation pass.
- Build for the current milestone; no speculative abstractions.

---

## 2. Personas & roles

| Role | Matrix fact | Surface | Primary job |
|---|---|---|---|
| Owner | Power level 100 in the workspace | web, desktop | Runs the workspace, creates client spaces |
| Admin | Power level 50 in the workspace | web, desktop | Adds members, creates client spaces |
| Member | Joined to the workspace | web, desktop | Daily internal + client chat |
| Guest | In neither workspace nor any client space; invited to chosen channels | web | Joins specific channels |
| Client | Joined to one client space only | web (phone join page), desktop | Talks with us about their project |
| Element X user | Any of the above, using Element X | Element X | Chat only; rich content shows as text + "Open in Pasodrum work" |

---

## 3. Scope

### In scope (v1)
Sign-in (password), workspace shell, channels (public/private), DMs and group DMs, threads, mentions, drafts, reactions, edit/delete, files and images, Pins and Files tabs, link cards, Add people, invite service + join page, client spaces, guests, encryption for DMs and private channels, ⌘K and search, EN/JP, light/dark, desktop shell (M9).

### Explicitly deferred
- **Docs** (Yjs, likely one small sync service) and **Boards** (state events in a board room) — visible as "Soon" in rail and tabs.
- Voice clips (needs Ogg/Opus; Safari records MP4).
- Phone layout of the app (join page works on phones; app is desktop-width).
- Web push / notifications while the app is closed.
- SSO (button appears only if the server advertises it).

### Out of scope
- Calls and huddles (need a separate LiveKit server).
- Federation.
- Self-serve workspaces (one company workspace per server).
- "Save for later", reactions in the activity feed, "Also send to channel".

---

## 4. Core flows

### Team member signs in
Sign-in → work email → password → workspace opens on last channel. Sign-in ID derives from email ([[D-07]]), so no lookup.

### New client space
1. Owner/Admin chooses **+ → New client space**, enters name, colour, first channels, team members, client emails.
2. The app creates the client space, its channels (restricted to the client space) and, via the invite service, an account per new email. The app (as the staff member) sends ordinary Matrix invites. People show as added immediately.
3. The client opens `https://pasodrum.work/join/<code>` (phone or desktop), sees the client space name and their email, enters name + password.
4. The app signs in, auto-accepts pending invites from their client space, opens the channel.
5. Optional: download the desktop app, or "Another app" (server + username for Element X).

### Add people to a channel
Name or email → role (Member / Guest / Client) → Add. External emails can't be Member. Existing accounts get a plain invite which our app auto-accepts when it comes from inside their workspace or client space.

---

## 5. Domain model

```
Workspace "Pasodrum" (space, invite-only)          Owner / Admin / Member are joined to it
 ├─ # public channel    join: restricted to workspace members · history: shared
 ├─ 🔒 private channel  join: invite · encrypted
 └─ Client space "Nordlys" (space, invite-only, work.pasodrum.space {kind:"client"})
      └─ # channel      join: restricted to client-space members · not encrypted
DMs: outside spaces, encrypted.   Guest: in neither space, invited to individual channels.
```

- **Roles:** power levels express only Owner (100), Admin (50) and everyone else. Member/Guest/Client = which space you're in. In client-space rooms `invite` needs level 50.
- **Custom data:** namespace `work.pasodrum.<feature>.*`. Settings in account data `work.pasodrum.settings` (language, theme).
- **Channel tabs:** state event `work.pasodrum.tab`, state key = tab id, content `{ type, title, order, ref }`; empty content = deleted. Messages/Pins/Files are built-in, not stored.
- **Interop rules:** see [[D-05]].

---

## 6. Architecture overview

```
 Browser tab today · Electron/Tauri window later
┌───────────────────────────────────────────────────────────────┐
│ features/*   pins · files · link-cards · docs · boards         │ removable; listed once in features/index.ts
│      │ defineFeature() → registry                              │
│ app/         shell · timeline · composer · thread · people ·   │ product vocabulary only
│              auth · settings · registry                        │
│      │                              │                          │
│ matrix/  the ONLY importer of       │ ui/  tokens.css +        │
│  matrix-js-sdk: model · sync ·      │  primitives (no Matrix,  │
│  send · spaces · crypto · media     │  no copy)                │
│      │                                                         │
│ platform/  Platform interface → web.ts (desktop.ts later)      │
└──────┬───────────────────────────────────────┬────────────────┘
       │ Matrix client-server API              │ HTTPS
   Continuwuity ◄── standard API only ── services/invite (Node + SQLite + SMTP)
       ▲
   Element X / Element Web
```

```
AGENTS.md  CLAUDE.md  docs/  tasks/  design/INVENTORY.md
dev/                 docker-compose (continuwuity, mailpit, caddy) · seed.ts · probe.ts
apps/web/src/        platform/ matrix/ ui/ app/ features/ locales/{en,ja}.json
services/invite/
```

### Platform interface
```ts
export interface Platform {
  notify(n: { title: string; body: string; route: string }): void;
  setBadge(unread: number): void;
  authRedirectUri(): string;
  onOpenRoute(cb: (route: string) => void): void;
  openExternal(url: string): void;
  persistStorage(): Promise<boolean>;
}
```

### Feature contract
```ts
// features/boards/index.ts
export default defineFeature({
  id: 'boards',               // also i18n namespace and event namespace work.pasodrum.boards.*
  rail:         [{ id, icon, labelKey, route, soon }],
  routes:       [{ path: 'boards/*', element }],
  channelTabs:  [{ type: 'boards.board', icon, render: ({ channel, tab }) => … }],
  messageParts: [{ key: 'work.pasodrum.boards.card', render: ({ message, data }) => … }],
});
// features/index.ts — the only registration point
export const features = [pins, files, linkCards, docs, boards];
```

| Removed feature left behind… | People see | Mechanism |
|---|---|---|
| A tab on a channel | Tab gone | Tab bar renders stored tabs ∩ registered tab types |
| Messages with its card/task data | The plain message | `send()` requires a full text body; parts only add |
| Its own rooms | Nothing | Sidebar lists ordinary rooms + room types a registered feature claims |
| Links into it | Designed "not available" page | Catch-all route |
| Rail item, strings, routes | Gone | Only existed via registry + folder |

Kept true by: CI with `features = []`; a fixture room with every feature's data rendering on an empty registry; a removal drill in M7.

### Key technical choices
- Classic `/sync` with lazy-loaded members in our client; Simplified Sliding Sync on the server only for Element X ([[D-03]]).
- Authenticated media via fetch → blob URL in `matrix/media.ts`.
- No Redux (SDK client is the store, read through hooks), no Tailwind, no Storybook, no service worker.
- Dev-only `/dev/gallery` renders primitives and message variants from recorded fixtures (screenshots for review).

---

## 7. Non-functional requirements

- **Security & tenancy:** client isolation enforced by the server; automated client's-eye API suite proves a client account reaches zero internal rooms or people. Registration token never leaves the invite service. Encryption per [[D-11]].
- **Browsers:** Chromium and WebKit parity (Safari is the stand-in for a future Tauri shell on macOS).
- **Languages:** EN and JP from day one; IME-safe Enter everywhere; substring search; `Intl.*` for dates/lists/plurals/sorting.
- **Fonts:** Inter + Space Grotesk self-hosted, then system Japanese fonts (Hiragino Sans, Yu Gothic UI, Meiryo, Noto Sans JP). No JP webfont download in v1.
- **Performance budget:** `pnpm check` < ~1 min; first sync of a team-sized account feels instant (< 2 s on staging).
- **Accessibility:** keyboard-complete, visible focus, WCAG AA contrast in both themes.
- **Cost:** one small server box (Continuwuity + Caddy + invite service).

---

## 8. Milestones

Sizes for one build stream: S ≈ 1 week, M ≈ 2, L ≈ 3. Every exit also needs: `pnpm check` green; screens match approved designs EN/JP × light/dark; Chromium + WebKit e2e green; manual Safari + Japanese-IME pass; Element X smoke test.

| # | Scope | Exit criteria | Designs needed |
|---|---|---|---|
| **M0** Server spike + repo (S) | Docker dev stack, `probe.ts`, staging with HTTPS, repo OS | Probe table pass/fail with fallbacks; Continuwuity go/no-go; Element X chats on staging; SDK crypto starts in Chrome + Safari | — |
| **M1** Walking skeleton (M) | Sign in, shell, channel list, read/send text, unread, themes, i18n, platform/web, registry (`rail`, `channelTabs`) | Two people chat live in Chrome + Safari in EN and JP; Element X sees the same; `features=[]` CI test | Batch A |
| **M2** Full timeline (L) | Formatting composer, mentions, reactions, edit/delete, files/images, grouping, join summary, typing, in-tab notifications, renderers for everything standard clients send | Room exercised from Element X renders with no blank rows; Safari scroll anchoring holds | Batch B |
| **M3** Threads, Mentions, Drafts, DMs (M) | Thread panel + list, mentions, local drafts, DMs, group DMs | **Team switches to it for daily internal chat** | Batch C |
| **M4** Channels, people, invites (M–L) | Create/browse channel, details, roles, Add people, settings/profile/language, invite service, join page, invite email | New teammate goes email → first message in < 1 min, either language | Batch D |
| **M5** Client spaces + guests (M) | New client space, client/guest views, "Another app" | **First friendly client onboarded**; client's-eye suite green | Batch E |
| **M6** Encryption (L) | Confirm device, recovery key, key backup, undecryptable state | Encrypted DMs work with Element X; new browser restores history | Batch F |
| **M7** Tabs & cards (M) | Pins, Files, link cards, add/remove tab, Docs/Boards "Soon", `routes` + `messageParts` | Removal drill passes | Batch G |
| **M8** Find & finish (M) | ⌘K, search, accessibility, performance, error-state audit | Launch checklist signed | Batch H |
| **M9** Desktop shell (S + M) | One-day spike each of Tauri and Electron against `Platform`, build the winner | Installer, notifications, badge, deep links, sign-in redirect | Batch H |

### M0 probe table

| Check | Fallback |
|---|---|
| **Must-have:** Simplified Sliding Sync works with Element X | None — escalate |
| **Must-have:** restricted joins + space listing isolate a client account; user directory doesn't expose staff | Invite-only rooms; server config; escalate if staff still exposed |
| **Must-have:** thread relations and threads list | Escalate |
| Thread summaries, per-thread unread | Compute from loaded history; unread per channel only |
| Token registration + deactivation by the service | Service drives the server's admin commands |
| Password + SSO offered together | Password only (D-12) |
| `/notifications` | Mentions list built locally |
| Presence | Hide presence dots |
| URL previews | Enable in config; otherwise plain links |
| Email password reset | Reset link issued by invite service |
| CORS + `.well-known` | Caddy serves them |
| Message search incl. Japanese substring | ⌘K finds channels/people; local substring scan for messages |
| `contains_url` filter | Local scan for Files tab |
| Key backup, cross-signing, history keys for new joiners | Encrypted channels show no pre-join history |
| Custom profile fields (email) | Derive email from sign-in ID |
| Custom room type hidden in Element X; extra keys + custom state intact | Docs/Boards data lives outside rooms |
| OpenID token identity check for invite service | `whoami` with caller's token |
| Japanese display names, channel names, filenames round-trip | Fix/escape on our side |

---

## 9. Open questions

- **Continuwuity go/no-go** — answered at end of M0 (D-13).
- **Final product name/domain** — assumed `pasodrum.work`; confirm before M3 (server name can never change). Until then the dogfood server is disposable.
- **"Copy invite link"** semantics (single-use link for one external person vs plain channel link) — confirm in design Batch D.
- **Home / Activity vs sidebar Threads / Mentions overlap** — resolve in design Batch C.
