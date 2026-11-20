# Design inventory — the design gate

Every screen and state in the app. Status: `needs design` → `designed` → `approved` (date). A task may enter `tasks/implementing/` only when every screen it names is `approved`. Each screen is approved in EN and JP, light and dark ([[D-10]]).

Canvas: https://claude.ai/artifact/1sFjCeUornYw7f8rReZBtJ. Source copy in [design/canvas/](canvas/) (`.dc.html` per artboard, `canvas.json` index): read these when building a screen. Re-copy after every canvas change.

## Approved (before Batch A)

| Screen | Artboard | Status |
|---|---|---|
| Workspace shell: rail, sidebar, header, tabs, timeline, composer, thread panel (light) | Main | approved 2026-11-20 (EN + JP via MainJP) |
| Workspace shell (dark) | Dark | approved 2026-11-20 (EN) |
| Empty channel | Main (empty state) | approved 2026-11-20 (EN) |
| Add people dialog | AddPeople | approved 2026-11-20 (EN) |
| Sign in: email → password, other server | SignIn | approved 2026-11-20 (EN + JP via SignInJP) |
| Client's view of the shell | ClientSpace | approved 2026-11-20 (EN) |
| Join page: join / done / expired | InviteLanding | approved 2026-11-20 (EN) |
| New client space | CreateClientSpace | approved 2026-11-20 (EN) |
| Foundations: tokens, type, components, vocabulary | Foundations | approved 2026-11-20 |

## Batch A — for M1 (approved 2026-11-20)

| Screen / state | Artboard | Status |
|---|---|---|
| Japanese pass: shell, sign-in (rail labels ≤6 chars at 10px, 通知 for Activity, rail 64px; `--cjk` font stack; JP line height 1.7; initials = first char of family name) | MainJP, SignInJP | approved 2026-11-20 |
| Language switch (rail avatar menu: English / 日本語, Sign out) | LanguageMenu | approved 2026-11-20 |
| App start / first sync (shell skeleton) | AppStart | approved 2026-11-20 |
| Timeline loading, loading older | TimelineLoading, OlderHistory | approved 2026-11-20 |
| Offline / reconnecting / back online | Offline, Reconnecting, BackOnline | approved 2026-11-20 |
| Message sending / failed / retry | MessageSending, MessageFailed | approved 2026-11-20 |
| "Not available" page | NotAvailable | approved 2026-11-20 |
| Sign-in errors (wrong password, can't reach server) | SignInWrongPassword, SignInServerDown | approved 2026-11-20 |
| Session expired | SessionExpired | approved 2026-11-20 |
| Forgot password (request, sent, set new) | ForgotPassword, ForgotPasswordSent, ResetPassword | approved 2026-11-20 |
| Narrow window (~1024: sidebar folds when thread opens; ~800: thread replaces conversation, sidebar drawer) | Window1024, Window800, Window800Sidebar | approved 2026-11-20 |
| Sign-in in dark (input border #3A3A42, primary hover #5FE0B8, error ring #3B1D1A — values picked during M1-01, light-only on canvas) | SignIn | needs approval |
| SSO button only when the server offers it (`sso` tweak, off by default) | SignIn | approved 2026-11-20 |
| Rail "+" = New client space (links to CreateClientSpace) | Main | approved 2026-11-20 |

## Batch B — for M2

Image, video, audio, multi-file, code block, long message · reply quote from other apps · edited, deleted, unsupported rows · More menu · emoji picker · mention picker · link dialog · upload, drag-drop, progress, failure · image viewer · new-messages line and jump to latest · notification permission and content — all `needs design`.

## Batch C — for M3

Threads view · Mentions view · Drafts view · Home and Activity (resolve overlap with sidebar Threads/Mentions) · DMs page · new message picker · DM header and empty state · profile card · thread panel empty/loading/error — all `needs design`.

## Batch D — for M4

Create channel · browse channels · channel details (about, members, settings, leave) · role change · Add people remaining states (pending, errors, roles offered) · "Copy invite link" semantics and wording (the vocabulary check bans "invite"; e.g. "Copy link") · workspace menu · settings (profile, notifications, appearance and language, sessions) · invite email EN/JP · join page wrong-account / used states · first run after joining — all `needs design`.

## Batch E — for M5

Guest's view · "this leaves the company" cue · client space settings and removing a person · "Another app" page · phone hand-off page — all `needs design`.

## Batch F — for M6

Confirm this device (both sides) · save/enter recovery key · can't-confirm reset · undecryptable row · sign-out warning — all `needs design`.

## Batch G — for M7

Pins tab · Files tab (list, empty, loading) · add/remove tab · link card variants and loading · Docs "Soon" tab · Docs/Boards rail pages — all `needs design`.

## Batch H — for M8–M9

⌘K switcher · search results (empty, JP) · shortcuts · download, update prompt, tray/badge — all `needs design`.
