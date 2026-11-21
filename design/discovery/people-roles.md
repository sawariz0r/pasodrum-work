# Discovery: who gets in, and what they see (2026-11-21)

Status: **approved by the CEO (2026-11-21): the model and all 28 boards** (canvas version 44, page "discovery", "Discovery — People and access"). For the lead:
- move the boards to the ui page;
- add the inventory rows below;
- log D-35 (at the end of this note).

### Proposed `design/INVENTORY.md` rows (approved 2026-11-21)
| Screen | Boards | Status |
|---|---|---|
| Add people: pick a type (Staff / External / Client), then where | PeopleAddStaff, PeopleAddExternal, PeopleAddClient, PeopleAddExternalJP, PeopleAddDark | approved 2026-11-21 |
| Add people in a client space (Staff: clients only) | PeopleAddNordlys | approved 2026-11-21 |
| Add people to a channel; Staff colleagues only, with the error | PeopleAddChannel, PeopleAddStaffOnly | approved 2026-11-21 |
| Client space settings → People with an invite field (replaces SpacePeople's Add people row) | PeopleSpaceInvite, PeopleSpaceInviteJP, PeopleSpaceInviteDark | approved 2026-11-21 |
| Workspace settings → People (new) | PeopleWorkspace, PeopleWorkspaceJP, PeopleWorkspaceDark | approved 2026-11-21 |
| Remove an External from Pasodrum | PeopleRemoveExternal, PeopleRemoveExternalJP | approved 2026-11-21 |
| Workspace settings → Access: roles, new role, not applied | PeopleAccess, PeopleAccessNew, PeopleAccessNotApplied, PeopleAccessJP, PeopleAccessDark | approved 2026-11-21 |
| What an External sees (Pasodrum, a client space) | PeopleExternalView, PeopleExternalNordlys, PeopleExternalJP, PeopleExternalDark | approved 2026-11-21 |
| What a client sees of an External (part of the team) | PeopleClientSeesTeam, PeopleClientSeesTeamJP | approved 2026-11-21 |
| Rules: people and access | PeopleRules | approved 2026-11-21 |

These supersede the Guest boards (GuestShell, GuestShellJP), the Member/Guest segments in AddPeople and AddPeopleMember, and the Add people row in SpacePeople.

## The brief in one line
Owners and Admins add Staff, Externals and Clients from one Add people. Staff on a client space invite its clients right there. Externals (freelancers) get only the access we give them, through named **access roles**. Clients never see other clients, other client spaces, or externals outside their project.

## 1. The people types, mapped onto today

| Type | Today (D-06, D-25, D-27) | Agreed | Matrix fact |
|---|---|---|---|
| Owner | Owner | **Owner** (no change) | Level 100 |
| Admin | Admin | **Admin** (no change): Owner-like rights, but can't change or remove Owners | Level 50 |
| Staff | Member: joined to the workspace, level 0 | **Staff** = today's Member | Joined to the workspace, **level 10 everywhere** (today 10 only in client spaces) |
| External | Guest: outside email, in no space, added to single workspace channels by any Member | **External** = Guest grown up. In no workspace; access comes from access roles and one-off channels | Not joined to the workspace. **Level 1** in each room they're in (a mark that grants nothing) |
| Client | Client: joined to one client space, level 0 | **Client** (no change) | Joined to one client space, level 0 |

Five levels: Owner 100, Admin 50, Staff 10, External 1, Client and everyone else 0.

Why level 1 for externals: every member of a room can read power levels, so our app, the server and Element X all see the same thing. It tells "works with Pasodrum" apart from "fellow client" without anyone reading what they shouldn't. It unlocks nothing, because no action anywhere is set to 1.

## 2. Access roles (for Externals)
An **access role** is a name, a colour, and a list of places:
- **workspace channels**, chosen one by one, public or private;
- **client spaces**, as a whole. Joining a client space opens every channel in it, because those channels are restricted to the space (D-06). There's no picking single channels inside a client space in v1 (CEO: "stick with that for now").

People get roles assigned. One External can hold several roles. Their access is the union of those roles plus any **one-off channels**, added straight from a channel's Add people (today's guest flow, kept).

