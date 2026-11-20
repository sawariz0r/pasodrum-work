# Task board

A file-based board. Each task is one markdown file that **moves between stage folders** as it progresses. The folder is the source of truth for stage; the frontmatter mirrors it.

## Stages
```
backlog/           ideas + future work, not yet committed
todo/              committed, ready to pick up (ordered by priority)
implementing/      actively being worked on
ceo-review/  done by the agent, awaiting CEO's review
done/              reviewed + accepted
```

## How to use it
1. Pick the highest-priority task in `todo/`.
2. `git mv` (or move) the file to `implementing/`, set `stage: implementing`, set `owner`.
3. When finished, move to `ceo-review/`, set `stage: ceo-review`, fill in **Outcome** + any **Review notes**.
4. CEO reviews → moves to `done/` (or back with feedback).
5. Discovered work → new file in `backlog/` or `todo/`.

## File format
Filename: `<id>-<kebab-title>.md` (e.g. `M1-02-ai-provider-abstraction.md`).

```markdown
---
id: M1-02
title: AI provider abstraction + task-tier routing
stage: todo
area: ai            # foundations | api | frontend | infra | design | docs | ...
milestone: M1
priority: P1        # P0 highest
slice: false        # part of the first vertical slice?
depends_on: [M0-01]
created: 2026-11-20
owner:
---

## Goal
What "done" means in one or two sentences.

## Acceptance criteria
- [ ] ...

## Notes
Links to SPEC/DECISIONS sections, gotchas, etc.

## Outcome
(filled when moving to ceo-review)

## Review notes
(CEO)
```

## Conventions
- IDs are `<milestone>-<nn>`. Keep them stable even as files move.
- Milestones map to [docs/SPEC.md §8](../docs/SPEC.md).
- One task = one reviewable unit of work. If it's getting big, split it in `backlog/`.
- Update `docs/DECISIONS.md` when a task forces a decision or yields a learning.
