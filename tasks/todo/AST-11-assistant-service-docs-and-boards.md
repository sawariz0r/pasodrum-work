---
id: AST-11
title: Assistant service — Boards and Docs as sources (slice 3)
stage: todo
area: api
milestone: side
priority: P2
slice: false
depends_on: [AST-09, AST-01]
created: 2026-11-23
owner:
---

## Goal
The service can read issues and pages with the caller's own access, find them, and check a New issue proposal. Slice 3 of SIDE-14; security-sensitive (page data is written by clients).

## Acceptance criteria
- [ ] `sources/boards.ts`: `list_issues` (with the count), `read_issue` (description and comments), and `find` over issue titles and descriptions, all from the project's state read with the caller's token ([the spec, §3.2 and §5.3](../../docs/specs/assistant.md))
- [ ] An issue is read only while its state entry holds a title; a deleted issue's comments are not read
- [ ] The `boards.issue` proposal: the checks of §4.5 and the client-facing rule of §3.6
- [ ] `sources/docs.ts`: `list_pages` and page titles in `find`, from the space's page tree; `read_page` by section
- [ ] A page is read only when the caller has joined it and its entry in the page tree is live
- [ ] `pageWorker.ts`: `yjs` in a worker thread with a memory limit and an empty environment; pointers must be `mxc://` on our own server; 2 MB a file, 4 MB and 2,000 edit events a page read; over a cap the page counts as not read (after spike 4)
- [ ] `yjs` pinned in `services/invite/package.json` and installed from the lockfile, as `ws` is
- [ ] The kinds offered to the model are the intersection of what the service knows and what the browser said it can draw (`can`)
- [ ] Test 5, and tests 2, 6, 8 and 11 extended to issues and pages (§9)

## Notes
- If spike 4 fails, the fallback in the spec's §10 applies and this task is re-scoped with the CEO.
- The placing rule already covers pages and projects (AST-05).

## Outcome

## Review notes
