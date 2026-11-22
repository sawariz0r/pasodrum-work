---
id: SEED-01
title: Casual JP welcome page + "Pasodrum work" try-it board on production
stage: ceo-review
area: docs
milestone: side
priority: P1
slice: false
depends_on: [OPS-01]
created: 2026-11-22
owner: seed01 session
---

## Goal (CEO)
"Seed a document that in short explains the key parts of the app. Like the docs, and some 'Try adding a row under here and do [[' etc. Copy the link and paste it in the #general chat etc. We should also have some tasks in a board that's like: Project: 'Pasodrum work', tasks like 'Drag me' etc. All in casual japanese. Don't 'ordbajsa'. No wall of text. You may use my user, if you create a script where I enter username and pass to sign in and you input it."

## Acceptance criteria
- [x] One Docs page in the Pasodrum workspace, casual JP (タメ口), about one screen: channels/DMs, threads, Docs, Boards, ⌘K, Activity, with try-it prompts that work today (D-19).
- [x] Project 「Pasodrum work」 in the Pasodrum workspace with ~5–7 try-it issues over the columns; owner/assignee Oscar only.
- [x] `pnpm seed:welcome-jp`: asks username + password (hidden), signs in against `$MATRIX_BASE`, idempotent, `--dry-run`, logs out at the end, no secrets written.
- [x] Run on the local stack; CEO approves screenshots + tone sample.
- [x] Production: dry-run → CEO real run → dry-run with 0 writes.

## Notes
- Reuses `dev/seed-welcome.ts` (old EN/JP welcome seed, ran as sofia; now gone from production after the OPS-01 wipe).
- Shiori is a real user: not assigned, mentioned or added anywhere.

## Outcome (2026-11-22)
- **Live on pasodrum.work** (CEO ran it as Oscar): page 「Pasodrum work のつかいかた」 at the top of the workspace's Docs, and project 「Pasodrum work」 (PAS) with 7 try-it cards: 3 in 未着手, 2 in 進行中, 1 in レビュー中, 1 in 完了. All are assigned to Oscar except 「自分にアサインしてみて」. Each card has a one-line description, and one comment from Oscar on 「コメントしてみて」. Prod: dry run 17 → write 17 → dry run 0 (CEO).
- **Script:** `dev/seed-welcome-jp.ts`, `pnpm seed:welcome-jp [--dry-run] [--local]`. Defaults to https://pasodrum.work. Asks username + hidden password, finds things by title/name, logs out at the end (no device left, checked locally). JP column titles as the app stores them for a JP user.
- **Prompts checked in the app (local):** `[[name` offers 「新しいページ」 (bare `[[` lists nothing while it's the only page). Page and issue links sent in chat become cards. Panel labels 担当 / 期限 / ステータス and the card's … → リンクをコピー match the descriptions.
- **Local stack:** the old seed project was renamed "Pasodrum work (old EN seed)" so the run mirrored a clean prod.
- **Spotted, not fixed:** the issue panel shows 「期限をなくす」 ("remove due date") as the empty due-date label.

## Review notes
