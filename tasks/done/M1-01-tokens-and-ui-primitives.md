---
id: M1-01
title: Tokens and UI primitives
stage: done
area: frontend
milestone: M1
priority: P0
slice: true
depends_on: [M0-01]
created: 2026-11-20
owner: claude
---

## Goal
Design tokens and the small set of `ui/` primitives the M1 screens need exist, match the approved canvas in light/dark and EN/JP, and render in a dev-only gallery.

## Acceptance criteria
- [x] `apps/web/src/ui/tokens.css`: light + dark token sets, `--cjk` font stack, JP line height, warn/danger/skeleton tokens — values taken from design/canvas/Main.dc.html and Foundations.dc.html; theme via `data-theme` on <html>, locale via `lang`
- [x] Inter + Space Grotesk self-hosted (no Google Fonts request at runtime)
- [x] Primitives (CSS Modules, no copy, no Matrix): Button (primary/secondary/ghost), IconButton (requires an accessible label prop), TextField (label, error), Avatar (image or initials + colour), Badge/unread count, Skeleton, Banner (status: offline/reconnecting/back online), Menu (Radix dropdown), Dialog (Radix)
- [x] `initialsOf(name)` implements the Foundations rule (Japanese: first character of family name; Latin: first + last initial) with unit tests
- [x] Dev-only `/dev/gallery` renders every primitive in light and dark (and a JP sample) — not included in production builds
- [x] Exercised in a browser (Chromium + WebKit/Safari if available), screenshots compared against the canvas
- [x] `pnpm check` green

## Notes
Only primitives M1 screens use; more arrive with later batches. Primitives take strings as props (ui/ has no copy).

## Outcome
**What changed**
- `apps/web/src/ui/tokens.css`: light (`:root`, `[data-theme=light]`) and dark (`[data-theme=dark]`) token sets copied from Main.dc.html / Foundations, plus `--cjk`, `--font-ui`, `--font-title`, `--lh` (1.5, 1.7 under `:lang(ja)`), no negative tracking on JP h1–h3, global focus ring (2px accent, offset 2). Fonts imported from `@fontsource-variable/inter` and `@fontsource/space-grotesk` 500/600/700 (no runtime Google Fonts request; verified no external requests).
- Primitives in `apps/web/src/ui/` (exported from `ui/index.ts`): `Button` (primary/secondary/ghost, md 36px / lg 46px, `block`, `icon`), `IconButton` (required `label`, sizes 24/28/30/34, `outline`), `TextField` (label, `hideLabel`, `labelAside`, `trailing`, `error` with aria wiring), `Avatar` (initials or image, colour, sizes 20/22/32/36, CJK initials 1.2x, presence dot) + `avatarColor(key)`, `Badge` (unread count md/sm) + `AttentionDot`, `Skeleton` (+ `onRail`), `Banner` (offline/reconnecting/restored, optional action), `Menu`/`MenuTrigger`/`MenuContent`/`MenuItem`/`MenuSeparator`/`MenuSegments` (Radix dropdown; segments = language switch), `Dialog` (Radix; title, close label, body, well footer). `initialsOf` + `isCjk` in `ui/initialsOf.ts`. No copy, no Matrix.
- `apps/web/src/dev/Gallery.tsx`: dev-only gallery, rendered from `main.tsx` only when `import.meta.env.DEV && location.pathname === '/dev/gallery'` (lazy import; absent from the production bundle). `?theme=light|dark&lang=en|ja&menu` for screenshots. `main.tsx` also imports `ui/tokens.css`.

**Design gaps filled (need CEO eyes):** dark values for tokens the light-only SignIn uses: `--field` #3A3A42 (input border, light #D9D6CF), `--accenthover` #5FE0B8 (light #0B6956), `--dangersoft` #3B1D1A (light #FDECEA). Field errors always show the alert icon (canvas: password error has it, email error doesn't).

**Verified:** `pnpm exec vitest run apps/web/src/ui` (unit tests for initialsOf and every primitive), eslint, typecheck, build (no gallery chunk), `pnpm check` green. Gallery exercised in the desktop app's built-in browser (Chromium) at 1440px in light, dark and Japanese: menu opens beside the rail avatar bottom-aligned, language segments switch and keep the menu open, dialog opens 96px from top with focus ring on Tab; compared against Main/Dark/LanguageMenu/Foundations. WebKit/Safari not checked (no WebKit available here).

## Review notes
(CEO)

Lead review: wired `initI18n()` into main.tsx and exported `isImeEnter` from ui/. Needs CEO eyes: sign-in had no dark design, so the dark values (input border, primary hover, error ring) were chosen during the build — listed in design/INVENTORY.md as needing approval. Field errors always show the alert icon (canvas shows it only on the password error). Not checked in Safari/WebKit yet.
