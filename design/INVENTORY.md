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
| Sign-in in dark (input border #3A3A42, primary hover #5FE0B8, error ring #3B1D1A — values picked during M1-01, light-only on canvas) | SignIn | approved 2026-11-20 |
| SSO button only when the server offers it (`sso` tweak, off by default) | SignIn | approved 2026-11-20 |
| Sign-in failure that is neither wrong password nor unreachable (e.g. rate limited); M1 shows the "Can’t reach" alert for now | SignIn | needs design |
| Rail "+" = New client space (links to CreateClientSpace) | Main | approved 2026-11-20 |

## Batch B — for M2 (approved 2026-11-20)

| Screen / state | Artboard | Status |
|---|---|---|
| Images (single, several), video, audio | MsgImages, MsgVideoAudio, MsgMediaDark | approved 2026-11-20 |
| Files and multi-file | MsgFiles | approved 2026-11-20 |
| Formatted text, inline code, code block | MsgText, MsgTextJP, MsgTextDark | approved 2026-11-20 |
| Long message (over 15 lines → 10 + fade + Show more) | MsgLong | approved 2026-11-20 |
| Replies, incl. reply from another app (fallback, not clickable) | MsgReplies | approved 2026-11-20 |
| Edited, deleted ("Message deleted"), can't-show rows | MsgRowStates, MsgRowStatesJP | approved 2026-11-20 |
| Reactions (mine, many, who reacted) | MsgReactions | approved 2026-11-20 |
| Hover bar (React · Reply · More; Thread slot for M3) | MsgHover | approved 2026-11-20 |
| More menu, copy link toast | MsgMoreMenu, MsgMoreMenuJP, MoreMenuDark, LinkCopied | approved 2026-11-20 |
| Edit in place, delete confirm | MsgEdit, MsgDeleteConfirm | approved 2026-11-20 |
| Composer: format bar, replying-to | ComposerFormat, ComposerReply | approved 2026-11-20 |
| Emoji picker, mention picker | EmojiPicker, MentionPicker, MentionPickerJP | approved 2026-11-20 |
| Link dialog | LinkDialog | approved 2026-11-20 |
| Uploads: tray + progress, paste image, failed, drop overlay | UploadProgress, PasteImage, UploadFailed, UploadFailedJP, DropOverlay, UploadDark | approved 2026-11-20 |
| Image viewer | ImageViewer | approved 2026-11-20 |
| New line, Jump to latest | NewMessages, JumpToLatest, JumpToLatestJP | approved 2026-11-20 |
| Notification ask (once, after first send, sidebar card) | NotifyAsk, NotifyAskJP | approved 2026-11-20 |
| Desktop notification content (mentions + DMs) | DesktopNotification | approved 2026-11-20 |
| Foundations: Messages section, Motion section (D-20), new tokens | Foundations | approved 2026-11-20 |

## Batch C — for M3 (approved 2026-11-20)

**Navigation (approved, D-23):** the rail holds what spans everything — Home, DMs, Activity. The sidebar holds the space you're in — Threads, Drafts, channels, its DMs, client spaces. Mentions leaves the sidebar and becomes a filter in Activity (All · Mentions · Replies = what's aimed at you). Threads = what you follow; Drafts stay in the sidebar (per device). Only deliberate duplicate: the DM list (sidebar for quick switching, rail page in full). See NavigationM3.

| Screen / state | Artboard | Status |
|---|---|---|
| Navigation map and rules | NavigationM3 | approved 2026-11-20 |
| Threads view (+ empty) | Threads, ThreadsJP, ThreadsDark, ThreadsEmpty | approved 2026-11-20 |
| Thread panel: first reply, loading, error, composer | ThreadNew, ThreadLoading, ThreadError, ThreadErrorJP, ThreadComposer | approved 2026-11-20 |
| Hover bar with Thread | MsgHoverM3 | approved 2026-11-20 |
| Activity (All · Mentions · Replies) + empty | Activity, Mentions, ActivityJP, ActivityEmpty | approved 2026-11-20 |
| Drafts (+ empty) | Drafts, DraftsJP, DraftsEmpty | approved 2026-11-20 |
| DMs page, DM header and empty state | DMs, DMsJP, DMsDark, DMEmpty, DMEmptyJP | approved 2026-11-20 |
| New message (DM / group DM) | NewMessage, NewMessageGroup, NewMessageJP | approved 2026-11-20 |
| Profile card (name, local time, work email, Message) | ProfileCard, ProfileCardJP, ProfileCardDark | approved 2026-11-20 |
| Client's view of DMs, new message, threads | ClientDMs, ClientNewMessage, ClientThread | approved 2026-11-20 |
| Main refreshed to Batch B rules (hover bar, inline image, format bar) | Main | approved 2026-11-20 |
| Narrow widths (1024/800): thread, Threads, Activity, DMs (800: list fills, item replaces with back arrow), New message, profile card | Thread1024/800, Threads1024/800, Threads1024Dark, Activity1024/800, DMs1024/800, DMs800JP, NewMessage800, ProfileCard800 | approved 2026-11-20 |

## Batch D — for M4 (approved 2026-11-20)

**Link decision:** no shared "invite link" (accounts are per email, D-07). Channel details → **Copy link** = the channel's plain address (gives no access). A pending person's row → **Copy join link** = their single-use link (same as their email).

