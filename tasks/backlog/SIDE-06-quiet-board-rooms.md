---
id: SIDE-06
title: Board/page rooms don't push-notify in other apps (Element X)
stage: backlog
area: matrix
milestone: side
priority: P3
slice: false
depends_on: []
created: 2026-11-21
owner:
---

## Why
An issue is a normal message in its project room (D-37, so other apps can read it), and people are now joined to project rooms in the background. Standard push rules therefore notify every member in Element X when an issue is created. Our app only surfaces mentions/assignments.

## Fix (small)
When our app joins a page/project room, set a room push rule (`override`/`room` rule, `dont_notify`) for it, keeping @mentions. CEO: not important now (own app later).
