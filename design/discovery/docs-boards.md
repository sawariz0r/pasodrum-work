# Discovery: Docs and Boards (concept note, 2026-11-21)

Status: **approved by the CEO 2026-11-21** (the batch on canvas version 45, Discovery page). The lead session moves the boards to the "ui" page, logs D-35 and writes the build tasks. The draft is in the side-session note `docs-boards-approval-handover.md`.

## CEO answers (2026-11-21)
1. Per space, not per channel. Channel tabs for docs/boards (Slack-style) may come later; not decided.
2. Clients edit and comment in their own client space.
3. Translate is staff/team only. No exception for client-space docs.
4. Four default columns are fine; the team can add columns (clients can't). A custom column has one title, shown as typed (a Japanese client's board just gets Japanese titles). Default columns are named by the app in each language.
5. Cursors ship after typing, and stay dead simple.
6. The selected space tile scopes Docs and Boards. In a client space tile you see only that client space's pages and projects (My issues too). In the Pasodrum tile staff see the workspace plus every client space they're in, grouped by space. Clients only have their own tile.
7. Clients create pages and issues in their own client space (not just edit and comment).
8. Staff get Translate on issue cards whose title is in the other language.
9. Docs translate a section at a time (a heading and what's under it), each with its own Show original, so you only translate what you need. No whole-page translation.
10. Quick add: a faint + under a column's last card opens a minimal card; type a title, Enter creates. The New issue dialog stays.

## Docs (Notion-style blocks, Obsidian-style links)
- **Objects:** a *page* has a title, blocks and child pages. Blocks: text, headings, bullet, numbered and check lists, quote, callout, code, divider, table, image/file, and inline chips for a person (@), another page ([[ ]]) and an issue. You add blocks with the `+` beside a line or by typing `/`. Markdown shortcuts work but aren't advertised.
- **Tree:** the sidebar shows each space's pages as a tree (Pasodrum, then each client space). Pages nest. **Linked from** at the bottom of a page lists the pages that link to it (Obsidian backlinks), and nothing more.
- **Flows:** new page (sidebar `+`, or a child page from a block); move a page by dragging it in the tree; share by copying its link. A link pasted in chat shows a doc card. Standard clients see the plain link (D-05 rule 2).
- **Multiplayer:** avatars of who's on the page, "森 is typing…", each person's caret and selection in their avatar colour with a name flag. No "Saved" label: the page shows a line only when it's offline.

## Boards (Linear/Plane-style)
- **Objects:** *project* (name, colour) → *issue* (short ID like WEB-18, title, description, status, assignee, due date, comments). Columns: four defaults (To do · In progress · In review · Done), named by the app in each language. The team can add, rename and reorder columns; a custom column has one title, shown as typed. Done dims its issues and keeps them out of My issues. No priority, labels, cycles or estimates in v1.
- **Views:** Board (columns by status, drag between them) and List (grouped by status). Filter by assignee. **My issues** gathers everything assigned to you across projects. An issue opens in a side panel, like a thread, so the board stays in view.
- **Issue panel:** status, assignee and due date as one-click fields; description using the same blocks as Docs; activity ("Jonas moved this to In review") with comments in between. Comments get reactions and @mentions, as in chat.

## Where they live, and who sees them
- **Per space, not per channel:** the workspace has its own pages and projects, and so does each client space. The selected space tile scopes the sidebar: a client space tile shows only that client space; the Pasodrum tile shows the workspace plus every client space you're in, grouped by space (CEO answer 6).
- **Clients see the docs and projects in their own client space and nothing else.** The server enforces this: every page and project room is restricted to its space (D-06). Clients can edit and comment there. Staff-only notes about a client live in the workspace, because a client space has no staff-only rooms (D-06).
- **Later:** a doc or project as a channel tab (`work.pasodrum.tab`, ref = its room). It isn't needed to start.

## Translation (team only, D-32)
- **Docs:** translate one section at a time: hovering a section in the other language shows a translate button beside its first line; the section (heading and the blocks under it) then reads in your language with **Show original** under its heading. One request per section, one segment per block, cached per block (content hash). Clicking into a translated section to edit shows the original.
- **Boards:** a translate icon on a comment's hover bar, on the issue title and description, and on a card whose title is in the other language (hover; a small translate glyph on the card then means "translated", click it for the original).
- It is never offered in client spaces, client-space docs included, because client text doesn't go to a third party (CEO, D-32, confirmed 2026-11-21).

## Realtime: recommendation
**Yjs content carried as Matrix room events + `m.typing` + a tiny cursor relay in the invite service.**
- **Content:** one room per page (custom type `work.pasodrum.docs.page`, restricted to its space, listed as a space child so the tree reads it via `/hierarchy` without joining). The body is a Yjs doc in TipTap (the Collaboration extension, same editor as the composer). Local edits are merged and sent as one `work.pasodrum.docs.update` event every 1–2 s while someone types, with one send in flight. This is the matrix-crdt pattern, but we don't use its package, which is stale (SDK 19). A snapshot (`Y.encodeStateAsUpdate`) is uploaded as a media file about every 200 updates, or when you leave. A state event `work.pasodrum.docs.snapshot {url, upto}` points to it. Opening a page = load the snapshot, then `/messages` forward from `upto`. Concurrent snapshots are harmless because Yjs merges.
- **"Typing…":** standard `m.typing` in the page room. It's free, and Continuwuity has it on.
- **Cursors and selections:** Yjs awareness goes through an in-memory relay in `services/invite` (POST up and a streamed fetch down, no deps, max ~4/s and only on change). It checks the caller with `whoami` and `matrix.membership()` on connect and every few minutes, stores nothing, and sends a heartbeat every 20 s. If the relay is down, editing still works; carets just disappear. **Ship cursors second:** the content design doesn't depend on them.
- **Rejected:** a snapshot plus our own ops events means inventing a CRDT. To-device for cursors would add traffic to Continuwuity's to-device loss race, which also eats room keys. Room events for cursors would persist forever. Continuwuity has no custom ephemeral events (no MSC2477 or MSC4140).
- **Limits:**
  - (1) Classic `/sync` sends every joined room's events, so you **join a page only when you open it** and leave it after a while. The tree comes from `/hierarchy`.
  - (2) There is a 64 KiB event cap: a large paste or import goes out as a media file plus a pointer event.
  - (3) `state_default` is 50, so new page and project rooms set `docs.snapshot` and `boards.issue` to level 0, as pins did (D-33).
  - (4) Update events and old snapshots are never purged. That's fine at our size.
  - (5) Latency is send plus sync wake, well under a second on our server, not Google Docs speed.
  - (6) Continuwuity has no documented per-user send rate limit; add a probe row (30 events in 10 s).
- **Boards backend (no CRDT):** one room per project (custom type). An issue = a root `m.room.message` ("WEB-18 Join page on phones", full body), plus a state event `work.pasodrum.boards.issue` (state key = root event id) holding {title, column, assignee, due, order}. Columns live in one state event `work.pasodrum.boards.columns` [{id, title?}]; default columns carry only an id and get their names from our locale files. Comments are thread replies to the root. It's last write wins per issue, which is fine at human speed. Closed issues stay in room state for good, which is fine into the low thousands.

## Encryption and standard clients
- **v1 docs and projects live only in the workspace and client spaces**, which aren't end-to-end encrypted (D-11). That keeps translation, search and newcomers simple. In an encrypted room a new member can't read updates from before they joined (D-31), so they couldn't rebuild the page. Private docs come later, using a fresh snapshot shared on join or MSC4268 history sharing (SIDE-03 showed it works).
- **Element X:** page and project rooms are custom types, so they're hidden (probe M0-05). Issues and comments are ordinary messages and thread replies, readable if the room is ever opened. Doc and issue links in chat are plain links with a card on top (D-05). Removing the feature folder leaves the rooms hidden and old data intact (D-04).

## Light multiplayer on Boards (BoardsLive, BoardsLiveIssue)
- These use the same awareness relay as doc cursors, so nothing is stored. Each client publishes {project, issue, what: drag | edit | open | typing, drop target}, rate-limited and only when it changes.
- **Board:** a card someone is dragging lifts a little in place with a slight tilt, animated up (shadow, no travel), with their name flag in their avatar colour, and their drop line shows in that colour where it will land. A card someone is editing gets their colour outline and flag. When the move or edit lands (the state event arrives), the card slides into place and glows briefly in their colour.
- **Issue panel:** the avatars of others who have it open sit in the header, and "Jonas Berg is typing…" shows above the comment box (`m.typing` in the project room would also do).
- If the relay is down, the board still updates when the state events arrive; it just lacks the live hints.

## Drag and drop (discovery boards BoardsDrag, DocsDragBlock, DocsDragPage)
- **Cards:** the card lifts and tilts while you drag it. A 2px accent line with a ring shows where it lands, and the target column gets a tint. One state event is written for the moved issue: its new column plus a fractional-index `order` between its neighbours.
- **Doc blocks:** you drag by the grip. An accent drop line runs across the text column. TipTap's drag handle and Dropcursor do this, and a move is one ProseMirror transaction, so it is one Yjs update.
- **Page tree:** dropping at the top or bottom of a row shows a line indented to the depth it will land at. The middle of a row means nest inside it. A move is one state event on the moved page (`parent` + `order`), within its own space only.
- **Library:** pragmatic-drag-and-drop (Atlassian) for cards and the tree, plus its autoscroll. Keyboard and touch use a "Move to…" item in the card, block and page menus instead of dragging.
- **Not draggable:** the List view and My issues. Their order is derived.
- Full notes from the Fable check are in the side-session notes folder (`dnd-implementation.md`).

## Not in v1
Comments on doc text, page history, templates, databases inside docs, priorities, labels, cycles, notifications for issue changes beyond @mentions, keyboard shortcuts.
