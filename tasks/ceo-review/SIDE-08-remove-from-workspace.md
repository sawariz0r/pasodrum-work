---
id: SIDE-08
title: Remove a person from the workspace (Staff or External)
stage: ceo-review
area: frontend
milestone: side
priority: P1
slice: false
depends_on: []
created: 2026-11-22
owner: lead (SIDE-08 session)
---

## Goal
CEO: "I have no way of deleting users from the workspace. Let's say we bring on an external or an employee quits, how do I delete them?" An Owner or Admin removes a Staff member or an External from the whole workspace in one step, and that person can't sign in any more.

## Plan (lead, 2026-11-22)
Today only Externals can be removed (Workspace settings → People → ⋯ → Remove from Pasodrum, `removeExternal`), and nobody is signed out. SIDE-08 widens that same item to Staff and adds the lock.

- **Where:** Workspace settings → People → ⋯ on a row → **Remove from Pasodrum** (Staff, Admin and External rows). Rule = the target's level is below mine: Owners remove Admins, Staff, Externals; Admins remove Staff and Externals; nobody removes an Owner (Owners step down themselves, D-27) or themselves. That covers "last Owner" too. Clients keep "Remove from space".
- **What it does (one click):**
  1. Invite service: checks the rule server-side, revokes every open join code, drops any held confirm-by-email key, **locks the account** (signed out on every device at once; sign-in refused).
  2. The remover's app: out of the workspace space first, then every workspace channel (incl. ones open to the workspace that I'm not in), every client space and its channels, and page rooms (existing `outOfSpace`/`evict`). Private channels I'm not in can't be reached; the lock covers them.
- **Lock, not deactivate (default):** Continuwuity's HTTP admin lock (MSC4323, `PUT /_matrix/client/v1/admin/lock/{user}`, probed locally on 26.9.4: old tokens get 401 `M_USER_LOCKED`, login refused, unlock works). Reversible; deactivation burns the email/ID forever.
- **Admin power:** the invite service's system account `@pasodrum` becomes a server admin once (`!admin users make-user-admin`, done by `pnpm bootstrap` on fresh servers; one command on production). The browser never holds server-admin rights. Without it the service answers 503 and nothing changes.
- **History:** messages stay; the channel shows the existing "Jonas left the channel" row. DMs stay readable as they are. Issues keep their assignee until someone reassigns.
- **Not in scope:** re-adding a locked person (backlog), clients, a removed-people list.

## Acceptance criteria
- [x] Boards approved on Discovery (SIDE-08 section), EN/JP × light/dark
- [x] Staff/Admin rows get "Remove from Pasodrum" by the level rule; Owner rows and my own row never
- [x] Service endpoint: 403 for non-Owner/Admin callers, for targets at or above the caller, for clients, self and the system account; revokes codes, drops the confirm key, locks
- [x] After removal the person's token gets 401 and they're out of every room the remover can reach (server-side test)
- [x] Other people's memberships untouched (test)
- [x] `pnpm check`, `pnpm test:invite`, browser check on the local stack
- [x] One Fable review subagent on authorisation and data loss; must-fix findings only (CEO, 2026-11-22: replaces the Codex second review)

## Outcome
Built 2026-11-22 (D-46). Boards approved by the CEO (lock as default) and moved to People & access.
- **Service:** `DELETE /api/invites/person?userId=` now removes a person: checks (Owner/Admin, target ranked below, member or External record, not a client by the service's own invites, not self or the system account), locks via MSC4323 as the system account, revokes codes, drops the confirm key. 503 `not-configured` and nothing changes when the system account isn't a server admin.
- **App:** `removeFromWorkspace` replaces `removeExternal`; Staff/Admin rows get Remove from Pasodrum by the level rule; one dialog (`RemovePerson.tsx`) with the sign-out line. A half-finished Staff removal leaves an empty record so it stays listed and can be retried.
- **Setup:** `pnpm add:system-admin [owner]` makes `@pasodrum` a server admin (seed does it locally; bootstrap prints the step).
- **Checks:** `pnpm check` green (356). Remove tests 4/4 and `people.integration` 6/6 against the new service. Full `test:invite` 16/23: the 7 failures are local-stack issues outside this change (dead `#general` 403, relay over a test proxy, SQLite lock), and they also fail on the old container. Browser on the local stack: EN dark menu + dialog and JP dialog match the boards; removing a throwaway Staff → gone from People, token 401 `M_USER_LOCKED`, out of the workspace, level cleared.
- **Review:** one Fable pass (authz + data loss); 2 must-fix fixed (an Admin could lock a client by pulling them into the workspace; a partial Staff run couldn't be retried).
- **Known gaps:** private channels the remover isn't in keep the locked member; channels the target created can't be left (partial); DMs untouched; re-adding a locked person not built. Unverified: whether an Admin could repoint `#workspace` (pinning the workspace room ID in config would close it).
- **Deploy:** after the push, Oscar runs `set -a; . dev/.env.production; set +a; pnpm add:system-admin oscar` once (production has `SYSTEM_PASSWORD` already). Until then Remove answers "Couldn't remove".

## Review notes
(CEO)