| Screen / state | Artboard | Status |
|---|---|---|
| Rules: widths, roles, links, first run | RulesM4 | approved 2026-11-20 |
| Workspace menu, channels "+" menu, profile menu → Settings | WorkspaceMenu, ChannelsPlusMenu, ProfileMenuSettings | approved 2026-11-20 |
| Create channel (name, private, which space, name taken) | CreateChannel, CreateChannelSpace, CreateChannelTaken, CreateChannelJP | approved 2026-11-20 |
| Browse channels | BrowseChannels, BrowseChannelsJP | approved 2026-11-20 |
| Channel details: about, members, settings, leave | ChannelAbout, ChannelMembers(+JP/Dark), ChannelSettings, LeaveChannel | approved 2026-11-20 |
| Role change, make owner (D-25: Owners make Owners; Owners/Admins switch Member↔Admin) | RoleChange, RoleChangeAdmin, MakeOwner, RulesM4 | approved 2026-11-20 (canvas updated) |
| Add people: member, client, errors | AddPeopleMember, AddPeopleClient, AddPeopleErrors(+JP) | approved 2026-11-20 |
| Settings: profile (time zone), notifications, appearance, devices | SettingsProfile(+JP), SettingsNotifications, SettingsAppearance, SettingsDevices(+Dark) | approved 2026-11-20 |
| Invite email EN/JP | InviteEmail | approved 2026-11-20 |
| Join page: link used, wrong account | JoinUsed, JoinWrongAccount(+JP) | approved 2026-11-20 |
| First sign-in (team, client) | FirstRunTeam, FirstRunClient(+JP) | approved 2026-11-20 |
| Foundations: floating composer + no sideways scroll rules | Foundations | approved 2026-11-20 |
| Built in M4-04 without a board (to confirm on the canvas): password prompt before signing devices out; join claim errors ("Couldn’t join", "Choose a longer password"); link that can't be looked up ("This page isn’t available" card) | — | needs design |

## Batch E — for M5 (approved 2026-11-21)

**Outside mark:** the amber ↗ square (already on client tiles/avatars) after a channel or DM name and beside Send with the outside people's faces when a conversation includes clients or guests; team people only; no text or banner.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules for M5 | RulesM5 | approved |
| New client space: creating, name taken, error (Retry), created (tile pops into the rail) | CreateClientSpace(+JP), ClientSpaceCreating, ClientSpaceNameTaken, ClientSpaceCreateError, ClientSpaceCreated | approved |
| Client's view of the shell | ClientShell, ClientShellMenu, ClientShellJP, ClientShellDark | approved |
| Guest's view | GuestShell, GuestShellJP | approved |
| Outside mark on channels, client spaces, DMs | ExternalChannel, ExternalClientSpace, ExternalDM, ExternalJP, ExternalDark | approved |
| Client space settings, people, remove a person, archive / archived | ClientSpaceMenuAdmin, SpaceSettings(+JP), SpacePeople(+Dark), RemoveFromSpace(+JP), ArchiveSpace, ArchivedSpace | approved |
| Another app (server + username, copy) | ProfileMenuAnotherApp, AnotherApp(+JP), JoinDoneOther | approved |
| Phone hand-off, join page on phone | PhoneHandoff(+JP), JoinPhone, JoinDonePhone | approved |

## Batch F — for M6 (approved 2026-11-21)

Words: "Confirm this device", "Not confirmed", "Not available on this device", "Recovery key". Asked only when an encrypted conversation (DM or private channel) is opened; public and client-space channels never ask.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules for M6 | RulesM6 | approved |
| Confirm this device (new device): gate, no other device, waiting, compare emoji, done, declined, timeout, mismatch | ConfirmGate(+JP, Dark), ConfirmGateNoDevice, ConfirmWaiting, ConfirmCompare(+JP), ConfirmDone, ConfirmDeclined, ConfirmTimeoutJP, ConfirmMismatch | approved |
| Approve on the device already signed in: ask, compare, done | ApproveAsk(+JP), ApproveCompare, ApproveDone, ApproveDark | approved |
| Recovery key: save once, password when asked, enter, wrong | RecoveryKeySave(+JP, Dark), RecoveryKeyPassword, RecoveryKeyEnter(+JP), RecoveryKeyWrong | approved |
| Can't confirm → reset, wrong password | ResetConfirm(+JP), ResetWrongPassword | approved |
| Messages this device can't open (DM, thread, list preview) | UndecryptableDM, UndecryptableThread, UndecryptableJP, UndecryptableDark | approved |
| Sign-out warning (last confirmed device), no backup | SignOutWarn(+JP), SignOutNoBackup | approved |
| Settings → Devices: Not confirmed tag, Recovery key row, Confirm this device | SettingsDevicesM6(+JP, Dark), SettingsDevicesUnconfirmed | approved |

## Side features

### Translate a message (SIDE-01, D-32) — canvas page **Discovery**

Team only; never where clients or guests are. Hover-bar icon only, shown when the message is in the other script from your language. Translated in place with one line under it; only you see it.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules | TranslateRules | approved 2026-11-21 |
| Hover bar: Translate | Translate, TranslateJP | approved 2026-11-21 |
| Translating | TranslateTranslating | approved 2026-11-21 |
| Translated in place + Show original | Translated(+JP, Dark, JPDark) | approved 2026-11-21 |
| Original again + Show translation | TranslateOriginal | approved 2026-11-21 |
| Couldn’t translate · Retry | TranslateFailed | approved 2026-11-21 |

## Batch G — for M7

Pins tab · Files tab (list, empty, loading) · add/remove tab · link card variants and loading · Docs "Soon" tab · Docs/Boards rail pages — all `needs design`.

## Batch H — for M8–M9

⌘K switcher · search results (empty, JP) · shortcuts · download, update prompt, tray/badge — all `needs design`.
