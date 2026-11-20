---
id: M1-02
title: i18n scaffold EN/JP with parity check and IME guard
stage: ceo-review
area: frontend
milestone: M1
priority: P0
slice: true
depends_on: [M0-01]
created: 2026-11-20
owner: claude
---

## Goal
Every UI string comes from `locales/en.json` / `ja.json` through i18next with typed keys; CI fails on missing keys or literal JSX strings; one shared IME-safe Enter guard exists.

## Acceptance criteria
- [x] i18next + react-i18next set up in `app/i18n.ts`; language = stored setting, else browser language (ja* → ja, else en); sets `<html lang>`
- [x] `locales/en.json` and `ja.json` seeded with the M1 strings from design/canvas (sign-in, shell, timeline/composer basics, Batch A states, language menu) — Japanese copied from the approved JP artboards, not re-translated
- [x] Typed keys (TypeScript resource typing) so a wrong key fails typecheck
- [x] `pnpm check` runs a locale parity check (same key set in both files, incl. feature-folder locales) and a vocabulary check (no Matrix words like room/homeserver/invite in en.json; list in the script)
- [x] ESLint forbids literal text in JSX and in aria-label/title/placeholder/alt attributes (built-in `no-restricted-syntax`, no new plugin) for apps/web/src outside ui/gallery dev code
- [x] `isImeEnter(e)` in app/ (or ui/) returns true only for a real Enter: not during composition (`isComposing`/keyCode 229) and not the Safari Enter that fires right after compositionend; unit tests cover all three
- [x] Dates/times via `Intl.DateTimeFormat` helper using the active language
- [x] `pnpm check` green

## Notes
D-09. Feature strings live in features/<id>/locales — the parity script must include them.

## Outcome
- `apps/web/src/app/i18n.ts`: i18next + react-i18next, typed resources (`CustomTypeOptions`, a wrong key fails typecheck). `initI18n()` picks stored setting (`localStorage` `pasodrum.language`) else first browser language (ja* → ja, else en); `setLanguage()` stores + switches; `<html lang>` follows every change. `currentLanguage()` for helpers.
- `apps/web/src/locales/{en,ja}.json`: 87 EN keys (86 JA; JA has no `_one` plural), grouped `common`, `signIn` (+ `reset`, `footer`), `shell.{rail,sidebar,header,tabs,connection,profileMenu,notAvailable}`, `timeline`, `composer`. JA copied verbatim from the Main/SignIn `strings(ja)` dictionaries. Interpolation for names/channels/server; plural for member count. Left out (not M1): Add people dialog, thread panel, reactions/More/download, typing indicator, composer formatting/attach/emoji/mention, sample content and names.
- `apps/web/src/ui/ime.ts`: `isImeEnter(e)` (native or React event) is false during composition, for keyCode 229, and within 100 ms after `compositionend` (Safari). In ui/ so app/, features/ and ui/ can all use it.
- `apps/web/src/app/format.ts`: `formatDate(date, options)` / `formatTime(date)` via `Intl.DateTimeFormat` in the active language (24h, as in the designs).
- `scripts/check-locales.ts` (`pnpm locales`, now part of `pnpm check`): key parity en/ja for `locales/` and every `features/*/locales/` (plural suffixes normalised), same interpolation variables in both, and a vocabulary check on en (room, homeserver, Matrix, invite*, federat*, bare "space", encrypt*).
- `eslint.config.js`: one `no-restricted-syntax` block for `apps/web/src/**/*.tsx` (excl. tests, `dev/`, `gallery/`, `*Gallery*`): JSXText with non-whitespace, string literals as JSX children, and non-empty string/template literals in aria-label/title/placeholder/alt (`alt=""` allowed).
- Verified: `pnpm exec vitest run` on `ui/ime.test.ts` + `app/i18n.test.ts` (10 tests: three IME cases, language resolution, interpolation/plurals EN+JA, `<html lang>`, Intl time/weekday, `@ts-expect-error` on an unknown key); lint rule and locale script probed with temporary bad files (all flagged, then removed); `pnpm check` green.
- Not done here: `initI18n()` is not yet called from `main.tsx` (owned by M1-01); add `initI18n()` before `createRoot` when the shell lands. Syncing the language to account data (`work.pasodrum.settings`) comes with Matrix settings.

## Review notes
(CEO)

Lead review: IME guard and strings look right; Japanese copied from the approved boards. `initI18n()` gets wired into main.tsx once M1-01 (which owns main.tsx) lands. Language is cached in localStorage for now; syncing it to account data (D-09) comes with M1-04. The vocabulary check bans "invite", which clashes with the approved Add people dialog's "Copy invite link" — resolve with the Batch D "Copy invite link" question.
