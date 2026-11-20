---
id: M5-03
title: UI: Another app, phone hand-off, join page on phones
stage: todo
area: frontend
milestone: M5
priority: P1
slice: false
depends_on: [M4-04]
created: 2026-11-21
owner:
---

## Boards (design/canvas/, approved)
RulesM5 (bottom section) · ProfileMenuAnotherApp, AnotherApp(+JP), JoinDoneOther · PhoneHandoff(+JP), JoinPhone, JoinDonePhone

## Acceptance criteria
- [ ] Profile menu → Another app: server + username from `store.anotherApp()`, Copy each (check 1.2 s, announced to screen readers), Get Element X
- [ ] Join done state keeps the same pair behind its disclosure (JoinDoneOther)
- [ ] App routes under 640 px wide show PhoneHandoff (what the link points to, Copy link, Open in Element X); `/join/*` stays usable on phones (JoinPhone); after joining on a phone Element X comes first and server/username are shown open (JoinDonePhone)
- [ ] Verify the Element X link (`https://mobile.element.io/element/?account_provider=pasodrum.work` or the current equivalent) really pre-fills the server; note the finding in the task Outcome
- [ ] EN/JP, light/dark; tests; `pnpm check` green; browser-checked at phone width
