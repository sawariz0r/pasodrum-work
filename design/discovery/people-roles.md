# Discovery: who gets in, and what they see (2026-11-21)

Status: **discovery, not approved.** Boards are on the canvas page "discovery" (row "People & access"). Nothing gets built until the CEO approves them.

## The brief in one line
Owners add Staff, Externals and Clients from one Add people. Staff on a client space invite its clients right there. Externals (freelancers) get only the access we give them, through named **access roles**. Clients never see other clients, other client spaces, or externals outside their project.

## 1. The three people types, mapped onto today

| Brief | Today (D-06, D-25, D-27) | Proposed | Matrix fact |
|---|---|---|---|
| Owner | Owner, PL 100 in the workspace | **Owner** (no change) | PL 100 |
| Staff | Admin (PL 50) and Member (PL 0, joined to the workspace) | **Staff** = today's Member. Admin is retired (decision 1). | Joined to the workspace, **PL 10 everywhere** (today 10 only in client spaces) |
| External | Guest: outside email, in no space, invited to single workspace channels by any Member | **External** = Guest grown up: in no workspace, access given by access roles (and one-off channels) | Not joined to the workspace. **PL 1** in each room they're in (a marker that grants nothing) |
| Client | Client: joined to one client space, PL 0 | **Client** (no change) | Joined to one client space, PL 0 |

So we keep four levels: Owner 100, Staff 10, External 1, Client/everyone else 0. Admin (50) stays as a number nothing hands out.

Why PL 1 for externals: every member of a room can read power levels, and our app, the server and Element X all see the same thing. A client in Nordlys can tell "Mika works with Pasodrum" from "Henrik is a fellow client" without reading anything they shouldn't. The level unlocks nothing, because no action anywhere is set to 1.

## 2. Access roles (for Externals)
An **access role** is a name, a colour, and a list of places:
- **workspace channels**, chosen one by one (public or private);
- **client spaces**, as a whole. Joining a client space opens every channel in it, because those channels are restricted to the space (D-06). There is no per-channel pick inside a client space in v1 (decision 6).

People get roles assigned. One external can hold several roles; their access is the union of those roles plus any **one-off channels** an Owner added them to straight from a channel's Add people (today's guest flow, kept).

Examples: "Nordlys designers" = #design + Nordlys. "Translators" = #jp-copy + #en-copy.

Roles are only for Externals. Staff see the whole workspace. Clients see their own client space.

### Where it is stored
In the **workspace space**, as state that only Owners can write (event level 100):
- `work.pasodrum.access_role` (state key = role id): `{name, colour, channels: [roomId], spaces: [roomId]}`
- `work.pasodrum.external` (state key = user id): `{roles: [roleId], channels: [roomId]}`; `channels` holds the one-off adds

Externals and clients aren't in the workspace, so they can't read role names, other people's assignments, or that roles exist at all. Staff can read them, which is fine.

## 3. Enforced by the server, not the UI
The role is our record of what someone *should* reach. What they *can* reach is only their Matrix memberships:
- Workspace channels are restricted to the workspace space (or invite-only when private). Externals aren't in the workspace, so the server refuses every channel they weren't invited to.
- Client spaces are invite-only and their channels are restricted to the space. An external reaches a client space only after being invited to that space.
- **Membership follows the role:** when an Owner saves a role, or assigns or removes one, the Owner's app invites the external to newly covered rooms (and sets PL 1 there), and removes them from rooms nothing else covers. Failures show up inline on that screen. There's no background job: the invite service stays powerless (D-07).
- If saving stops halfway, the person has less access (or keeps old access) until the Owner saves again. They never get *more* than the server membership allows. The role screen marks a person whose rooms don't match their roles ("Not applied", with Apply).
- You can only grant what you're in: the channel picker lists channels the Owner is a member of. A private channel the Owner isn't in can't go into a role.
- **"Not applied" compares real memberships, invites included, in both directions.** It also flags a room the Owner can no longer remove someone from, such as a private channel the Owner has since left (removing needs level 50 and a joined Owner). If two Owners save at the same moment, the last save wins.
- **Removal order:** remove the person from the space first, then from its channels. While they're still in the space, they could rejoin its restricted channels. Today's `removeFromSpace` does it the other way round and needs flipping. Removing also clears their level-1 entry, so the same email invited later as a client doesn't show as an External.
- **Auto-accept gets stricter** (`trusts()` in `store.ts`, found in review). Today we accept any room from someone who shares a space with me. An External on Nordlys and Kumo could make a room, invite a client from each, and both would join and see each other. New rule: accept a channel only when it's inside one of my spaces, and a DM or group DM only when every member shares one space with me. Anything else waits unanswered.