Examples: "Nordlys designers" = #design-studio + Nordlys. "Translators" = #launch-site + Kumo.

Roles are only for Externals. Staff see the whole workspace; Clients see their own client space.

### Where it's stored
In the **workspace space**, as state that only Owners and Admins can write (event level 50):
- `work.pasodrum.access_role` (state key = role id): `{name, colour, channels: [roomId], spaces: [roomId]}`
- `work.pasodrum.external` (state key = user id): `{roles: [roleId], channels: [roomId]}`, where `channels` holds the one-off adds

Externals and clients aren't in the workspace, so they can't read role names, other people's assignments, or even that roles exist. Staff can read them, which is fine.

## 3. Enforced by the server, not the UI
The role records what someone *should* reach. What they *can* reach is only their Matrix memberships:
- Workspace channels are restricted to the workspace space, or invite-only when private. Externals aren't in the workspace, so the server refuses every channel they weren't invited to.
- Client spaces are invite-only and their channels are restricted to the space. An External reaches a client space only after being invited to it.
- **Membership follows the role.** When an Owner or Admin saves a role, or assigns or removes one, their app does two things. It invites the External to newly covered rooms and sets level 1 there. It removes them from rooms nothing else covers. Failures show inline on that screen. There's no background job: the invite service stays powerless (D-07).
- If saving stops halfway, the person has less access (or keeps old access) until someone applies again. They never get more than their server memberships allow.
- **"Not applied"** marks a person whose rooms don't match their roles, with an Apply button. The check compares real memberships, invites included, in both directions. It also flags a room the editor can no longer remove them from, such as a private channel the editor has since left; removing needs level 50 and a joined remover. If two people save at the same moment, the last save wins.
- **You can only grant what you're in.** The channel picker lists the channels you're a member of.
- **Removal order:** out of the space first, then its channels. Otherwise the person could rejoin restricted channels in between. Today's `removeFromSpace` does it the other way round and needs flipping. Removal also clears their level-1 entry.
- **Auto-accept gets stricter** (`trusts()` in `store.ts`, found in review). Today we accept any room from someone who shares a space with me. An External on Nordlys and Kumo could make a room and invite a client from each; both would join and see each other. New rule: accept a channel only when it's inside one of my spaces. Accept a DM or group DM only when every member shares one space with me. Anything else waits unanswered.

## 4. Who may do what

| | Owner | Admin | Staff | External | Client |
|---|---|---|---|---|---|
| Add Staff to the workspace | ✓ | ✓ | — | — | — |
| Put Staff on a client space | ✓ | ✓ | — | — | — |
| Add an External; create, edit and assign roles | ✓ | ✓ | — | — | — |
| Add an existing person to a channel | ✓ | ✓ | ✓ colleagues | — | — |
| Invite Clients to a client space | ✓ | ✓ | ✓ on their client spaces | — | — |
| Create client spaces | ✓ | ✓ | — | — | — |
| Create channels | ✓ | ✓ | ✓ | — | — |
| Change roles (D-25) | anyone | Staff ↔ Admin | — | — | — |
| Remove people | anyone but themselves | not Owners or Admins | — | — | — |
| See role names and assignments | ✓ | ✓ | read only | — | — |

**What the server enforces and what only the UI enforces.** Matrix's `invite` right can't tell *who* is being added. Staff at 10 can therefore invite any existing account, an External included, into a workspace channel or client space they're on, through Element X or the API. Our UI doesn't offer it. Accepted: Staff are trusted (CEO).

