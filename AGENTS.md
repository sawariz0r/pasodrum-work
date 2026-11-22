# AGENTS.md — Pasodrum work

Operating guide for any coding agent (or human) working in this repo. Read this first, then the doc it points to for your task. Keep it current: when a rule is corrected or a decision changes, update this file and [docs/DECISIONS.md](docs/DECISIONS.md).

---

## 0. Start here (every session)

You start with **no memory of prior chats** — orient yourself like this:

1. **Read this file**, then [docs/PHASES.md](docs/PHASES.md) (where every phase stands, what's waiting on the CEO, how the build loop works), then skim [docs/SPEC.md](docs/SPEC.md) and [docs/DECISIONS.md](docs/DECISIONS.md).
2. **Check the board** in [tasks/](tasks/) — it's the **cross-session source of truth**:
   - `tasks/implementing/` **first** — anything here is in-flight; resume it before starting anything new.
   - then `tasks/todo/` — committed + ready, priority-ordered (`P0` first). Respect each task's `depends_on`.
   - `tasks/ceo-review/` = awaiting CEO; `tasks/done/` = finished; `tasks/backlog/` = future.
3. **Design gate:** a task that builds UI may only enter `implementing/` when every screen it names is `approved` in [design/INVENTORY.md](design/INVENTORY.md). Find the screens in [design/CANVAS-MAP.md](design/CANVAS-MAP.md) (one canvas page per feature) and open only those `.dc.html` files. An undesigned state found mid-build becomes an inventory row plus a small design task; carry on with other work.
4. **To work a task:** move its file `todo/ → implementing/`, set `stage: implementing` + `owner`, do the work, then move to `ceo-review/` with the **Outcome** filled in. Full workflow in [tasks/README.md](tasks/README.md).
5. **Record as you go:** new decisions/learnings → `docs/DECISIONS.md`; correct this file when a rule changes.

Status (2026-11-22, night): M0–M9 live, including the signed Mac app (D-44, `/download/mac`). Also live: DES-01…06, SIDE-05, SIDE-07, SIDE-08 (remove from workspace, D-46), SIDE-09 (save recovery key), DES-05 (rail tidy + delete archived client space, D-45), SEED-01 (JP welcome page + board). Production was wiped to a clean slate (OPS-01). CEO to do: run `pnpm add:system-admin oscar` on production once (needed for SIDE-08 Remove); test confirm by email (SIDE-04). Read docs/PHASES.md "Next session" first.

---

## 1. What this is

**Pasodrum work** = a Slack-polished workspace for our team and our clients, running on our own Matrix server (Continuwuity). Working name; the server name is `pasodrum.work`.

- One company workspace ("Pasodrum") + one separate **client space** per client.
- Clients open a link in the browser and are in. Desktop app optional. Element X works for chat only.
- People never see Matrix concepts (rooms, homeservers, invites to accept, IDs).

**Read these before working:**
- [docs/SPEC.md](docs/SPEC.md) — product + technical spec (the what).
- [docs/DECISIONS.md](docs/DECISIONS.md) — why things are the way they are (ADR log + learnings).
- [design/INVENTORY.md](design/INVENTORY.md) — every screen and its approval status.

---

## 2. Product invariants (do not break)

1. **No Matrix words in the UI.** Channel, not room. Add people, not invite. Workspace / client space, not space. No server names or IDs except in "Another app".
2. **Cut taglines, helper text and secondary labels.** If a screen needs them to make sense, fix the layout instead. Elevate UX, DX and AX together, without breaking things.
3. **The canvas is the visual source of truth** ([[D-21]]). Every screen and visual change is designed and approved on the canvas first, in EN and JP, light and dark; the app matches `design/canvas/`. Nothing ships that isn't in the inventory as `approved`.
4. **Nothing we send breaks standard clients.** Every human-readable message has a full `body`/`formatted_body`; our data rides as extra `work.pasodrum.*` keys. See [[D-05]].
5. **Every feature is removable.** Deleting a feature's folder and its line in `features/index.ts` leaves the app working and old data readable. See [[D-04]].
6. **Clients are kept out by the server, not the UI.** Isolation comes from space membership and restricted joins. See [[D-06]].
7. **No overengineering.** Build what the current milestone needs. Extension points arrive when first used.

---

## 3. Stack

- **Web app** (`apps/web`): Vite, React, TypeScript, React Router, CSS Modules over design tokens, Radix primitives, TipTap composer, i18next (`en`, `ja`), matrix-js-sdk with Rust crypto. See [[D-02]].
- **Invite service** (`services/invite`): Node 24 running TypeScript directly, `node:http`, `node:sqlite`, one npm dependency (`ws`, for the live relay); mail via Resend (prod) or Mailpit's HTTP API (dev). See [[D-07]], [[D-26]], [[D-39]].
- **Server:** Continuwuity behind Caddy; Mailpit for local mail (`dev/`).
- **Tests:** Vitest; Playwright on Chromium **and** WebKit.
- **Repo:** pnpm workspace. Node ≥ 22.
- **Desktop shell:** later (M9), Electron vs Tauri decided by a one-day spike each. Only `platform/` may touch native APIs. See [[D-08]].

---

## 4. How we work

### Boundaries (enforced by lint)
- Only `apps/web/src/matrix/` imports `matrix-js-sdk`. The rest of the app sees our own types.
- Only `apps/web/src/platform/` touches native/browser-shell APIs (notifications, badge, deep links, storage persistence, auth redirect).
- `features/*` never import each other. `app/` reaches features only through the registry.
- `ui/` has no Matrix and no copy (strings come in as props).
- No literal UI strings in JSX; every string is a key in `locales/en.json` and `locales/ja.json` (feature strings live in the feature folder).
- Every Enter handler goes through the shared `isImeEnter()` guard (Japanese IME).

### Recipes
- **Add a feature:** create `features/<id>/index.ts` with `defineFeature({ id, rail?, routes?, channelTabs?, messageParts? })`, add one line to `features/index.ts`, put strings in `features/<id>/locales/{en,ja}.json`, events under `work.pasodrum.<id>.*`. Removal = delete folder + line; CI must stay green.
- **Add a screen:** confirm it's `approved` in `design/INVENTORY.md`, build it with `ui/` primitives, add EN/JP × light/dark screenshots via `/dev/gallery`, add the route.
- **Add a string:** add the key to both `en.json` and `ja.json` (parity check fails otherwise). Never concatenate translated fragments; use interpolation and `Intl.*`.

### Workflow
- **Subagents** for plan/investigate, implement, and review. Parallelize independent work; brief each subagent fully (they lack conversation context).
- **Independent review:** for security- or data-loss-sensitive work, run one Fable review subagent (`model: "fable"`) yourself and fix must-fix findings. Don't ask the CEO to run Codex (CEO, 2026-11-22: "work smarter").
- **File-based task board** in [tasks/](tasks/): `backlog → todo → implementing → ceo-review → done`. See [tasks/README.md](tasks/README.md).
- **Decisions** get logged in DECISIONS.md (ADR-style). **Learnings** get appended there too.
- **Escalate only important decisions** to the CTO/CEO (scope, server choice, security model, anything irreversible). Decide the rest and log it.

### Writing to the CEO
The CEO has ADHD and skims. First line = the action or question; options as 2–4 one-liners, recommendation first; numbered steps; max 5 items per list; no preamble, recap or closer. Full rules: `~/.claude/CLAUDE.md`, from [i-have-adhd](https://raw.githubusercontent.com/ayghri/i-have-adhd/refs/heads/main/skills/i-have-adhd/SKILL.md).

### Coding standards
- Reuse > extend > create. Match existing API shapes and density.
- Don't add features/abstractions/error-handling beyond what the task needs. Trust internal code; validate at boundaries only (user input, server responses, invite service input).
- Default to **no comments**; comment only non-obvious *why*.
- Small diffs. Name files by role, not version.

---

## 5. Testing & CI

- `pnpm check` — the single fast gate (typecheck, lint incl. boundaries, unit tests, locale parity, vocabulary check). Offline, about a minute.
- `pnpm dev:server` — local Continuwuity (server name `pasodrum.localhost`) + Mailpit + invite service + Caddy (rebuilds the invite image). API, `.well-known` and `/api/invites` at http://localhost:8008 (Vite proxies `/api` there), mail UI at http://localhost:8025. `dev:server:logs`, `dev:server:stop`, `dev:server:reset` (wipes data). Needs `dev/.env` (copy `dev/.env.example`).
- First account on a fresh server must use the one-time token printed in `pnpm dev:server:logs`; it becomes the server admin. After that the `REGISTRATION_TOKEN` from `dev/.env` works.
- `pnpm dev:seed` — seeds the canvas workspace (password `pasodrum-dev-password` for all accounts). `pnpm probe` — server capability checks → `docs/probe-results.md`. `pnpm test:invite` — invite service integration tests (needs the stack up and seeded).
- **Production (no staging, D-18):** https://pasodrum.work on Coolify, Docker Compose from `deploy/docker-compose.yml` (Base Directory `/deploy`). Only `web` has a domain; it serves the app and forwards Matrix paths to continuwuity and `/api/invites` to `invite`. Redeploy in Coolify after pushing to `main`. **Production was wiped and rebuilt on 2026-11-22 (OPS-01):** never run `pnpm dev:seed`, `pnpm probe` or `seed-welcome` against it (they need seed accounts). On it: Oscar (server admin, workspace Owner), Shiori, the `@pasodrum` system account and a "Test Client" client space. **Fresh production:** Coolify → Stop → delete the volumes `continuwuity-data` and `invite-data` → Deploy → copy the one-time token from the continuwuity log ("using the registration token …") → `pnpm bootstrap oscar "Oscar"` (first account = admin; makes the empty workspace "Pasodrum" + #general + `#workspace` alias) → `pnpm add:staff <user> "<Name>" admin` for the team → client spaces from the app. Prod env for scripts: `set -a; . dev/.env.production; set +a`.
- **Real people on production:** Shiori is a real user, so never add her to channels/spaces/DMs, sign in as her, or use her for tests or demos (CEO, 2026-11-22). Use Oscar's account or local seed accounts instead.
- `pnpm e2e` — Playwright on Chromium + WebKit against the seeded Docker server (`pnpm dev:server`).
- CI also builds and smoke-tests with an **empty feature registry**.
- **Test only what's really necessary ([[D-30]]):** security/isolation, data loss, and logic that breaks silently. No tests for layout, copy or plain UI wiring — check those in a browser.
- Every milestone exit: `pnpm check` green, browser check in EN/JP × light/dark against the approved designs, Element X smoke test on production.
- For UI work, exercise it in a browser before claiming done; if you can't, say so.

---

## 6. Git

- **Pushing to `main` deploys to production** (Coolify auto-deploy, [[D-21]]). `pnpm check` green and UI checked in a browser before every push.

- Remote: `git@prpl.se:sawariz0r/pasodrum-work.git` (the `prpl.se` SSH alias authenticates as sawariz0r). Work on `main`; branch only when strictly necessary.

- Don't commit unless asked. Create new commits (don't amend published work). Never force-push shared branches or skip hooks unless explicitly told.
- Never commit secrets (`.env`, registration tokens, keys). Add specific files, not `git add -A`.
- Confirm before risky/irreversible or shared-state actions (pushes, deploys, server data wipes).

---

## 7. Pointers

- Plan this repo was bootstrapped from: [docs/SPEC.md](docs/SPEC.md) §6–§8 and DECISIONS D-01…D-13.
- Design canvas (all approved screens): https://claude.ai/artifact/1sFjCeUornYw7f8rReZBtJ (private to the CEO). One canvas page per feature; [design/CANVAS-MAP.md](design/CANVAS-MAP.md) lists every page, section and artboard, so read it instead of the whole `canvas.json`.
- Design gate: [design/INVENTORY.md](design/INVENTORY.md).