## 4. Who may do what

| | Owner | Staff | External | Client |
|---|---|---|---|---|
| Add Staff (to the workspace) | ✓ | — | — | — |
| Put Staff on a client space | ✓ | — | — | — |
| Add an External, assign or edit access roles | ✓ | — (decision 4) | — | — |
| Invite Clients to a client space | ✓ | ✓ on client spaces they're on | — | — |
| Create client spaces | ✓ | — | — | — |
| Create channels | ✓ | ✓ (workspace, and client spaces they're on) | — | — |
| See the workspace member list | ✓ | ✓ | — | — |
| See role names and assignments | ✓ | ✓ (read only) | — | — |
| Join channels | all | all public in the workspace + their client spaces | only what roles and one-offs give | their client space |
| Remove people | anyone but themselves | — | — | — |

**What the server enforces and what only the UI enforces.** Matrix's `invite` right can't tell *who* is being added. Staff at 10 can therefore invite any existing account, an External included, into a workspace channel or a client space they're on, using Element X or the API. Our UI doesn't offer that. We accept this because Staff are trusted. The server-side alternative is `invite` 100 in public workspace channels: colleagues join them through the workspace on their own, so only private channels would need Staff inviting. The catch is that Staff could no longer "add" a colleague to a public channel (decision 8).

## 5. Power-level changes (amends D-27)
- **Workspace space:** Staff at 10 (was 0). `invite` 100 (was 50: only Owners add Staff). New event types `work.pasodrum.access_role` and `work.pasodrum.external` at 100.
- **Workspace channels:** Staff at 10. **`invite` 0 → 10.** This closes a hole we have today: at 0, a guest can invite any account into the channel by ID, and IDs come from emails (D-07).
- **Client spaces and their channels:** unchanged (Staff 10, `invite` 10, `m.space.child` 10). Externals at 1.
- **Externals:** 1 in every room they're in, 0 everywhere else.
- `m.room.power_levels` stays 50, so Owners (100) set levels and Staff don't.
- **Invite service** (`rules.ts`): roles become `staff | external | client`. Staff = Owner only, into the workspace. External = Owner only, rooms across the workspace and client spaces, each one checked with `isGenuine`. Client = PL ≥ 10 in that client space. Today the service asks for 50 for clients. That blocks Staff at 10 from inviting client emails, which is likely half of "there's no clear way to invite".
- **Revoking codes:** today `revokePerson` revokes per space and needs level 50 there. An External's code lives under the workspace, so we add an Owner-only "revoke everything for this person".

## 6. Migration (one Owner-run script, like `migrate:pins`)
- Owners stay Owners.
- Admins become Owners or Staff, the CEO's pick for each person (decision 1).
- Members become Staff: PL 10 in the workspace and every workspace channel the Owner can edit. Client-space levels don't change.
- Guests become Externals: a `work.pasodrum.external` record with their current channels as one-off channels, and PL 1 in those channels. Nobody gains or loses access.
- Clients don't change.
- Pending invites: the service reads `member` as `staff` and `guest` as `external`.
- The script lists private channels it couldn't edit because the Owner isn't in them, so their members can fix them by hand. Until then, `invite` stays at 0 there.
- **The client-space mark is re-sent as an Owner.** A client space counts as genuine only if an Owner or Admin of the workspace sent its `work.pasodrum.space` event (`isGenuine`). One sent by an Admin who becomes Staff would stop counting, and invites there would fail closed. The migration re-sends that event for every client space as an Owner.

## 7. Isolation guarantees
1. **A client reaches only their client space.** Unchanged: the server refuses workspace channels (restricted to the workspace) and other client spaces (invite-only). The client's-eye suite still passes.
2. **A client sees only the people in their client space's rooms:** its Staff, the Externals given that space, and fellow clients of that space. No other clients, no other externals, no role names.
3. **An external in two client spaces doesn't connect them.** Nordlys clients see Mika in Nordlys and nothing of Kumo. Membership in Kumo rooms isn't visible from Nordlys rooms, and the shared profile is name and avatar only (plus the work email, D-29).
4. **An external reaches only invited rooms.** They're not in the workspace, so restricted joins never let them in, and Browse only shows channels they're in or can join (granted client spaces).
5. **Externals add nobody and create nothing.** `invite` and `m.space.child` are 10 everywhere and externals sit at 1. They can't touch levels, and they can't read the role records.
6. **Removing someone is complete:** they're removed from every room, and their open join codes are revoked (as Remove from space does today). Messages they already saw stay with them (Matrix can't take those back).
7. **Known gaps (not new, accepted at our size):**
   - Any account can send a DM invite to any ID it knows, and IDs come from emails. Our app only auto-accepts invites from inside the person's own space, so a stray invite waits unanswered.
   - Any account can create its own room. `isGenuine` already stops a home-made "client space".
   - A room's creator outranks every level (v12, D-27). Externals and clients can't create rooms inside our spaces, so this doesn't reach them.
   - Anyone with an account can probably check whether an account exists and read its profile by ID. That covers `/profile` (including the work email, D-29), `/keys/query` and `/register/available`. IDs are guessable from emails. We need an external's-eye probe to confirm what Continuwuity answers, and also to confirm that `/hierarchy` and `/summary` on a space you're not in return 403.
   - An External given a client space can read all of its earlier history (`history_visibility: shared`). The role screen says so where client spaces are picked.
   - Staff can invite existing accounts anywhere they hold `invite` (see §4).