## 5. Power-level changes (amends D-27)
- **Workspace space:** Staff at 10 (was 0). `invite` stays 50, so Owners and Admins add Staff. New event types `work.pasodrum.access_role` and `work.pasodrum.external` at 50.
- **Workspace channels:** Staff at 10. **`invite` goes from 0 to 10.** This closes a hole we have today: at 0, a guest can invite any account into the channel by ID, and IDs come from emails (D-07).
- **Client spaces and their channels:** unchanged (Staff 10, `invite` 10, `m.space.child` 10). Externals at 1.
- **Externals:** 1 in every room they're in, 0 everywhere else.
- `m.room.power_levels` stays 50: Owners and Admins set levels, Staff don't.
- **Invite service** (`rules.ts`): roles become `staff | external | client`.
  - Staff: Owner or Admin (≥ 50), into the workspace.
  - External: Owner or Admin. Their rooms can span the workspace and client spaces, and each one is checked with `isGenuine`.
  - Client: level ≥ 10 in that client space. Today the service asks for 50, which blocks Staff at 10 from inviting client emails. That's likely half of "there's no clear way to invite".
- **Revoking codes:** today `revokePerson` revokes one space at a time and needs level 50 there. An External's code lives under the workspace, so we add "revoke everything for this person" for Owners and Admins.

## 6. Migration (one script run by an Owner, like `migrate:pins`)
- Owners and Admins stay as they are.
- Members become Staff: level 10 in the workspace and in every workspace channel the Owner can edit. Client-space levels don't change.
- Guests become Externals: a `work.pasodrum.external` record with their current channels as one-off channels, and level 1 in those channels. Nobody gains or loses access.
- Clients don't change.
- Pending invites: the service reads `member` as `staff` and `guest` as `external`.
- The script lists the private channels it couldn't edit because the Owner isn't in them, so their members can fix them by hand. Until then, `invite` stays 0 there.
- `isGenuine` (only an Owner or Admin can mark a client space) is unaffected, because Admins stay. If an Admin who marked a client space later becomes Staff, invites there fail closed; re-sending the mark as an Owner fixes it.

## 7. What people see (agreed and decided)
- **Clients see Externals as part of the Pasodrum team** (my call, the CEO asked). They're grouped with the team in member lists and on profile cards, with no tag and no mark. From the client's side they work for us and we answer for them. A tag would invite "who's this?" and expose how we staff projects.
- **The team sees Externals with the amber outside mark and an "External" tag**, so it's always clear who's outside.
- **Externals see the outside mark on clients**, like Staff do (they work for us and should know when a client is present). They see no role names.
- **An External can start DMs** only with people they share a room with. New message lists only them; the server limit comes from the stricter auto-accept rule.

## 8. Isolation guarantees
1. **A client reaches only their client space.** Unchanged. The server refuses workspace channels (restricted to the workspace) and other client spaces (invite-only). The client's-eye suite still passes.
2. **A client sees only the people in their client space's rooms:** its Staff, the Externals given that space, and fellow clients of that space. No other clients, no other Externals, no role names.
3. **An External in two client spaces doesn't connect them.** Nordlys clients see Ola in Nordlys and nothing of Kumo. With the stricter auto-accept rule, a room an External makes can't pull clients from different spaces together.
4. **An External reaches only invited rooms.** They're not in the workspace, so restricted joins never let them in. Browse only shows channels they're in, or can join in client spaces they've been given.
5. **Externals add nobody and create nothing.** `invite` and `m.space.child` are 10 everywhere, and Externals sit at 1. They can't touch levels or read the role records.
6. **Removing someone is complete:** they're taken out of the space first, then every room, and all their open join codes are revoked. What they already read stays with them (Matrix can't take it back).
7. **Known gaps, accepted at our size:**
   - Any account can send a DM invite to any ID it knows, and IDs come from emails. Such an invite now simply waits unanswered.
   - Any account can create its own room. `isGenuine` already stops a home-made "client space".
   - Anyone with an account can probably check that an account exists and read its profile by ID: `/profile` (work email included, D-29), `/keys/query`, `/register/available`. An external's-eye probe should confirm this, and that `/hierarchy` and `/summary` on a space you're not in return 403.
   - An External given a client space reads its earlier history (`history_visibility: shared`). The Access screen says so beside Client spaces.
   - Staff can invite existing accounts anywhere they hold `invite` (§4).

