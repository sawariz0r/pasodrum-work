# AGENTS.md — Pasodrum work

Operating guide for any coding agent (or human) working in this repo. Read this first, then the doc it points to for your task. Keep it current: when a rule is corrected or a decision changes, update this file and [docs/DECISIONS.md](docs/DECISIONS.md).

---

## 0. Start here (every session)

You start with **no memory of prior chats** — orient yourself like this:

1. **Read this file**, then skim [docs/SPEC.md](docs/SPEC.md) (scope + milestones) and [docs/DECISIONS.md](docs/DECISIONS.md) (what's decided + why).
2. **Check the board** in [tasks/](tasks/) — it's the **cross-session source of truth**:
   - `tasks/implementing/` **first** — anything here is in-flight; resume it before starting anything new.
   - then `tasks/todo/` — committed + ready, priority-ordered (`P0` first). Respect each task's `depends_on`.
   - `tasks/ceo-review/` = awaiting CEO; `tasks/done/` = finished; `tasks/backlog/` = future.
3. **Design gate:** a task that builds UI may only enter `implementing/` when every screen it names is `approved` in [design/INVENTORY.md](design/INVENTORY.md). An undesigned state found mid-build becomes an inventory row plus a small design task; carry on with other work.
4. **To work a task:** move its file `todo/ → implementing/`, set `stage: implementing` + `owner`, do the work, then move to `ceo-review/` with the **Outcome** filled in. Full workflow in [tasks/README.md](tasks/README.md).
5. **Record as you go:** new decisions/learnings → `docs/DECISIONS.md`; correct this file when a rule changes.

Status (2026-11-20): Plan approved (D-01…D-17). Design Batch A approved. In ceo-review: M0-01…M0-03 (workspace, local server, seed + probe — all must-haves pass), M1-01 (tokens + ui/ primitives, `/dev/gallery`), M1-02 (EN/JP strings, IME guard, locale check), M1-03 (web platform). M0-04 in progress: staging on the CEO's Coolify (D-17), waiting for repo `sawariz0r/pasodrum-work` + Coolify resource. Next: M0-05 Element X test → M0-06 go/no-go → M1-04 (session + sync), M1-05 (shell + registry). Open design item: sign-in dark values need approval (INVENTORY).

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
3. **Every screen is designed and approved first,** in EN and JP, light and dark. Nothing ships that isn't in the inventory as `approved`.
4. **Nothing we send breaks standard clients.** Every human-readable message has a full `body`/`formatted_body`; our data rides as extra `work.pasodrum.*` keys. See [[D-05]].
5. **Every feature is removable.** Deleting a feature's folder and its line in `features/index.ts` leaves the app working and old data readable. See [[D-04]].
6. **Clients are kept out by the server, not the UI.** Isolation comes from space membership and restricted joins. See [[D-06]].
7. **No overengineering.** Build what the current milestone needs. Extension points arrive when first used.

---

## 3. Stack

- **Web app** (`apps/web`): Vite, React, TypeScript, React Router, CSS Modules over design tokens, Radix primitives, TipTap composer, i18next (`en`, `ja`), matrix-js-sdk with Rust crypto. See [[D-02]].
- **Invite service** (`services/invite`): Node, SQLite, SMTP. See [[D-07]].
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
- **Independent review:** for deeper review, ask the CEO to run a different model (e.g. Codex) for an independent pass. Cross-model review is valued.
- **File-based task board** in [tasks/](tasks/): `backlog → todo → implementing → ceo-review → done`. See [tasks/README.md](tasks/README.md).
- **Decisions** get logged in DECISIONS.md (ADR-style). **Learnings** get appended there too.
- **Escalate only important decisions** to the CTO/CEO (scope, server choice, security model, anything irreversible). Decide the rest and log it.

### Coding standards
- Reuse > extend > create. Match existing API shapes and density.
- Don't add features/abstractions/error-handling beyond what the task needs. Trust internal code; validate at boundaries only (user input, server responses, invite service input).
- Default to **no comments**; comment only non-obvious *why*.
- Small diffs. Name files by role, not version.

---

## 5. Testing & CI

- `pnpm check` — the single fast gate (typecheck, lint incl. boundaries, unit tests, locale parity, vocabulary check). Offline, about a minute.
- `pnpm dev:server` — local Continuwuity (server name `pasodrum.localhost`) + Mailpit + Caddy. API and `.well-known` at http://localhost:8008, mail UI at http://localhost:8025. `dev:server:logs`, `dev:server:stop`, `dev:server:reset` (wipes data). Needs `dev/.env` (copy `dev/.env.example`).
- First account on a fresh server must use the one-time token printed in `pnpm dev:server:logs`; it becomes the server admin. After that the `REGISTRATION_TOKEN` from `dev/.env` works.
- `pnpm dev:seed` — seeds the canvas workspace (password `pasodrum-dev-password` for all accounts). `pnpm probe` — server capability checks → `docs/probe-results.md`.
- **Staging:** Coolify, Docker Compose from `deploy/docker-compose.yml`. Seed/probe it with `set -a; . dev/.env.staging; set +a; pnpm dev:seed && pnpm probe` (results in `docs/probe-results-<server>.md`).
- `pnpm e2e` — Playwright on Chromium + WebKit against the seeded Docker server (`pnpm dev:server`).
- CI also builds and smoke-tests with an **empty feature registry**.
- Every milestone exit: `pnpm check` green, e2e green on both engines, manual Safari + Japanese IME pass, Element X smoke test on staging, screens match approved designs in EN/JP × light/dark.
- For UI work, exercise it in a browser before claiming done; if you can't, say so.

---

## 6. Git

- Remote: `git@prpl.se:sawariz0r/pasodrum-work.git` (the `prpl.se` SSH alias authenticates as sawariz0r). Work on `main`; branch only when strictly necessary.

- Don't commit unless asked. Create new commits (don't amend published work). Never force-push shared branches or skip hooks unless explicitly told.
- Never commit secrets (`.env`, registration tokens, keys). Add specific files, not `git add -A`.
- Confirm before risky/irreversible or shared-state actions (pushes, deploys, server data wipes).

---

## 7. Pointers

- Plan this repo was bootstrapped from: [docs/SPEC.md](docs/SPEC.md) §6–§8 and DECISIONS D-01…D-13.
- Design canvas (all approved screens): https://claude.ai/artifact/1sFjCeUornYw7f8rReZBtJ (private to the CEO).
- Design gate: [design/INVENTORY.md](design/INVENTORY.md).