## 8. Screens (boards on "discovery")
1. **Add people**: one dialog. Type first (Staff / External / Client, showing only the types you may add from where you opened it), then who, then where:
   - Staff: client spaces to put them on;
   - External: roles, or one-off channels;
   - Client: which client space (prefilled from the client space you opened it in).
2. **Client space settings → People**: an invite field at the top of the tab (email, Add), then the team (Staff and Externals with their mark), Clients, and Pending.
3. **Workspace settings → People**: Owners, Staff and Externals; each external shows their role chips. A role menu on each row.
4. **Workspace settings → Access**: a list of roles on the left. The selected role on the right has its name, colour, channels, client spaces and people.
5. **What an External sees**: the Pasodrum tile with only their channels, plus a tile for each client space they're given. No Browse in Pasodrum, no +, no Add people.
6. One JP board (Add people, External).

## Recommendation
Four levels (Owner 100 / Staff 10 / External 1 / Client 0). Externals stay out of the workspace space, and access roles decide which rooms they're invited to. Owners alone manage Staff, Externals and roles. Staff invite Clients on their client spaces. Guests become Externals with no change in access.

## Decisions for the CEO
1. **Retire Admin?** Recommended: yes. UI shows Owner and Staff only; existing Admins become Owner or Staff (your pick for each).
2. **Guests become Externals?** Recommended: yes, one kind of outside person who isn't a client.
3. **One-off channels for Externals as well as roles?** Recommended: yes, from a channel's Add people (today's guest flow). Without it, one channel for one freelancer means making a role.
4. **Who adds Externals?** Recommended: Owners only. The alternative is that Staff may add an External to a channel they're in.
5. **How clients see Externals:** as part of the Pasodrum team, with no mark (recommended), or tagged "External".
6. **Client space access in a role is all-or-nothing in v1?** Recommended: yes. Per-channel inside a client space can come later.
7. **Words:** "Staff / External / Client", tab "Access", items "roles". JP: スタッフ / 外部 / クライアント, アクセス, ロール.
8. **Should the server also stop Staff inviting Externals?** Recommended: no. Staff are trusted, and the UI is enough. The alternative is `invite` 100 in public workspace channels, which costs "add a colleague to a public channel".

## Security review (Fable, 2026-11-21)
Folded in above:
- the auto-accept bridge across client spaces;
- the limit on what Staff can do through the API;
- removal order and drift in both directions;
- revoke-all for a person;
- re-sending the client-space mark in the migration;
- the probe and history gaps;
- clearing level 1 on removal.

Confirmed OK:
- PL 1 grants nothing (every restricted action is at 10 or more);
- removing someone who is only invited cancels the invite;
- client spaces have no links to each other;
- role state lives only in the workspace.