## 9. Screens (boards on "discovery")
| Screen | Boards |
|---|---|
| **Add people** (Owner/Admin, from the sidebar or workspace menu): the type first (Staff / External / Client), then who, then where | PeopleAddExternal, PeopleAddStaff, PeopleAddClient, PeopleAddExternalJP, PeopleAddDark |
| **Add people in a client space** (Staff): clients only, no type, no "where" | PeopleAddNordlys |
| **Add people to a channel:** no type picker. Names are colleagues or existing Externals; a new outside email is tagged External (a one-off for that channel) | PeopleAddChannel |
| **Add people to a channel, as Staff:** colleagues only. An email gets the "Only Owners and Admins add new people" error | PeopleAddStaffOnly |
| **Client space settings → People:** an invite field at the top, then team (with Externals), client, pending | PeopleSpaceInvite, PeopleSpaceInviteJP, PeopleSpaceInviteDark |
| **Workspace settings → People** (new; Owners and Admins, from the workspace menu): filters, role chips, a row menu with roles | PeopleWorkspace, PeopleWorkspaceJP, PeopleWorkspaceDark |
| **Remove an External from Pasodrum:** lists everything they lose | PeopleRemoveExternal, PeopleRemoveExternalJP |
| **Workspace settings → Access:** the role manager, a new role, a person not applied | PeopleAccess, PeopleAccessNew, PeopleAccessNotApplied, PeopleAccessJP, PeopleAccessDark |
| **What an External sees,** in Pasodrum and in a client space | PeopleExternalView, PeopleExternalNordlys, PeopleExternalJP, PeopleExternalDark |
| **What a client sees of an External** (part of the team) | PeopleClientSeesTeam, PeopleClientSeesTeamJP |

## CEO answers (2026-11-21)
1. **Admin:** keep all three. Owner; Admin with Owner-like rights; Staff.
2. **Guests become Externals:** yes.
3. **One-off channels for Externals as well as roles:** yes.
4. **Who adds Externals:** Owners and Admins.
5. **How clients see Externals:** CEO unsure and asked for my view. Decided: as part of the Pasodrum team, no tag (§7).
6. **A client space in a role is all or nothing:** yes, for now.
7. **Words:** Staff / External / Client, "Access", "roles". JP: スタッフ / 外部 / クライアント, アクセス, ロール.
8. **Should the server also stop Staff inviting Externals:** no, Staff are trusted.

## Proposed DECISIONS entry (for the lead to log when the boards are approved)
**D-35 · People types and access roles, amends D-06/D-25/D-27 · Accepted (model and boards approved by the CEO) · 2026-11-21**
- Owner 100, Admin 50, Staff 10 (today's Member, now 10 in workspace rooms too), External 1 (mark only), Client 0.
- Guests become Externals. Externals never join the workspace space. Owners and Admins give them access through access roles (`work.pasodrum.access_role`, `work.pasodrum.external` in the workspace, level 50) and one-off channels; the editor's app makes membership follow.
- `invite` goes from 0 to 10 in workspace channels.
- Invite service: client invites need level 10, roles are staff/external/client, and there's a revoke-all for a person.
- Auto-accept: channels only from inside my spaces; DMs only when every member shares a space with me.
- Removal: the space first, then channels.
- Clients see Externals as team. The team and Externals see the outside mark.

## Security review (Fable, 2026-11-21)
Folded in above:
- the auto-accept bridge across client spaces;
- what Staff can do through the API;
- removal order and drift checked in both directions;
- revoke-all for a person;
- the client-space mark;
- the probe and history gaps;
- clearing level 1 on removal.

Confirmed OK:
- level 1 grants nothing (every restricted action is at 10 or more);
- removing someone who is only invited cancels the invite;
- client spaces have no links to each other;
- role state lives only in the workspace.
