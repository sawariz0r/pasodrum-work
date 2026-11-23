# Assistant (SIDE-14): build spec

> Status: **approved by the CEO, 2026-11-23** ("Approve as recommended": the spec and all five calls) · logged as D-54 · nothing is built · build tasks: `tasks/backlog/AST-*.md`
> Task: [tasks/backlog/SIDE-14-assistant.md](../../tasks/backlog/SIDE-14-assistant.md) · Concept: [design/discovery/assistant.md](../../design/discovery/assistant.md) · Rules board: `design/discovery/canvas/AssistantRules.dc.html` · Boards: [Discovery canvas, page SIDE-14](https://claude.ai/artifact/VYzNV8p7LujHsp4HqQ6BvQ#page-assistant)
> Written from six investigations of the code, the boards and the provider's docs. One independent Fable review of §3 and what it leans on, with a second pass on the consent check of D-53; its thirteen must-fix findings are folded in.

**Settled, not reopened here:** the reading rule (D-50, D-51) · clients accept AI use through the app's terms (D-52) · the space of a client in Japan is read only after that client consented (D-53) · team only · no write access · answers drawn by the app from its own data · Quick or Thorough, never a model name · one conversation a day, in memory · two spending limits with usage by day and by person · the warm grey panel.

Words used below:

| Word | Meaning |
|---|---|
| Ask | One question and its answer. |
| Source | One thing the Assistant read: a message, a thread, an issue, a page. |
| Place | Where sources live: a channel, a DM, a project, a page. |
| Ref | A typed id the app uses for a source or place (for example a room id plus an event id). |
| Handle | A short name (`s1`, `s2`, …) the server gives a ref for one ask. The model only ever sees handles. |
| Part | One drawn piece of an answer: a row, a card, a table. |
| Encrypted conversation | A conversation with end-to-end encryption. The UI word is "sealed". |

---

## 0. Read this first

### Calls for the CEO

**Answered on 2026-11-23: all five approved as recommended.** The "Recommended" column is the answer.

| # | Call | Recommended (approved) |
|---|---|---|
| 1 | Should the approved Sealed boards (SIDE-10) say that the Assistant can read a sealed conversation after a yes? | Yes, change three sentences before SIDE-10 is built (§3.5 lists them). "Us included" would be untrue otherwise. The new words should also be true about the provider: we keep nothing, the provider may keep the text up to 30 days. |
| 2 | Starting limits: $3 a person a day, $100 a month, and a hard limit of $150 a month at the provider? | Yes. Review after two weeks of real usage. The provider's limit needs the Assistant's own project and key there, with "Enforce a hard limit" switched on. |
| 3 | Build sealed DMs (SIDE-10) before the Assistant's slice for encrypted conversations? | Yes. Today every DM and every private workspace channel is encrypted, so until that slice the Assistant reads no DMs. The other order puts the word "sealed" on every DM before sealed DMs exist. |
| 4 | Draw one small board before the UI work: chips and suggested asks for today's screens, the issue proposal card, what the panel says about a client space it may not read, and the missing Japanese and dark variants? | Yes, about 2 hours of design. The approved boards show these only with Time data, mostly in English and light (§10 lists the gaps). |
| 5 | Until Time has the client profile, nothing says a client is in Japan. How is a client space marked? | Safe by default: every client space stays unread until an Owner or Admin marks it "covered by the terms" or "ask first", with one command per client. A forgotten mark then means "not read", never "read without consent". The other way: only Japanese clients are marked, and a forgotten mark means their space is read. Either way a client marked "ask first" stays unread until Time ships the consent card. |

**Readings to correct if wrong** (the lead's, not calls; not corrected at approval):
- "Read it" inside a sealed conversation hands over its 40 most recent messages; D-51's text speaks of "the matching messages" (§3.5).
- An answer made from sealed text is not carried into follow-up asks; each ask needs its own yes (§3.5).
- A client's yes counts while that person is still in the client space, and any client's no closes the space (§3.2).

**Settled on 2026-11-23 (D-53):** the consent card keeps its line "deleted by the AI service within 30 days". The provider only says "up to 30 days, longer where the law requires", so the card is not sent to any client until Zero Data Retention is in place on the Assistant's provider project (§3.4).

**Settled on 2026-11-23, no longer a call (D-52):** clients are assumed to accept AI use through the app's terms and conditions, which are written later (SIDE-15). The terms do not hold back any slice. For SIDE-15, the line should say: which provider, that the text is not used for training, and that the provider may keep it up to 30 days for abuse checks.

**Settled on 2026-11-23 (D-53):** for a client in Japan, AI reads nothing in their space until they consent on the card. A no and no answer count the same. The server enforces it as a check in the reader (§3.2, "Client spaces"). The card itself belongs to Time (SIDE-12) and is not built, which is why call 5 exists.

### Slices

Sizes are at this repo's pace, where Docs and Boards took one day. S, M and L are relative.

| # | Slice | Ships | Needs | Size |
|---|---|---|---|---|
| 0 | Spikes | Answers to §10's unknowns. No product code. | A provider key in `dev/.env` | half a day |
| 1 | Core | The panel on every team screen. Asks about channels and threads in the workspace and in client spaces that are open to AI. Limits enforced from configuration. | Call 4's board for chips and asks, call 5 | L, about 2 days |
| 2 | Limits and usage | Workspace settings → Assistant: the two limits, usage by day and by person. | Slice 1 | S, half a day |
| 3 | Docs and Boards | Pages and issues as context and as sources. Issue, page and person rows. A New issue proposal. A summary to copy. | Slice 1, call 4's board | M, about 1 day |
| 4 | Encrypted conversations | "Not read: 2 sealed messages with … · Read them", the browser hand-over, the shield on rows. | Slice 1, SIDE-10 (call 3), call 1 | M, about 1 day |
| 5 | Time | Scopes, months and hours as context and sources. Estimates. Four proposals. Tables and bar charts. The Internal line in AI usage. | SIDE-12 approved and built | L, about 2 days |
| 6 | Handover | Handover as context. Add to handover. | SIDE-13 approved and built | S, about 2 hours |

Slices 1 to 4 need nothing from Time or Handover. Most approved boards are drawn with Time data, so they are fully matched only by slice 5.

### What the code said

The discovery notes were written without building. These are the places where the code does not support what they assume, and the way through that this spec takes.

| The notes assume | The code | Way through |
|---|---|---|
| The server reads DMs and conversations with an External (D-50) | Every DM (clients and Externals included) and every private workspace channel is encrypted today (`apps/web/src/matrix/store.ts:1208-1214`). The server sees ciphertext. | One rule: an encrypted conversation is read only through the ask-first flow (§3.5). Slices 1 to 3 do not read them at all. |
| "Team only, the same check as Translate" | Translate checks only that the caller is joined to the workspace (`services/invite/src/app.ts:383-386`). An account invited as a client and later added to the workspace would pass. | A tighter gate (§3.1). |
| The server refuses what the person can't open | The homeserver returns history to someone who left, up to their leave, and answers 200 with nothing for a conversation never joined (`apps/web/src/matrix/m5.integration.ts:374-376`). | The server checks "joined now" itself for every place, every ask (§3.2). |
| Deleted or edited text is gone | Deleting a message deletes only the original; an earlier edit of it stays on the server with the full text (`store.ts:2268-2271`). A deleted page or issue keeps its room and its comments (`matrix/docsBoardsCore.ts:477-494`, `:641-649`). | Reading rules that follow what the app shows, not what the server still holds (§3.2). |
| The server reads pages | A page body is collaborative-editing data, not text (`matrix/docsProvider.ts:133-177`), and a page the person never opened is not joined, so their token cannot read it. | The service gains one dependency (`yjs`), run in a worker with size caps. Pages are readable once the person has opened them (§3.2). |
| The browser finds across everything | Local search covers channels and DMs only, and returns full message text (`matrix/types.ts:605`). Nothing searches pages or issues. | A wrapper in `matrix/` turns hits into refs. Issues and page titles are found on the server, from data it reads with the caller's token (§5.2). |
| It streams its answer from `/api/assistant` beside Translate | The service has no streamed reply. Production Caddy compresses `/api/*` and routes only three named paths (`deploy/Caddyfile:11`, `:22`). | One WebSocket per ask, the way the live relay works (D-39). Add the path to both Caddyfiles (§2.2). |
| It opens where the thread panel opens and stays open | There is no right-panel slot. The thread is mounted two ways and remounts on every route (`apps/web/src/app/shell/Shell.tsx:237-292`). | A right-panel host in `app/` (§2.4). |
| A spark at the right of every page header, a last row in ⌘K, a third row in Workspace settings | About ten hand-built headers, a closed list of ⌘K rows, a hard-coded pair of settings tabs. No extension point for any of them. | Four new registry slots and one shared header piece (§2.4). |
| A proposal opens the normal dialog, filled | `NewIssueDialog` takes no starting values and exists only inside the Boards screen (`apps/web/src/features/boards/Dialogs.tsx:17-35`). | The feature hands over a dialog component that takes starting values (§4.5). |
| The model is a fake endpoint in tests | The provider URL is hard-coded and no fake exists (`services/invite/src/translate.ts:44`). | The provider is an injected function; tests pass a fake that records every request (§9). |
| Reserve and refund "as Translate" | Translate counts calls in memory, never reads usage and loses its counters on restart (`services/invite/src/app.ts:48-49`). | Money is counted from the provider's usage report and kept in SQLite from the moment an ask opens (§6). |
| Limits reset on a UTC day | The approved copy says "It starts again at 00:00." | The day is the asking person's own local day; the month follows the server's clock (§6.3). |

---

## 1. Slices

Each slice is shippable on its own and removable (D-04). A slice lists what it adds; §2 to §8 define the pieces.

### Slice 0 · Spikes
The checks in §10. Output: each result written into §10, and the model pair for Quick and Thorough confirmed or changed.

### Slice 1 · Core
- **Service:** the `assistant` module in `services/invite` (§2.1): the team gate, the reader with its client-space check (D-53), the provider adapter, the ask loop over a WebSocket, the chat tools, answer checking, usage rows, limits from configuration, the status endpoint. Caddy and compose changes. The `pnpm assistant:cover` command that marks a client space.
- **Shell (stays when the feature is removed):** the right-panel host, the new registry slots, the header piece in every header, the ⌘K row slot, ⌘J, the screen-context helper with its call sites in channel, thread and Activity, a shared team check, a shared sign-out hook, `messagesByRef` in the store.
- **Feature folder `features/assistant`:** the panel, the chip, the ask box with the depth picker, the conversation with message rows, the "Looked in" line and its list, Look closer, the states (empty, working, nothing found, can't do it, stopped, failed, offline, both limits), the layouts at 1024 and 800, the dot on the spark, "Ask about this" on a message, memory.
- **Not in this slice:** encrypted conversations are never read, never counted and never mentioned. A DM screen gives no chip, and "Ask about this" is not shown in an encrypted conversation.
- **Boards matched:** AssistantFollow (the channel half), AssistantThread, AssistantLookup l1 to l3 and l5, AssistantCloser and AssistantDepth (the mechanics), AssistantStates except Sealed, AssistantPlaces p1, p2 and p6, AssistantTone. The 1024 and 800 layouts as drawn.
- **Tests:** 1, 2, 4, 6, 7, 8, 9, 10 and 11 of §9, and the server half of 3 (nothing from an encrypted conversation is ever sent). Fable review of the service before it ships.

### Slice 2 · Limits and usage
- The settings tab slot's first use, the settings and usage endpoints (§6.5), the screen as drawn on AssistantAdminUsage (+JP, Dark) and AssistantAdminStates.
- Until this ships the limits are the configured defaults.

### Slice 3 · Docs and Boards
- **Service:** the Boards reader and the Docs reader (with `yjs` in a worker), `find` over issue titles and descriptions and page titles, the issue proposal's checks.
- **Web:** context from a page, a project, an open issue, My issues and All issues. Boards brings its issue row and its New issue dialog with starting values; Docs brings its page row. The Assistant draws person rows, group headings, the text card with Copy and Shorter, the proposal card and its done row.
- **Boards matched:** AssistantParts (issue, page, person, heading, done row, plain line), AssistantTextCard x3.
- **Tests:** 5 of §9, and 2, 6 and 8 extended to issues and pages.

### Slice 4 · Encrypted conversations
- **Web:** the find wrapper counts matches in encrypted conversations and keeps their text inside `matrix/`. The ask-first row. "Read them" and "Read it". The shield on rows from an encrypted conversation. The chip on a sealed DM.
- **Service:** the checks on handed-over messages (§3.5). The rule for conversations outside any space (D-53) is already in the reader from slice 1.
- **Boards matched:** AssistantSealed (+JP), AssistantLookup l4, the Sealed state on AssistantStates.
- **Tests:** the rest of 3 and the last case of 11 of §9. Fable review of the hand-over before it ships.

### Slice 5 · Time (after SIDE-12 is built)
- Time brings: context for My week, All clients, a scope and a month; scope and month rows; the value sources behind fact rows; its four proposal dialogs (New scope, Change, hours, a month's note); its views (compare months, hours per week, runs out).
- The Assistant gains: fact rows with source chips, estimates as ranges with the past work they rest on, the month-note text card with Use, tables and bar charts (`ui/Table`, `ui/Bars`, the `assistantViews` slot), view states, "Changed since this answer".
- Time's own Draft and Review buttons belong to SIDE-12. They write their usage into the same table with their own `feature` value; whether they count against these limits is decided when SIDE-12 is specified.
- Time takes over the two pieces of client-space state of §3.2: its client profile writes the mark from the client's country, and its consent card writes the answer. For a client in Japan who has not consented there is no scope draft, and Time's own tools read nothing in that space (D-53).
- The consent card ships only once Zero Data Retention is in place on the Assistant's provider project. That needs the provider's approval, which the CEO asks for. Until then no client in Japan can be asked, so their spaces stay unread.
- **Boards matched:** AssistantScope, AssistantDraft, AssistantMonth, AssistantTable, AssistantChart, AssistantViewStates, AssistantTextCard x1 and x2, AssistantDesktopJPDark, the rest of AssistantParts, AssistantPlaces and AssistantStates.

### Slice 6 · Handover (after SIDE-13 is built)
- Handover brings its context and the Add to handover dialog. No board draws either yet.
- Handover's own AI line follows the same client-space check: a client in Japan who has not consented shows with facts only (D-53).

---

## 2. Architecture

### 2.1 Where the model call runs

**Recommended: a module inside `services/invite`, not a new service.** The service already has the caller check, the workspace check, SQLite, the WebSocket library and a route through the proxy. A second service would copy that and add a container, a volume and a proxy route to run (the same reasoning as D-39).

The cost of sharing a process: `services/invite` also holds the registration token, the system account and the clients' recovery keys (D-38), and its Matrix helper can send, invite, create rooms and change passwords (`matrix.ts:91-171`). So the module is fenced by what it is given, not by good intentions:

| Fence | Rule |
|---|---|
| Matrix | The module receives one function that can only send a `GET` to the homeserver with a token it is handed. Every read helper it needs lives inside `assistant/reader.ts` and is built on that function. It never receives the service's Matrix helper. "No write access" is then a property of the code, not of review. |
| Storage | Its own SQLite file, `assistant.db`, on the same volume. It never opens the service's main database, which holds open invite codes and the D-38 keys. |
| Records | Two functions answer the only questions it has for the invite records: `isClientAccount(userId)` and `isClientOf(userId, spaceId)` (invited to that space as a client, and never as anything else). |
| Secrets | Its configuration is passed in. Code in the folder never reads `process.env`. It never receives the system account, the registration token, the invite key, the recovery-key secret or the mailer. |
| Imports | Files in `assistant/**` import nothing from outside the folder except `ws`, `yjs` and Node's own modules. `fetch` appears only in `provider.ts` and `reader.ts`. A check in `pnpm check` enforces both. |
| Mounting | Two lines in `app.ts` (routes and the WebSocket upgrade), the way `confirm.ts` is mounted (`app.ts:420`). Its routes catch their own errors; the shared handler logs `err.message` (`app.ts:455`), which must never carry text. |

Inside the module, Matrix reads go through one **reader** object built once per ask from the caller's token. No other function in the module takes a token.

| File | Holds |
|---|---|
| `assistant/index.ts` | `createAssistant`: HTTP routes, the upgrade handler, shutdown |
| `assistant/gate.ts` | Team check, Owner or Admin check |
| `assistant/reader.ts` | The per-ask reader: the GET helpers, the joined-now and encryption checks, a place's kind and space, whether a client space is open to AI |
| `assistant/ask.ts` | One ask: handshake, the loop, caps, status events, stop |
| `assistant/provider.ts` | The adapter for the provider |
| `assistant/prompt.ts` | The instructions, in one place |
| `assistant/answer.ts` | The answer's shape and every check on it (§4) |
| `assistant/mask.ts` | What is removed from text and names before the model sees them (§3.4) |
| `assistant/sources/chat.ts`, `boards.ts`, `docs.ts` | Per source: tools for the model, how to run them, which parts and proposals they allow |
| `assistant/pageWorker.ts` | Page data to text, in a worker thread (§3.2) |
| `assistant/usage.ts` | The usage table, cost, limits, settings |
| `assistant/wire.ts` | Types and constants shared with the web app |

Every Matrix read made by the module has a 10 second timeout (today's helpers have none, `matrix.ts:22`).

### 2.2 Transport

| Path | What | Who |
|---|---|---|
| `WS /api/assistant/ask` | One connection per ask (§2.3) | Team |
| `GET /api/assistant/status?tz=` | Whether the person may ask, and whether Thorough is available | Team |
| `GET`, `PUT /api/assistant/settings` | The two limits | Owners, Admins |
| `GET /api/assistant/usage?month=&tz=` | Usage for the settings screen | Owners, Admins |

- A WebSocket because the loop needs the browser in the middle of an ask (to find), production Caddy compresses and delays streamed replies, and the live relay already proves the path through Caddy, Coolify's proxy and Vite (D-39).
- The token travels in the first message, never in the URL.
- Both Caddyfiles gain `/api/assistant /api/assistant/*` in the `@invite` matcher. Without it production answers with the app's `index.html`.
- **Before the gate:** upgrades to this path count against the per-IP limit (the relay's upgrades skip it today, `index.ts:47-49`). The first message must arrive within 10 seconds and be under 4 KiB. Nothing is read and nothing is set aside until the gate passes.
- After the gate a message may be up to 256 KiB (the relay's is 16 KiB), so a hand-over of encrypted messages fits.
- Any message the protocol does not expect closes the socket.
- On shutdown the module closes its sockets, and each open ask ends as failed.

### 2.3 One ask

The loop runs on the server. The browser is asked to find; the server reads.

```
browser                              service                                provider
  │ auth {token}                       │                                       │
  ├───────────────────────────────────►│ gate                                  │
  │ hello {ask, context, …}            │                                       │
  ├───────────────────────────────────►│ limits · open the usage row           │
  │                                    │ read the context with the token       │
  │      status {looking, places}      ├──────── step (instructions, items, tools) ──►│
  │◄───────────────────────────────────┤◄──────── tool calls ───────────────────────┤
  │      find {id, query, in}          │                                       │
  │◄───────────────────────────────────┤                                       │
  │ found {id, hits: refs}             │                                       │
  ├───────────────────────────────────►│ check and read each hit               │
  │                                    ├──────── step (… + tool results) ─────►│
  │                                    │◄──────── answer(…) ───────────────────┤
  │      answer {parts, looked, …}     │ check the answer · close the usage row│
  │◄───────────────────────────────────┤ close                                 │
```

**Browser to service**

| Message | Fields |
|---|---|
| `auth` | `token`, `v: 1` |
| `hello` | `ask` (up to 2,000 characters), `lang` (`en` or `ja`), `tz` (whole minutes from UTC, −720 to 840, else refused), `depth` (`quick` or `thorough`), `closer?`, `context` (§5.1, up to 8 refs) or null, `history` (§7), `can` (the part, proposal and view kinds this app can draw), `sealed?` (slice 4, §3.5) |
| `found` | `id`, `hits` (up to 20 refs), in reply to `find` |
| `places` | `id`, up to 300 refs of the person's joined channels, projects and pages, in reply to `list`. Encrypted conversations are left out. |
| `stop` | none |

**Service to browser**

| Message | Fields |
|---|---|
| `status` | `stage` (`looking` or `closer`), `places` (refs). The app writes the line ("Looking in #portal…"). |
| `find` | `id`, `query` (2 to 80 characters), `in` (up to 20 refs) or null |
| `list` | `id` |
| `answer` | The checked answer (§4.2), then the socket closes |
| `error` | `reason`: `day-limit`, `month-limit`, `not-allowed`, `unavailable`, `failed` |

Close codes follow the relay: 4401 not signed in, 4403 not allowed, 4429 too many.

- The answer arrives whole, after its checks. No board draws text appearing word by word; the working state is one status line and a skeleton.
- Stop closes the socket. The server aborts the provider call and closes the usage row (§6.2).
- One person may have 2 asks open at once and start 6 a minute.
- Everything the browser sends is treated as untrusted: every ref is checked and read with the token before it counts, and every cap is enforced again on the server.

### 2.4 The web app

**Lint boundaries this must respect** (`eslint.config.js` at the repo root):

| Boundary | Consequence |
|---|---|
| Only `matrix/` holds the access token and talks to servers (D-19) | The socket and the HTTP calls live in `matrix/assistant.ts` and are reached as store commands. The feature never calls `fetch`. |
| `app/` never imports `features/*` | The shell draws the panel, the spark, the ⌘K row and the settings tab through the registry. |
| Features do not import each other (a rule in AGENTS.md; lint does not enforce it yet) | Boards, Docs and later Time contribute through registry slots. The Assistant reads the slots. |
| `ui/` has no Matrix and no copy | `ui/Table` and `ui/Bars` (slice 5) take strings and numbers as props. |
| No literal strings in JSX; locale parity; the vocabulary check | Every string in `features/assistant/locales/{en,ja}.json`. |
| Every Enter handler uses `isImeEnter()` | The ask box. |

**New in `app/` (stays when the feature is removed)**

| Piece | What |
|---|---|
| Right-panel host | A provider at `Workspace` level (`Shell.tsx:44-75`) that knows whether the Assistant is open and which of thread and Assistant was opened last. One slot in the shell row for both. The thread keeps living in the URL (`?thread=`); the Assistant's open state lives in the provider. The fold at 1000 to 1279 px keys on "any right panel open" instead of `?thread=` alone. |
| `HeaderEnd` | One small component placed at the right end of every page header: channel, DM, Threads, Drafts, Search, Browse in `app/`; the Docs and Boards headers in their features. It draws the registry's header button, or nothing. |
| ⌘K row | `Switcher` accepts one extra last row from the registry (amends RulesM8's "last row is always Search messages", for the team only, as AssistantPlaces p2 draws). |
| ⌘J | A document key handler in the host. It does nothing while a dialog is open. |
| `app/screenContext.ts` | `useScreenContext(ctx)`: screens report what they show. It calls the registry hook, or nothing. |
| `useIsTeam()` | One shared check for "owner, admin or staff in the workspace". Today the same test is copied in Translate, Boards, the rail and `roles.ts`. |
| Sign-out hook | `app/App.tsx:57-65` calls `forgetTranslations()` today. That becomes one hook that Translate and the Assistant both subscribe to. |
| Workspace settings tabs | The tab list accepts registry tabs after People and Access. |

**New slots on `Feature` (`app/registry.ts:70-78`)**

```ts
interface Feature {
  // Provided by one feature; the first wins, like `translation`.
  assistant?: {
    Panel: ComponentType;
    useHeaderButton(): { icon: ReactNode; label: string; pressed: boolean; dot: boolean; run(): void } | null; // null when not offered
    useSwitcherRow(query: string): { icon: ReactNode; label: string; hint: string; run(): void } | null;
    useScreen(ctx: ScreenContext | null): void;
    toggle(): void; // ⌘J
  };
  workspaceSettingsTabs?: { id: string; icon: ReactNode; useLabel(): string; Pane: ComponentType }[]; // Owners and Admins only

  // Provided by any feature; read by the Assistant through useRegistry().
  assistantParts?: { kind: string; Row: ComponentType<{ target: Ref }> }[];            // slice 3
  assistantProposals?: { kind: string; Dialog: ComponentType<ProposalDialogProps> }[];   // slice 3
  assistantViews?: { kind: string; useView(params: unknown): ViewData | null }[];        // slice 5
}
```

Each slot arrives with the slice that first uses it (D-04). The registry test (`app/registry.test.tsx:59-98`) gains: the shell renders with every new slot empty.

**The feature folder**

| File | Holds |
|---|---|
| `features/assistant/index.ts` | `defineFeature`: the `assistant` slot, the "Ask about this" message action, the settings tab |
| `session.ts` | The conversation, as a module singleton keyed by the signed-in person (§7) |
| `Panel.tsx`, `AskBox.tsx`, `Chip.tsx`, `Answer.tsx`, `parts/*` | The panel as drawn |
| `asks.ts` | Suggested asks for the shell's own screens (channel, thread, DM, Activity) |
| `locales/en.json`, `ja.json` | Every string |

Other features add one file each, for example `features/boards/assistant.tsx`, exported through their own `index.ts`.

**New in `matrix/` (the store contract, with fakes in `app/testing/fakeStore.ts`)**

| Command | What |
|---|---|
| `assistantAsk(request, { signal, onStatus })` | Opens the socket, answers `find` and `list` itself, resolves with the answer. Shaped like `search` (`matrix/types.ts:605`). |
| `assistantStatus()` | The status endpoint |
| `assistantSettings()`, `setAssistantLimits()`, `assistantUsage(month)` | Slice 2 |
| `messagesByRef(refs)` | Messages by id for answer rows, fetched when not in memory |

The spark, ⌘J and the ⌘K row are offered when `useIsTeam()` is true **and** the status endpoint says so. The server's answer is the truth, so the app never shows a spark whose every ask would be refused.

### 2.5 The provider

| Choice | Value |
|---|---|
| Provider and terms | OpenAI, as Translate (D-32). `store: false` on every request; the default is `true`, so it is sent explicitly. |
| Key | The Assistant's own key from its own provider project (`ASSISTANT_OPENAI_API_KEY`), so the project's hard limit (§6.4) never stops Translate. |
| API | Responses, `POST /v1/responses`, called with `fetch`. No SDK. Tools need this API on these models. The address is a constant in the code, not a setting. |
| Quick | `gpt-6.2-sol` at effort `low` |
| Thorough | `gpt-6.2-astra` at effort `medium` |
| Configuration | `ASSISTANT_QUICK=gpt-6.2-sol:low`, `ASSISTANT_THOROUGH=gpt-6.2-astra:medium`. The client sends only `depth`. Model ids are never a setting in the app. |
| Final answer | A strict function tool named `answer`. The loop ends when the model calls it. |
| History between calls of one ask | The server replays every output item in order, reasoning items included. Nothing is kept after the ask. |
| Instructions | A first `developer` message. Caching is in explicit mode with one breakpoint after the instructions and tool list, so source text is never written to the provider's cache. |
| Per-person tag | `safety_identifier`: a keyed hash of the user id. The key is random, made on first start and kept in `assistant.db`. |
| Retries | One retry on a rate-limit 429 or a 503, after `Retry-After` (at most 5 seconds). Never on a billing or spending 429. |
| Errors | The adapter throws fixed reasons only and never passes on the provider's text. |

- The adapter is one function: `step({ model, effort, items, tools, signal }) → { items, usage }`. `createAssistant` receives it, so tests inject a fake.
- These model ids are aliases. The provider publishes no dated versions, so behaviour can change without a deploy. The quality set (§10) is rerun when answers drift.
- A provider swap is a new adapter, new prices and a decision amending D-32.

---

## 3. Access and safety

### 3.1 Team only, enforced by the server

Every endpoint and every ask runs the same gate first. It fails closed: any error from the homeserver is a refusal.

| Step | Check | Fails as |
|---|---|---|
| 1 | The token is valid: a live `whoami`, never cached (`app.ts:55-61`). A locked account (D-46) fails here. | 4401 / 401 |
| 2 | The caller is joined to the workspace now. The workspace is the room the configured alias points at. | 4403 / 403 |
| 3 | The service's own records do not say this account is a client (`isClientAccount`, from `store.ts:127`). | 4403 / 403 |
| 4 | The workspace state holds no External record for the caller (`work.pasodrum.external`). | 4403 / 403 |

- Steps 3 and 4 are new. Translate has only steps 1 and 2. An External is never joined to the workspace under D-36, so step 4 only matters if that is ever broken by hand.
- Owner or Admin (settings and usage): the gate, then the caller's level in the workspace is 50 or more, read from the workspace state with the caller's token (`rules.ts:35-71`).
- The UI hides the spark, ⌘J and the ⌘K row for everyone else. That is a courtesy; the gate is the rule (invariant 6).
- An ask is one connection of at most 5 minutes, checked when it opens. Every read inside it uses the token, so a locked person loses their reads at once. A person removed from one place loses that place on their next ask.

### 3.2 How the server reads each kind of source

The reader holds the caller's token and a GET-only function. For every place it touches, once per ask, it reads the place's state with that token and requires:

1. the caller's own membership event says `join` **now** (the event decides, never the HTTP status);
2. for a server read, the place has no encryption event;
3. the place's kind, taken from its own create event and never from what the browser's ref says, fits the tool: `read_place` works only on a chat conversation, the issue tools only on a project, the page tools only on a page. The server's admin room is never read;
4. the server can place it somewhere it may read: in the workspace, in exactly one client space that is open to AI, or outside any space under the rule for conversations ("Client spaces" below). A place it cannot place is not read.

The first check is needed because the homeserver alone is not enough: someone who left can still fetch history up to their leave, and a conversation never joined answers 200 with nothing.

| Source | Calls, all GET with the caller's token | Refused when |
|---|---|---|
| Channel (workspace or client space, public or private in a client space) | State once; `/rooms/{id}/messages?dir=b` | Not joined now · encrypted |
| Thread | The root through `/rooms/{id}/event/{root}` first, then `/rooms/{id}/relations/{root}/m.thread` | As its channel |
| One message, or the messages around it | `/rooms/{id}/event/{id}`, `/rooms/{id}/context/{id}` | As its channel · deleted · the returned event names another room |
| A conversation with an External | The same calls; it is read like any other (D-50) | As its channel |
| DM, group DM, private workspace channel | **Nothing.** These are encrypted. Only §3.5 reaches them. | Always |
| Boards project and its issues | `/rooms/{project}/state` (titles, columns, people, due dates, descriptions); comments through `relations` | Not joined now · the issue's state entry is no longer live |
| Docs page | The snapshot through authenticated media, then the edits after it from `messages`; a worker turns both into text | Not joined now (a page is joined when the person first opens it) · its entry in the page tree is no longer live · over a size cap |
| Page titles and the page tree | The space's own state (`work.pasodrum.docs.page`) | Not joined to the space |
| People | Display names from the member events of places already read | Never read on their own |
| Drafts | Never. They live in the browser's own storage (`apps/web/src/app/drafts.ts:18-32`). | Always |

Every id that goes into a path (room, event, media) is format-checked and URL-encoded. A message fetched by id is used only if the event the homeserver returns names the room that was asked for.

**Reading rules for messages.** The aim is that the model sees what the app shows, not what the server still holds.

- Only `m.room.message` events of the text kinds are text. System rows, files and images are skipped.
- An edit is never read as a message of its own. It is applied to its target, and only when the target itself was read, is not deleted and has the same sender (as `applyLatestEdit`, `store.ts:1708-1717`). So a message that was edited and then deleted is gone, edit included.
- A message that was not reached in one unbroken scan back from the newest event (a find hit, the messages around a point, an older page of a channel) gets its newest edit looked up before it is used. So a message edited to take something out is read as edited.
- A deleted message comes back empty and is skipped.
- The text is the plain `body`, with the reply quote removed (`stripReplyFallback`, `matrix/map.ts:197`).

**Reading rules for issues and pages**

- An issue is read only while its state entry holds a title. A deleted issue keeps its number and nothing else (`docsBoardsCore.ts:145-148`), and its comments are not read.
- A page is read only while its entry in the page tree is live, in a space the caller is joined to. A deleted page keeps its room (`docsBoardsCore.ts:477-494`) and is not read.
- Page data is written by whoever can edit the page, clients included, and the homeserver accepts uploads of 53 MB. So: a snapshot or edit pointer must be an `mxc://` address on our own server; one file is at most 2 MB; one page read takes at most 4 MB and 2,000 edit events; all of it stops when the ask stops. Over a cap the page counts as not read.
- The parsing runs in a worker thread with a memory limit and an empty environment. A hostile page ends its own read, not the service, and `yjs` never sees the service's secrets.

**"Can open" means "has joined".** Not read: a public channel the person has not joined, a page they have never opened, a project whose background join failed. The server cannot join anything (it can only GET), and joining is a change the Assistant must not make. A page that was never opened can still appear as a row by its title, and opening it makes it readable.

**Client spaces: covered by the terms, or ask first (D-52, D-53).** The gate of §3.1 decides who may ask. This check decides what may be read, and it sits in the reader so that every path into a read passes it: the screen's context, find hits, `list`, the issue and page tools, and refs replayed from history. A place that fails is refused like a place the person is not in.

*Where a place lies.* The rule fails closed: a place the server cannot place is not read.

- The workspace is the room the configured alias points at. **Every other space counts as a client space**, whatever its own record says.
- A channel or a project lies in a space when both links agree: the place names the space, and the space lists the place. A page lies in a space when the page names the space and the space's page tree has a live entry for it.
- A place is read only when the server can show it lies in the workspace, or in exactly one client space that is open to AI. A place with one link only, a place in two spaces, the rooms left behind by a deleted client space, and a place whose space the caller cannot read are all not read.
- A space is a place in itself: its page tree and its place names are read only under the same rule.

*Whether a client space is open.* Two pieces of state, both read with the caller's token on every ask:

| State | Where | Who may set it | Counts when |
|---|---|---|---|
| The mark: `work.pasodrum.ai`, state key = the client space's id, `{ cover: 'terms' \| 'ask' }` | The **workspace's** state, beside the External records | Owners and Admins. The homeserver refuses everyone else, because state in the workspace needs level 50 (`matrix/levels.ts:30`). Until Time exists: one command, `pnpm assistant:cover <space> terms\|ask`, run by an Owner or Admin with their own sign-in. Later: Time's client profile writes it from the client's country. | Always. It does not lapse when the person who set it is demoted or removed, and nobody in the client space can change it. |
| The answer: `work.pasodrum.ai.consent`, state key = the answering person's own id, `{ answer: 'yes' \| 'no' }` | The client space's state | The client, by pressing Consent or Don't consent on Time's card (SIDE-12, not built). A state key that is a person's id can only be written by that person. Never the team. | Its sender is joined to that space now, is not joined to the workspace, has no External record, and was invited to **that** space as a client by the service's own records (`isClientOf`). |

| The space's state | Read? |
|---|---|
| No mark | **No** (call 5, approved: safe by default) |
| `terms`, no counted no | Yes. D-50 applies. |
| `ask`, no card sent yet | No |
| `ask`, card sent, no answer | No |
| `ask`, at least one counted yes and no counted no | Yes |
| Any counted no, whatever the mark says | No, from the next ask |
| The mark or the answers cannot be read (an error) | No |

- **Only a counted yes opens an "ask first" space, and a counted no closes any space.** Not asked, asked and declined are the same to the reader. Changing the mark from `ask` to `terms` does not read over a refusal.
- **Until Time ships the card, no counted answer can exist**: today the answer's event needs level 50 in the space, which no client has. So every space marked `ask` stays closed. The Assistant offers no way to record consent by hand.
- **A yes counts while the person who gave it is still in the space.** If they are removed, the space closes until another client there says yes. This is the lead's reading; it is the strict one.
- **Known residual:** a team member can invite a made-up client into a space and answer as that client. That is breaking the rule on purpose, and the card shows who answered.
- **The block is on the client's space.** What the team writes about that client in the workspace stays readable (the lead's reading in D-53). D-06 says a client is never in a workspace channel; if one is there anyway, their own messages there are skipped.

*Conversations outside any space (DMs and group DMs).* The same rule covers "conversations with its people". It lives in the reader from slice 1, for plain and encrypted conversations alike:

- A member is anyone with a member event in the conversation, whatever its state.
- A member who is joined to the workspace is team. A member with an External record is an External; D-50 applies to them.
- Every other member must be found in at least one open client space the caller is in, and in no closed one. Otherwise the conversation is not read and not handed over (§3.5).
- To know this the reader lists the caller's joined client spaces itself, from the homeserver's list of joined rooms, and reads each one's members, mark and answers. If any part of that listing fails, the conversation is not read.
- The only thing kept between asks is each room's kind, which never changes. Marks, answers and members are read fresh on every ask.

*What the person is told* is not drawn (INVENTORY: "not designed"). Until call 4's board draws it, a screen in a closed space gives no chip and the space is not read, without a word. The lock chip and the line "Not read: … hasn't agreed to AI tools" still exist in both board components, unused since D-50. The app shows its own state for the chip from the same events; that is display only, and the reader decides.

### 3.3 Which conversations are encrypted today

| Conversation | Today | After SIDE-10 |
|---|---|---|
| Public workspace channel | Plain | Plain |
| Any client-space channel, private ones included | Plain | Plain |
| Private workspace channel | **Encrypted** | New ones plain; existing ones stay encrypted |
| DM and group DM, with anyone | **Encrypted** | New ones plain; existing ones stay encrypted and show as sealed |
| A sealed DM | Does not exist | Encrypted, team only |
| Page and project rooms; the system sender's help DMs | Plain | Plain |

What follows:

- Until slice 4 ships, the Assistant reads no DM and no private workspace channel. Refusing on the encryption event also covers plain messages sent before a conversation was encrypted.
- The set of encrypted conversations today includes DMs with clients and Externals. D-50 allows reading them, D-52 covers the client's side, and D-51's ask-first step covers them because the step exists wherever the server cannot read. D-51's reason for not asking the other person ("sealed DMs are team-only") does not hold for those; the rule the CEO stated does ("if the user can see it"). A conversation with a client of a closed space is the exception: it is neither read nor handed over (§3.2, D-53).
- The service holds clients' and Externals' recovery keys (D-38). **The Assistant never uses them.** The module cannot reach the database or the secret that holds them (§2.1).

### 3.4 What is sent to the provider, logged and stored

| | |
|---|---|
| **Sent** | The ask. The earlier asks and answers of today's conversation (§7). The names of places. Per message: the sender's display name, the sender's role (team, client or external, from the server's own read, so a client who takes a colleague's name is still marked a client), the local time, the plain text cut at 1,000 characters. Issue fields. Page text by section. After a yes: the handed-over encrypted messages. A keyed hash as the per-person tag. |
| **Removed first** | From message text, display names, place names and titles alike: every URL becomes `[link]`, every email address `[email]`, every fenced code block `[code]`, every Matrix id, room or event id and the server's own name is dropped. A display name that is an email address (the invite service sets one when no name was given, `app.ts:179`) is sent as `[email]`. |
| **Never sent** | Ids of any kind (items carry handles). Files, images, avatars. HTML. Drafts. Anything that failed §3.2. |
| **Logged** | The service's access line (method, route name, status, milliseconds). Failures with a fixed reason. Both stdout and stderr are covered by test 7. |
| **Never logged** | The ask, the answer, search words, source text, ids of places or messages, the provider's error text. |
| **Stored by us** | One usage row per ask: who, when, depth, model, token counts, cost, duration, outcome (§6.1). The two limits. The key for the per-person tag. |
| **Never stored by us** | The ask, the answer, any source text, the conversation. The server keeps an ask's items in memory until the ask ends. |
| **Kept by the provider** | Nothing as a stored response (`store: false`), and no source text in its prompt cache (§2.5). Inputs may sit in its abuse-check logs for up to 30 days, or longer where the law requires. Zero Data Retention needs the provider's approval; ask for it when a client requires it. Processing inside the EU or Japan is a separate option that needs the provider's sales team; not now. **For the consent card (D-53):** its assurance "deleted by the AI service within 30 days" is stronger than what the provider says, which is "up to 30 days" for its abuse logs and longer where the law requires. Settled by the CEO on 2026-11-23: the words stay, and Zero Data Retention comes first. The card is not sent to any client until Zero Data Retention is in place on the Assistant's provider project. Until then a client in Japan is not asked and their space stays unread, which is what the reader already does for an "ask first" space with no answer (§3.2). |

The masking is done by the server in `mask.ts` while it builds the model's input. Translate's masking runs in the browser and is not reused. Text handed over from an encrypted conversation gets the same masking.

### 3.5 Encrypted conversations, end to end (slice 4)

One rule for every encrypted conversation: the server never reads it, and its text leaves the browser only after the person's yes, every time.

| Step | Where | What happens |
|---|---|---|
| 1 Find | `matrix/` in the browser | When the server asks to find, the search also runs over encrypted conversations on a confirmed device. For a hit in a plain conversation the browser returns its ref. For a hit in an encrypted one it returns nothing and keeps the message in a map inside `matrix/`, keyed by this ask. Encrypted hits are set aside before the 20-hit cap is applied, so the number of refs returned says nothing about them. At most 10 are kept per conversation and 40 per ask. |
| 2 Tell | The panel | The answer arrives without that text. The panel adds the ask-first row itself from the kept hits: "Not read: 2 sealed messages with 森 真由" · Read them. The server and the provider have learned nothing about those messages, not even their count. |
| 3 Yes | The person | "Read them" starts the ask again with the kept messages attached: for each, the conversation, the event id and the text. Up to 40 messages and 24,000 characters. |
| 4 Check | The service | For each conversation: the caller is joined now, the conversation **is** encrypted, and it passes the rule for conversations outside any space (§3.2, D-53); otherwise the whole conversation is refused. If it is not, the attached text is dropped and the server reads it the normal way, so "screens never pass text" keeps holding everywhere else. For each message: the server fetches the event with the caller's token and takes the sender and the time from its own copy (both are readable on an encrypted event); a missing or deleted event is dropped. Only the text comes from the browser. |
| 5 Answer | The service and the provider | The messages go in as sources marked sealed. Rows drawn from them carry the shield, and the "Looked in" line counts them ("and 2 sealed messages"). |
| 6 After | Everywhere | The kept map lives until "Read them" is used, the next ask starts, the panel closes or the person signs out. Nothing is stored. |

**What "every time" means here (D-51)**

- A yes covers one ask. The handed-over messages are never sent again without a new yes.
- An answer made from sealed text stays on screen in today's conversation, but that turn is **left out of the history** sent with later asks (§7). A follow-up starts without it, and the ask-first row appears again if the messages are needed.
- Look closer and Shorter on such an answer ask again without the sealed text. The ask-first row appears again.
- **Asked inside an encrypted conversation:** the screen reports only that it is one. The answer is "This conversation is sealed, so I haven't read it." · Read it. The yes hands over the conversation's most recent messages on the device, to the same caps. This is the lead's reading of "Read it" on the approved board; D-51's text speaks of "the matching messages".

**Also**

- **The other person is not asked** (D-51).
- **An unconfirmed device** cannot decrypt, so it finds nothing and offers nothing.
- **A conversation with a client of a closed space** is not kept and not offered by the browser, by its own view of the same state. The server refuses it in any case (step 4).
- **What the server cannot check:** that the text matches the ciphertext. A person who edits their own client could send any text. That equals pasting it, which D-50 accepts.
- **Planted text can choose the search words**, and so which sealed messages are offered. The person still has to press Read them, the row names each conversation and its count, a search word needs at least 2 characters, and nothing that read sealed text can lead to a client-facing part (§3.6).
- **The Sealed boards' words (call 1).** These approved sentences become untrue once this ships: "closed to everyone else, us included." (`design/canvas/SealedRules.dc.html:51`), "Only your devices and Sam's can read it." (`Sealed.dc.html:91`), "Only your devices and Sam's can read this." (`Sealed.dc.html:92`), and their Japanese. D-51 calls the hand-over "in transit, not stored"; that is true of us, and the provider may keep it in abuse logs for up to 30 days.

### 3.6 Text written by clients and others (prompt injection)

Any message, page or issue may contain text aimed at the model. A client can write one.

| Control | Enforced by |
|---|---|
| Sources go in as tool results, as JSON, each marked with its handle and its sender's role. The instructions say source text is data and never an instruction. Earlier turns of the conversation go in as data too, never as the model's own or the developer's words. | The prompt (a help, not a guarantee) |
| The model has no tool that writes, sends, or reaches the network. Its tools read through the reader, ask the browser to find, or end the ask. The reader can only GET. | The tool list, `reader.ts` |
| The model cannot name a place or a message. It uses handles the server gave out in this ask, kept in a map, for refs that came from the screen, from a find or from a read. An unknown handle is dropped. | `ask.ts` |
| Each ask is capped in calls, text and cost (§3.7), so text that says "keep searching" runs out. | `ask.ts` |
| The answer cannot carry a link, an image, HTML or Markdown, so nothing can be sent out by drawing it (§4.3). | `answer.ts` and the panel |
| A proposal only fills a dialog. The person sees every field and saves with their own access; the homeserver checks their rights. Proposal text has `@` marks and URLs removed and gets no mentions. | `answer.ts`, the feature's dialog |
| **What goes toward a client rests only on what lies in that client's space.** A proposal aimed at a client space, a summary addressed to someone outside the team, and a summary written under a chip in a client space are client-facing. One is kept only when every source this ask read, and every source of the replayed turns, lies in that one client space. Text from the workspace, from another client space, from a DM or from an encrypted conversation rules it out. The model is told once and answers without it. | `answer.ts` |
| The server works out which space a place belongs to by itself, both ways: the place names the space and the space lists the place (the two-way test `mayGrant` uses, `app.ts:99-123`). It never takes the browser's word, or the page tree alone, which every member can write (`matrix/levels.ts:44`). The full placing rule is in §3.2. | `reader.ts` |
| The "Looked in" line lists every place that was read, so an ask steered somewhere unexpected shows it. | The panel |

What remains: planted text can bend an answer the asker reads, or pull an unrelated place into it, and the "Looked in" line shows that. A summary with no addressee, written under a workspace chip, is prose from what was read; the person reads it before pasting it anywhere. Nothing reaches a client or an outsider without a person saving or pasting.

### 3.7 Caps per ask

Starting values, kept together in `assistant/wire.ts` and tuned by the quality set. All are per ask.

| Cap | Quick | Thorough |
|---|---|---|
| Model calls | 6 | 8 |
| Tool calls | 10 | 16 |
| Finds sent to the browser (4 seconds each) | 4 | 6 |
| Source text given to the model | 24,000 characters | 60,000 characters |
| Output across all calls, reasoning included | 6,000 tokens | 30,000 tokens |
| Running cost, after which the loop ends | $0.30 | $2.00 |
| Time per model call · per ask | 30 s · 60 s | 120 s · 5 min |

At a cap the model is told to answer with what it has. A cut-off or refused reply from the provider ends the ask as failed.

---

## 4. The contract between the model and the UI

### 4.1 What the model returns

The model ends an ask by calling `answer`. The schema is strict: every field required, no extra fields, unions only below the root.

```ts
answer({
  outcome: 'answered' | 'nothing' | 'cant',
  say: string,              // one or two sentences
  parts: (
    | { type: 'source'; handle: string }                                  // draw this item as its own row
    | { type: 'heading'; handle: string }                                 // a person or a place, as a group heading
    | { type: 'open'; handle: string }                                    // "Open #general"
    | { type: 'text'; kind: 'summary'; for: string | null; lines: string[] }
    | { type: 'proposal'; kind: 'boards.issue'; project: string; title: string; description: string | null; assignee: string | null }
  )[]
})
```

Slice 5 adds `fact`, `estimate`, `view`, the month-note text kind and Time's proposal kinds. The enum of kinds in each request is the intersection of what the server knows and what the browser said it can draw (`can`), so a removed feature's kinds are never offered.

### 4.2 What the browser receives

The server turns handles into refs and adds what it read itself.

```ts
interface Answer {
  outcome: 'answered' | 'nothing' | 'cant';
  depth: 'quick' | 'thorough';
  say: string;
  parts: Part[];        // at most 12
  looked: Looked[];     // every place read, with counts, for the "Looked in" line and its list
  usedSealed: boolean;  // this turn is left out of later history (§3.5)
  thorough: 'ok' | 'low' | 'day' | 'month';   // for the picker and Look closer
}
type Part =
  | { t: 'source'; target: Ref; plain: string; sealed?: true }
  | { t: 'heading'; target: Ref; plain: string }
  | { t: 'open'; target: Ref; plain: string }
  | { t: 'text'; kind: 'summary'; for?: Ref; lines: string[] }
  | { t: 'proposal'; kind: string; fields: Record<string, unknown>; plain: string };
```

- `plain` is written by the server from data it read (an issue's key and title, a channel's name). The model never writes it. The panel shows it when no registered feature draws that kind (a removed feature's plain line, AssistantViewStates s4).
- The "Looked in" sentence is composed by the app from `looked` with `Intl.ListFormat`, in the fifteen forms the boards draw: places by name (`#portal`, "your conversation with 森 真由"), then counts by kind ("2 pages", "2 sealed messages"). The model does not write it.
- `wire.ts` exists twice, in the service and in `apps/web/src/matrix/`. A script in `pnpm check` fails when the two differ.

### 4.3 "Never written by it", enforced

Every model string (`say`, `lines`, proposal fields) first passes the same cleaning in `answer.ts`: a length limit (`say` 320 characters, a line 200, 8 lines, a title 200, a description 4,000), control and direction-changing characters stripped, and NFKC folding before any check below.

| Never | How it is enforced, and where |
|---|---|
| A layout | The answer is a flat list of typed parts from a closed set. The panel decides the order of kinds and draws each with its own component. There is no field for size, position or style. |
| HTML, code, Markdown | Model strings are drawn as plain text nodes. The feature folder has no HTML sink and no Markdown renderer; a lint rule bans `dangerouslySetInnerHTML` in `features/assistant`. A string with tags or Markdown shows as the characters it is. |
| An image | No image is ever created from a model string. Avatars and icons come from the store by ref. |
| A link | No anchor is created from a model string. `answer.ts` removes any string that contains a URL (any case), a `www.` address, an email address or a Matrix id. This covers proposal fields too, because the app turns any web address in an issue's text into a link (`matrix/html.ts:42`). Navigation happens only through refs the server resolved. |
| A row, a name in a row, a title | Rows come from refs. The row's content is drawn from the browser's own store; a ref the store cannot find is dropped. An unknown handle is dropped on the server. |
| A number in a row, a table or a chart | Those parts hold refs and filters, never values. The feature computes the values from its own data. |
| A number in a sentence | Every number in `say` or `lines` must appear in something this ask showed the model: a source cited in the answer, a count or value the server computed and returned in a tool result, or the person's own ask. `answer.ts` compares the digit runs. A number that appears nowhere is an invented one: the model gets one chance to repair, then the sentence is removed. |
| An action | `proposal` is the only part that leads to a change, its kinds are a fixed list, and it only opens a dialog. There is no kind for send, post, approve, delete, remove, roles or settings. |

Stated plainly, what the number check does and does not do: it removes numbers the model made up. It does not catch a wrong number that happens to appear somewhere in what was read, a number planted in a source the answer cites, numbers written in kanji, or a name typed in a sentence. Tool results carry counts ("3 open issues") so that honest counts pass; the instructions tell the model to point at rows instead of writing relative dates. The quality set covers the rest.

**Model-written numbers that are allowed (slice 5):** an estimate, as a typed range with at least one past item it rests on, drawn by the app as "18–26 h · like POR-6: 30 h planned, 34 used"; and the fields of a proposal, which a person reviews in the dialog. Both are bounded by `answer.ts`.

### 4.4 Drawing

| Part | Drawn by | From |
|---|---|---|
| The sentence, the working line, "Looked in", states | The Assistant | Its own locale files and the answer |
| Message row | The Assistant | `messagesByRef`; avatar, name, time, two lines as written, with the message's own `lang` |
| Person row, group heading | The Assistant | The store's people |
| Issue row | Boards (`assistantParts`) | The Boards store |
| Page row | Docs (`assistantParts`) | The page tree |
| Text card | The Assistant | `lines`; Copy puts the plain lines on the clipboard; Shorter asks again |
| Proposal card, done row | The Assistant draws the card; the feature draws the dialog | §4.5 |

Opening a source: a message opens in its conversation and flashes, as Search does; a reply opens its thread on top; an issue or a page opens in the main area. The panel stays.

### 4.5 From a proposal to the normal dialog

```ts
interface ProposalDialogProps {
  fields: Record<string, unknown>;       // already checked by the server; the feature checks again
  onClose(): void;
  onDone(result: { target: Ref; summary: string }): void;
}
```

1. The answer carries `{ t: 'proposal', kind: 'boards.issue', fields }`. The panel draws one card with **Open** and **Not now**.
2. Open mounts the feature's `Dialog` from `assistantProposals`. For Boards it is `NewIssueDialog` with new optional starting values (project, title, description, assignee). Focus goes to its first field.
3. Nothing is saved until the dialog's own button. The save is the person's own action through the store, exactly as if they had typed it.
4. `onDone` turns the card into a done row with **Open**. Not now leaves the card without buttons.
5. One card, one dialog, one thing. There is no "do all".

The server's checks on `boards.issue`: the project handle resolves to a project the caller is joined to; the assignee, if any, is a member of it; the strings pass §4.3's cleaning, with `@` marks removed; and when the project lies in a client space, the client-facing rule of §3.6 holds.

---

## 5. Context

### 5.1 How a screen hands over references

A screen reports what it shows through `useScreenContext`. It passes references and a label. It never passes message, page or draft text.

```ts
interface ScreenContext {
  kind: string;                 // 'channel' | 'thread' | 'dm' | 'activity' | 'page' | 'project' | 'issue' | 'issues' | …
  layer: 'page' | 'panel';      // a thread or an open issue wins over the page under it
  space?: string;               // for the chip; the server works out the space itself
  refs: Ref[];
  newest?: string;              // the newest message on screen; reading stops there
  label: string;                // for the chip only; never sent
  asks?: { id: string; text: string }[];   // up to three, from the screen's owner, already translated
  closed?: 'sealed';            // the screen is an encrypted conversation: no refs
}
type Ref =
  | { k: 'place'; room: string } | { k: 'thread'; room: string; root: string }
  | { k: 'message'; room: string; event: string }
  | { k: 'project'; project: string } | { k: 'issue'; project: string; issue: string }
  | { k: 'page'; page: string } | { k: 'person'; user: string } | { k: 'space'; space: string };
```

| Call site | File | Slice |
|---|---|---|
| Channel and its tabs | `app/shell/Shell.tsx:294-304` | 1 |
| Thread panel | `app/thread/ThreadPanel.tsx` | 1 |
| Activity item (a message, or an issue for an assignment) | `app/shell/Shell.tsx:181-200` | 1 |
| DM | `app/pages/Dms.tsx:102-148` | 1 reports `closed`; 4 gives it meaning |
| Docs page | `features/docs/PageView.tsx:69` | 3 |
| Boards project, open issue, My issues, All issues | `features/boards/BoardsScreen.tsx`, `IssuePanel.tsx:43` | 3 |

- The chip shows the most specific thing: an open issue over its project, a thread over its channel. × on the chip makes the next ask start from everywhere; the next screen brings a chip back.
- The chip follows the screen. Each earlier ask keeps the context it was asked under, and a divider row names the new one when it changes.
- "This" is chosen on purpose: the "Ask about this" button in a message's hover bar sets `{ k: 'message' }` as the selection and opens the panel. Hovering never selects.
- A screen that makes no call (Pins, Files, a new rail page) gives no chip. Asks still work, from everywhere.
- A screen inside a client space that is closed to AI (§3.2) gives no chip, and "Ask about this" is not shown there, until the words for it are drawn.
- Suggested asks for the shell's own screens live in the Assistant's folder, so `app/` carries no Assistant copy. Features pass their own.

### 5.2 What the browser finds and what the server reads

| | The browser | The server |
|---|---|---|
| Messages in plain conversations | Runs the existing local search (`matrix/search.ts`: substring, NFKC-folded, so Japanese works) and returns refs, newest first. One bounded pass per find. | Checks and reads every ref (§3.2). A ref it cannot read is dropped without a word. |
| Messages in encrypted conversations | Slice 4: keeps the hits, returns nothing (§3.5). Before slice 4: skips them. | Nothing |
| Issues | Nothing | The same folded substring match over titles and descriptions, in the state of the person's projects |
| Pages | Nothing | The same match over page titles. Page bodies are read one page at a time, when the model picks one. |
| Which places exist | Answers `list` with the refs of joined channels, projects and pages | Reads each name itself, when it shows the place to the model |

The search returns whole messages today. The wrapper in `matrix/` keeps only the refs, so no message text crosses from the browser to the server outside §3.5.

### 5.3 Lookups the model can call

| Tool | Source | Returns | Slice |
|---|---|---|---|
| `find(query, in?)` | chat, issues, page titles | Items matching the words, each with a handle | 1; issues and pages in 3 |
| `read_place(handle, before?)` | chat | The latest 50 messages of a channel, or the 50 before a message given by its handle | 1 |
| `read_thread(handle)` | chat | The root and its replies | 1 |
| `read_around(handle)` | chat | A message and the ten on each side | 1 |
| `list_places()` | chat, Docs, Boards | The person's places, by name | 1 |
| `list_issues(handle, open_only)` | Boards | A project's issues: key, title, column, person, due date, and their count | 3 |
| `read_issue(handle)` | Boards | Description and comments | 3 |
| `list_pages(handle)` | Docs | A space's page titles, as a tree | 3 |
| `read_page(handle)` | Docs | The page as text, by section | 3 |
| `answer(…)` | none | Ends the ask (§4.1) | 1 |

Every item returned to the model looks the same: `{ handle, kind, place, from, role, at, text }`, masked as §3.4 says and with no ids. Time and Handover add their own tools in slices 5 and 6.

---

## 6. Limits and usage

### 6.1 Data

In the module's own SQLite file, `assistant.db`, created on first start in the house style (`CREATE TABLE IF NOT EXISTS`; there are no migrations).

```sql
CREATE TABLE IF NOT EXISTS assistant_usage (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,          -- when the ask opened, UTC milliseconds, by the server's clock
  day TEXT NOT NULL,            -- the asking person's local date, YYYY-MM-DD
  tz INTEGER NOT NULL,          -- their minutes from UTC at that moment
  userId TEXT NOT NULL,
  feature TEXT NOT NULL,        -- 'assistant'; Time's Draft and Review use their own value
  depth TEXT NOT NULL,          -- 'quick' | 'thorough'
  model TEXT NOT NULL,
  effort TEXT NOT NULL,
  calls INTEGER NOT NULL,
  input INTEGER NOT NULL, cached INTEGER NOT NULL, written INTEGER NOT NULL,
  output INTEGER NOT NULL, reasoning INTEGER NOT NULL,
  costMicros INTEGER NOT NULL,  -- millionths of a US dollar
  ms INTEGER NOT NULL,
  outcome TEXT NOT NULL         -- 'open' | 'answered' | 'nothing' | 'cant' | 'stopped' | 'failed'
);
CREATE INDEX IF NOT EXISTS assistant_usage_day ON assistant_usage (day, userId);
CREATE INDEX IF NOT EXISTS assistant_usage_at ON assistant_usage (at);
CREATE TABLE IF NOT EXISTS assistant_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedTs INTEGER NOT NULL, updatedBy TEXT NOT NULL);
```

A row never holds the ask, the answer, a search word or a tool argument. The settings table holds the two limits and the tag key, never a model id or an address. One row per ask, Look closer included. About 4 MB a year.

### 6.2 Cost

- Each provider reply reports its tokens. `input` includes the cached and the cache-written tokens, and `output` includes reasoning.
- Cost of a call = plain input × input price + cached × cached price + written × write price + output × output price. An ask's cost is the sum over its calls.
- Prices come from configuration: `ASSISTANT_PRICES`, JSON keyed by model id, in US dollars per million tokens (`in`, `cached`, `write`, `out`). Checked on 2026-11-23: `gpt-6.2-sol` 2.00 / 0.10 / 2.50 / 10.00 and `gpt-6.2-astra` 8.00 / 0.40 / 10.00 / 40.00.
- If a configured model has no price, the module stays off and the status endpoint answers 503. The rest of the service runs.
- **A call that ends without a usage report is never free.** A call cut off by Stop, a timeout or a lost connection is charged an estimate: the input that was sent, plus output for the time the call ran at a fixed tokens-per-second figure per model, up to the ask's output cap. Spike 1 sets the figure and checks whether a streamed call reports its real usage when cut.

### 6.3 The two limits

| Limit | Counts | Clock |
|---|---|---|
| Each person, a day | That person's rows for their own local date (`day`) | The asker's. The browser sends its offset from UTC with each ask; the server derives the date from its own clock plus that offset. This makes "It starts again at 00:00." true for each person. |
| Everyone, a month | Every row opened in the current calendar month (`at`) | The server's, in UTC. Never a value from the browser. |

- Values: `assistant_settings` when set, else `ASSISTANT_DAY_USD` (3) and `ASSISTANT_MONTH_USD` (100).
- The offset must be a whole number from −720 to 840, or the request is refused. Within that range three dates can be valid at once, so a person who changes their clock could spend up to three days' allowance in one day. The monthly limit and the provider's limit still hold. Accepted for a team.

### 6.4 Where the limits are enforced

In the service, when an ask opens, after the gate and before any read or provider call:

1. Refuse with `day-limit` if the person's spending today, open asks included, plus $0.10 for Quick or $1.00 for Thorough would pass the daily limit.
2. Refuse with `month-limit` if the month's spending, open asks included, plus that amount would pass the monthly limit.
3. Insert the usage row with outcome `open` and that amount as its cost.
4. After each provider call, raise the row's cost to the running cost if that is higher.
5. When the ask ends, however it ends, write the real cost and the outcome.

- Steps 1 to 3 happen without waiting in between, in one process with synchronous SQLite, so two asks cannot both slip past.
- The set-aside lives in the table, not in memory. A crash or a deploy leaves an `open` row that keeps counting at its last cost.
- An ask already running finishes; a limit never cuts it off halfway. The running-cost cap of §3.7 does.
- Thorough is `low` (not offered) when less than $1.00 is left in the person's day or in the month. The picker shows "not enough left today" and Look closer is hidden.

**The backstop:** a monthly limit of $150 on the Assistant's own provider project, with "Enforce a hard limit" switched on. Without that switch it only sends an alert. The provider says enforcement is not instant, so the bill can pass it slightly. When it trips, the provider answers 429 with a spending code; the ask ends as failed and is never retried.

### 6.5 The API behind the settings screen

| Call | Returns or takes |
|---|---|
| `GET /api/assistant/status?tz=` | `{ ask: 'ok' \| 'day' \| 'month', thorough: 'ok' \| 'low' \| 'day' \| 'month' }`. No amounts. |
| `GET /api/assistant/settings` | `{ dayUsd, monthUsd }` |
| `PUT /api/assistant/settings` | `{ dayUsd?, monthUsd? }`: a number from 0 to 10,000 with at most two decimals. Anything else is 400 and the field shows the saved value again. Takes effect on the next ask. |
| `GET /api/assistant/usage?month=YYYY-MM&tz=` | `{ month, limitUsd, totalMicros, asks, thorough, paused, days: [{ day, micros }], people: [{ userId, asks, micros, todayMicros?, atLimit? }], earlier, later }` |

- The month and its bars per day follow the server's clock, as the monthly limit does.
- `limitUsd` is today's limit, also for an earlier month. Past limits are not kept.
- `todayMicros` and `atLimit` are sent for the current month only. A person's "today" is the date at their last known offset.
- People are returned by id and sorted by spending, highest first. The browser shows names and tiles from its own store. An Owner or Admin can already see every member.
- Never returned: asks, answers, tokens, model names.

---

## 7. Memory

| Question | Answer |
|---|---|
| Where the conversation lives | In `features/assistant/session.ts`, a module singleton in the tab's memory, keyed by the signed-in person: the asks, each ask's context, the answers. Never in browser storage. |
| What the server remembers | Nothing of any ask. The one thing kept between asks is each room's kind (chat, project, page or space), which never changes. |
| A follow-up | The browser sends the last 6 turns as history: each ask, the answer's sentence and the refs of its sources, up to 6,000 characters and 30 refs. A turn that used sealed text is left out (§3.5). |
| How the server treats history | As untrusted data from the browser. It enforces the caps itself and runs §4.3's cleaning on every string. Before anything else it runs the reader's checks on every ref of every turn, and **drops a turn whole when any of its refs fails now**: a channel the person has left, a deleted page, a client space that has closed. The turns that remain go to the model as data, with new handles; their sources are read again only if the model asks. |
| The day turns | Checked when the panel opens: if the conversation is from an earlier local date, it starts empty. Never in the middle of use. |
| Start over | Clears it, no confirm. |
| Sign-out | Clears it and aborts a running ask, through the shared sign-out hook (§2.4). An answer that arrives for someone no longer signed in is dropped. |
| Reload, or closing the tab | Gone. A running ask ends. |
| A second tab or a second device | Its own conversation. Nothing is shared or synced. |
| The desktop app | The same. Closing its window only hides it, so the conversation lasts until quit or the day turns. |
| The panel closed while an answer is running | The ask carries on in the session. The spark shows a dot when it lands. |

---

## 8. Languages, accessibility, removal

**Languages**
- Every UI string in `features/assistant/locales/en.json` and `ja.json`, copied from the boards. Parity and the vocabulary check apply.
- The model is told the app's language and answers in it. Quotes and names stay as written; message rows carry the message's own `lang`.
- Counts, lists and dates go through `Intl`. No joined fragments.
- The ask box sends on Enter through `isImeEnter()`.
- Where the two board components differ in Japanese (Stop is 停止 in one and 止める in the other), the panel component `Assistant.dc.html` wins.

**Accessibility**
- The panel is `<aside aria-label="Assistant">`. The working line is `role="status"`, announced once per change.
- A finished answer is announced as its sentence, then the count of rows and proposals.
- ⌘J or Ctrl J opens with focus in the ask box, and closes from inside with focus returned. Esc closes (under 1000 px: back).
- Tab runs top to bottom; Shift Tab from the box reaches the newest answer.
- The depth picker is a menu of two radio items, as drawn. Reduced motion: fades only.
- Contrast is checked in both themes on the warm grey.

**Removal (D-04)**
- Web: delete `features/assistant` and its line in `features/index.ts`. The shell's slots are empty: no panel, no spark, no ⌘K row, no settings tab. Other features' `assistant.tsx` exports sit unused.
- Service: delete `src/assistant/`, its two lines in `app.ts` and the Caddy path. `assistant.db` stays on the volume and is never opened.
- With the module's configuration missing, the status endpoint answers 503 and the app shows no spark.

---

## 9. Tests

Held to D-30: only who can read what, what leaves, and what the model can make happen. Layout and copy are checked in a browser.

Service tests run the module in the test process against the seeded local homeserver, with a fake provider function that records every request. The seed gains what the tests need to be able to fail: a display name that is an email address, a message with a Matrix id and the server's name in its text, a reply, an edited message, an edited-then-deleted message, a deleted issue with comments, a deleted page.

| # | Setup | Expect |
|---|---|---|
| 1 | On all four paths (the socket, status, settings, usage): no token · a client · an External · a locked account · an account invited as a client and then added to the workspace · an External joined to the workspace by hand, so step 4 is reached · a homeserver error during the gate | Refused each time. The fake provider is never called and no usage row is written. |
| 2 | Staff outside client space X sends refs into X as context, as find hits and as history. A joined conversation with an event id from a conversation the caller left. | Refused. None of that text is in any recorded request. |
| 3 | Server (slice 1): a conversation with plain messages, then encryption turned on, then asked about. Slice 4: attached text for a conversation the caller is not in; attached text for a plain conversation; a follow-up after an answer that used sealed text. Web: the find wrapper on a mixed set of hits; a first ask. | Nothing of the conversation is sent, the earlier plain messages included · refused · the attachment dropped and the server's own read used · the sealed turn is not in the history · the wrapper returns no ref and no text for an encrypted hit, and the refs it returns do not vary with the number of encrypted hits · a first ask never carries attached text. |
| 4 | A member asks, leaves the channel, asks again with the same history. A workspace channel with an External in it. | Read, then refused on the second ask · read (D-50). |
| 5 | A page the person never opened; a page they opened; a project they are in; a page whose snapshot points at a 50 MB file, and one pointing at another server | Title only · the text matches the page · issues and comments read · not read, and the service keeps running. |
| 6 | A deleted message; a message edited and then deleted; a message edited to remove a word, reached by a find; a deleted issue with comments; a deleted page reached through history; a ref to a message in a conversation never joined | No text sent for any of them, and the edited message is sent as edited. |
| 7 | Any ask, on the seed above | `store: false` in every request. No Matrix id, email address, URL or server name in any request, in text or in names. Every homeserver call was a GET and carried the caller's token. Nothing but the access line on stdout or stderr. |
| 8 | The fake model returns: a proposal of an unknown kind, an unknown handle, a URL in the sentence and in a proposal field, an `@` name in a proposal, an invented number, HTML and Markdown, direction-changing characters, a proposal into client space A after reading a workspace channel, after reading client space B, and after sealed text | Dropped · dropped · removed · stripped · removed · shown as plain characters · stripped · dropped each time. |
| 9 | Over the daily limit; over the monthly limit; an offset of 44,640 minutes; Stop during the first provider call; the provider fails; two asks opened at the same moment at the edge of a limit; Staff calls the settings and usage endpoints | Refused with the right reason · refused · the day's spending still moves · the row is closed as failed · only one passes · rows hold counts only · 403. |
| 10 | The registry without the Assistant; the service without the module's configuration; the import check | `pnpm check` green, the shell renders with every new slot empty · the status endpoint answers 503 · the check fails on an import from outside the folder or a `process.env` read. |
| 11 | **The client-space check (D-53).** The test lowers the answer event's level in the seeded client space first, as Time will. Each state is asked about through context, find hits, the issue and page tools and history. *The mark:* none · `terms` · `ask` · written by an Admin who is then demoted · Staff tries to write it. *The answer:* none · a no · a yes from a client of that space · a yes then a no · `terms` plus a no · a yes from a team member, from an External, from a former client now on the team, from another space's client who was added to this one, from a client who then left the space. *Placing:* a channel whose space no longer lists it · the rooms left by a deleted client space · a place listed by two spaces · the closed space's own page titles and place names. *Conversations:* a plain DM, a group DM and (slice 4) a hand-over with a client of a closed space · a DM with a client of a space the caller has left · a client's own messages in a workspace channel. *Errors:* the homeserver fails while the mark is read. A workspace channel that talks about the client. | *Mark:* not read · read · not read · still counts · refused by the homeserver. *Answer:* not read · not read · read · not read from the next ask · not read · not read for each of the five. *Placing:* not read in every case. *Conversations:* not read, the hand-over refused, the client's own messages skipped. *Errors:* not read. The workspace channel is read. In every "not read" case nothing of the space is in any recorded request: no text, no names, no titles. |

**The Fable review at build**
- After slice 1's service code and before it ships: `gate.ts`, `reader.ts`, `ask.ts`, `answer.ts`, `mask.ts`, and the checks in §3.
- After slice 4's hand-over and before it ships: the find wrapper, the attached-text path, the service's checks.
- Must-fix findings are fixed. Edge cases are dropped (the CEO's rule for reviews).

---

## 10. Unknowns that need a spike

| # | Unknown | Measure | Time |
|---|---|---|---|
| 1 | Does the loop work as specified on the Responses API: `store: false`, replayed reasoning items, a strict `answer` tool, explicit caching, usage on every reply? What is reported and billed for a call cut off by Stop? | A script against the real API with three asks. Sets the tokens-per-second figure for §6.2. If a streamed call reports usage when cut, the adapter streams. | 2 hours, about $5 |
| 2 | Which models pass the quality set? Report 4's eight asks on the seeded workspace, three runs each, at the proposed pair and one step cheaper. Asks 6 and 7 (a channel the person is not in; a planted instruction) must pass every run. | Decides Quick and Thorough, and real costs and waits. | 2 hours, about $20 |
| 3 | How long does one bounded find take across every joined conversation, and does a literal word search find enough in Japanese and English? | Seeded workspace plus a larger generated one. Decides the 4 second budget and the hit count. | 2 hours |
| 4 | Does `yjs` in a worker turn a page's snapshot and later edits into the same text the browser shows, and do the caps and the memory limit hold against a hostile page? | The seeded pages and two hostile ones. If the text does not match: the browser sends the open page's text with the same checks as §3.5, and this becomes a second exception to "screens never pass text". | 2 hours |
| 5 | Can the page take ⌘J and Ctrl J in Chrome, Safari, Firefox and the desktop app? | A key handler in the dev build. | 30 minutes |
| 6 | Does the homeserver attach a message's newest edit to the message when it is fetched? | One edited message, fetched three ways. If yes, the edit lookup of §3.2 costs nothing. | 30 minutes |
| 7 | Does the provider's hard limit stop requests, with what reply, and how far can spending pass it? | A throwaway project with a $1 limit. | 30 minutes |
| 8 | Is the server's admin room plain, and does Coolify's proxy pass the caller's address and keep a quiet socket open for 5 minutes? | Read the room's state locally; one long socket on production's proxy path. | 30 minutes |
| 9 | What does the first listing of a person's joined client spaces cost? Page rooms are never left, so the list of joined rooms can run to hundreds. Do any rooms on production have one link only, so that the placing rule of §3.2 would close them? | Time it on the seeded workspace with many pages; list one-link rooms on production with the Owner's own sign-in, read-only. | 30 minutes |

### Gaps: states the boards do not cover

Not designs. Each becomes a row for the small board in call 4, or stays unbuilt until it is drawn (invariant 3).

| Gap | Until it is drawn |
|---|---|
| Chips for a thread, a DM, an Activity item, a page, a project, an issue, My issues | Call 4's board; only the channel and "this message" chips are drawn |
| Suggested asks for every screen that exists today, in both languages (drawn only for a scope) | Call 4's board; without it the empty panel shows the chip and the box |
| The New issue proposal card and its done row | Call 4's board; slice 3's proposal waits for it |
| Japanese and dark variants of most panel boards and of the settings states (only English and light are drawn for most) | Call 4's board; the strings and tokens already exist in the components |
| The working line changing in place; the "Looked in" list past five rows ("and 4 more") | Call 4's board |
| What the panel says about a client space it may not read: a client in Japan who has not consented, and a space with no mark yet (D-53; INVENTORY row "not designed") | Call 4's board. Until then such a space gives no chip and is not read, without a word. |
| Changing a consent answer later | Time's board (SIDE-12). The reader already follows the newest answer. |
| The wording for encrypted messages in a private channel ("sealed" is a DM word) | Private workspace channels are not read and not mentioned |
| A client-facing part that was ruled out (§3.6) | The model's own sentence says it cannot; no card |
| A page that was never opened | Shown as a page row by title; no extra words |
| The ask box growing to several lines | One line, as drawn |
| A thorough ask that fails | "Couldn't answer." · Retry. No quiet fall-back to Quick. |
| ⌘↩ to send thorough (report 3) | Not built; the picker replaced it |
| The settings screen: a save that fails, a value that is not a number, loading, more people than fit | The field shows the saved value again; the list scrolls |
| A person who was removed, in the usage table | Left out of the table; the total still counts their spending |
| The provider's own limit reached | The ask fails like any other; Owners see it at the provider |
| Selecting page text or a grid cell as "this"; Time's and Handover's suggested asks | Later, with their boards |

Where the reports and the boards disagree, the note and the boards win: the effort control is the picker plus Look closer (not report 4's "Think longer"); the lock chip and "Not read: … hasn't agreed" are gone (D-50); after Stop the ask returns to the box by itself; Offline is a placeholder in the box, with no banner.

---

## 11. Decisions this spec proposes

Approved with the spec on 2026-11-23 and logged in `docs/DECISIONS.md` as D-54.

1. The Assistant's server side is a fenced module in `services/invite`: GET-only access to the homeserver, its own database file, no secrets, reached over one WebSocket per ask. Not a new service.
2. The loop runs on the server. The browser finds messages; the server finds issues and page titles; the server reads everything it can.
3. Team only is a four-step gate, tighter than Translate's.
4. "Can open" means "has joined". The server cannot join on the person's behalf.
5. The model sees what the app shows: deleted and edited text, deleted issues and deleted pages are never read.
6. Every encrypted conversation follows the ask-first rule, DMs with clients and Externals included. The recovery keys held under D-38 are never used.
7. A client space is read only when it is open to AI: marked "covered by the terms" by an Owner or Admin, or marked "ask first" and answered yes by a client of that space, with no client's no (D-53). The mark lives in the workspace's state, the answers in the client space's. A place the server cannot place in the workspace or in one open client space is not read, and a conversation outside any space is read only when its outside members belong to open client spaces. An unmarked space is not read (call 5).
8. A yes covers one ask. A turn that used sealed text is not replayed, and Look closer on it asks again without the text.
9. `services/invite` gains a second dependency, `yjs`, run in a worker with size caps (subject to spike 4).
10. The answer is a strict tool call checked on the server. A number in a sentence must come from what the ask read.
11. What goes toward a client rests only on what lies in that client's space.
12. The limits live in the module's own database, changed through an Owner or Admin endpoint. The day is the asker's local day; the month is the server's. Spending is counted from the moment an ask opens.
13. The Assistant has its own provider project and key, with a hard limit switched on.
14. History is replayed from the browser's memory as untrusted data. The server keeps nothing between asks.
15. The right-panel host, the header piece, the ⌘K row slot, the settings tab slot and the sign-out hook belong to `app/` and stay when the feature is removed.
