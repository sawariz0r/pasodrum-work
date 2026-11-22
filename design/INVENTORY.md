# Design inventory — the design gate

Every screen and state in the app. Status: `needs design` → `designed` → `approved` (date). A task may enter `tasks/implementing/` only when every screen it names is `approved`. Each screen is approved in EN and JP, light and dark ([[D-10]]).

Canvas: https://claude.ai/artifact/1sFjCeUornYw7f8rReZBtJ, one page per feature (since 2026-11-21). Source copy in [design/canvas/](canvas/) (`.dc.html` per artboard, `canvas.json` index): read these when building a screen. Re-copy after every canvas change, then run `pnpm canvas:map`. **Find a feature’s artboards in [CANVAS-MAP.md](CANVAS-MAP.md)** (page → section → artboard); this file stays the status record.

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
| Sign-in failure that is neither wrong password nor unreachable (rate limited → Too many attempts; anything else → Something went wrong) | SignInOtherError, SignInTooMany | approved 2026-11-21 (Batch H; confirmed in DES-02) |
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
| Built in M4-04: password prompt before signing devices out; join claim errors ("Couldn’t join", "Choose a longer password"); link that can't be looked up ("This page isn’t available" card); Add people "Couldn’t add {name}" | BuiltStatesM4 | approved 2026-11-21 (Batch H; confirmed in DES-02) |

## Batch E — for M5 (approved 2026-11-21)

**Outside mark (superseded by D-40):** the amber ↗ square (already on client tiles/avatars) after a channel or DM name and beside Send with the outside people's faces when a conversation includes clients or guests; team people only; no text or banner.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules for M5 | RulesM5 | approved |
| New client space: creating, name taken, error (Retry), created (tile pops into the rail) | CreateClientSpace(+JP), ClientSpaceCreating, ClientSpaceNameTaken, ClientSpaceCreateError, ClientSpaceCreated | approved |
| Client's view of the shell | ClientShell, ClientShellMenu, ClientShellJP, ClientShellDark | approved |
| Guest's view | GuestShell, GuestShellJP | approved |
| Outside mark on channels, client spaces, DMs | ExternalChannel, ExternalClientSpace, ExternalDM, ExternalJP, ExternalDark | superseded by D-40 (ClientMarkFinal, ClientMarkPlaces) |
| Client and External marks: company tile / grey ↗ on avatars ≥30 px, composer line only when there's a risk | ClientMarkFinal | approved 2026-11-21 (D-40) |
| Client and External marks everywhere they show (rail, chats, members, settings, Docs/Boards, timeline) | ClientMarkPlaces | approved 2026-11-21 (D-40) |
| Client space settings, people, remove a person, archive / archived | ClientSpaceMenuAdmin, SpaceSettings(+JP), SpacePeople(+Dark), RemoveFromSpace(+JP), ArchiveSpace, ArchivedSpace | approved |
| Another app (server + username, copy) | ProfileMenuAnotherApp, AnotherApp(+JP), JoinDoneOther | approved |
| Phone hand-off, join page on phone | PhoneHandoff(+JP), JoinPhone, JoinDonePhone | approved |

## Batch E2 — channel rename and archive (approved 2026-11-21)

Who: Owners, Admins and the channel's creator (exactly what the server allows, D-27). `#general` can't be renamed or archived. Both live in Channel details → Settings. Archive = read-only like a client space (D-28); archived channels leave the sidebar and sit under Archived in Browse.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules | RulesE2 | approved |
| Channel settings (allowed / everyone else) | ChannelSettingsE2, ChannelSettingsMember | approved |
| Rename: editing, taken, error, saved (+JP) | RenameChannel, RenameChannelTaken, RenameChannelError, RenameChannelSaved, RenameChannelJP | approved |
| Archive: ask (+JP), archived view (allowed, member, dark, JP), settings when archived | ArchiveChannel, ArchiveChannelJP, ArchivedChannel, ArchivedChannelMember, ArchivedChannelDark, ArchivedChannelJP, ArchivedChannelSettings | approved |
| Browse channels with Archived (+JP) | BrowseArchived, BrowseArchivedJP | approved |

## Batch F — for M6 (approved 2026-11-21)

Words: "Confirm this device", "Not confirmed", "Not available on this device", "Recovery key". Asked only when an encrypted conversation (DM or private channel) is opened; public and client-space channels never ask.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules for M6 | RulesM6 | approved |
| Confirm this device (new device): gate, no other device, waiting, compare emoji, done, declined, timeout, mismatch | ConfirmGate(+JP, Dark), ConfirmGateNoDevice, ConfirmWaiting, ConfirmCompare(+JP), ConfirmDone, ConfirmDeclined, ConfirmTimeoutJP, ConfirmMismatch | approved |
| Approve on the device already signed in: ask, compare, done | ApproveAsk(+JP), ApproveCompare, ApproveDone, ApproveDark | approved |
| Recovery key: save once, password when asked, enter, wrong | RecoveryKeyPassword, RecoveryKeyEnter(+JP), RecoveryKeyWrong | approved |
| Can't confirm → reset, wrong password | ResetConfirm(+JP), ResetWrongPassword | approved |
| Messages this device can't open (DM, thread, list preview) | UndecryptableDM, UndecryptableThread, UndecryptableJP, UndecryptableDark | approved |
| Sign-out warning (last confirmed device), no backup | SignOutWarn(+JP), SignOutNoBackup | approved |
| Settings → Devices: Not confirmed tag, Recovery key row, Confirm this device | SettingsDevicesM6(+JP, Dark), SettingsDevicesUnconfirmed | approved |
| SIDE-09 save the recovery key: Copy + Save to Passwords (Chrome, Edge) or Download (Safari, Firefox, Mac app), saved states (replaced RecoveryKeySave(+JP, Dark)) | SaveKeyPasswords, SaveKeyPasswordsSaved, SaveKeyPasswordsJP, SaveKeyPasswordsDark, SaveKeyDownload, SaveKeyDownloadSaved, SaveKeyDownloadJP, SaveKeyDownloadJPDark | approved 2026-11-22 |

## Side features

### Translate a message (SIDE-01, D-32) — canvas page **Translate**

Team only; never where clients or guests are. Hover-bar icon only, shown when the message is in the other script from your language. Translated in place with one line under it; only you see it.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules | TranslateRules | approved 2026-11-21 |
| Hover bar: Translate | Translate, TranslateJP | approved 2026-11-21 |
| Translating | TranslateTranslating | approved 2026-11-21 |
| Translated in place + Show original | Translated(+JP, Dark, JPDark) | approved 2026-11-21 |
| Original again + Show translation | TranslateOriginal | approved 2026-11-21 |
| Couldn’t translate · Retry | TranslateFailed | approved 2026-11-21 |

## Batch G — for M7 (+ SIDE-02, other tab)

Approved 2026-11-21 (CEO). Rules: RulesM7. PrivateChannel: no extra header lock — the name's existing lock is enough (CEO).

| Screen / state | Boards | Status |
|---|---|---|
| Tab strip Messages · Pins · Files | ChannelTabsM7 | approved 2026-11-21 |
| Pin / Unpin in the message menu | MsgMenuPin, MsgMenuUnpin | approved 2026-11-21 |
| Pinned message glyph | PinnedMessage | approved 2026-11-21 |
| Pins tab (list, hover Unpin, empty, loading) | PinsTab(+JP, Dark), PinsTabEmpty, PinsTabLoading | approved 2026-11-21 |
| Files tab (list, empty, loading, loading older) | FilesTab(+JP, Dark), FilesTabEmpty, FilesTabLoading, FilesTabMore | approved 2026-11-21 |
| Link card (image, no image, loading, none, two links) | LinkCard(+JP, Dark), LinkCardNoImage, LinkCardLoading, LinkCardNone, LinkCardMulti | approved 2026-11-21 |
| Docs / Boards "Soon" rail pages | DocsSoon, BoardsSoon, RailSoonJP | approved 2026-11-21 |
| SIDE-02 privacy line + header lock | PrivateDM, PrivateDMTooltip, PrivateGroupDM, PrivateChannel, PrivateJP, PrivateDark | approved 2026-11-21 |
| Open in another tab · Use here | OpenElsewhere, OpenElsewhereJP | approved 2026-11-21 |

## Batch H — M8 find, SIDE-03 share history, failed actions, leftovers

Approved 2026-11-21 (CEO). Rules: RulesM8. Shortcuts sheet and desktop bits dropped (CEO; desktop → M9).

| Screen / state | Boards | Status |
|---|---|---|
| ⌘K switcher (recent, results, empty) | Switcher(+JP, Dark), SwitcherResults, SwitcherEmpty | approved 2026-11-21 |
| ⌘K across spaces: └ + space name under each channel (only when you're in more than one space) | SwitcherSpaces(+JP) | approved 2026-11-21 |
| ⌘K people/DM tags: External pill (grey per D-40), client tag in their space's colour, team untagged | SwitcherTags(+Dark) | approved 2026-11-21 |
| ⌘K: what a client (unchanged) and an External (own spaces only) see | SwitcherWhoSees | approved 2026-11-21 |
| Message search (results, searching, empty, unconfirmed device) | SearchResults(+JP, Dark), SearchSearching, SearchEmpty, SearchUnconfirmedDevice | approved 2026-11-21 |
| Share earlier messages (staff) | ShareHistoryEntry(+JP, Dark), ShareHistoryVerify, ShareHistoryConfirm, ShareHistoryProgress, ShareHistoryBlocked | approved 2026-11-21 |
| Confirm it's you + restored messages (client) | ConfirmPersonAsk(+JP), HistoryRestoredRow(+JP, Dark) | approved 2026-11-21 |
| Failed action (dialog line, toast) | ActionFailed(+JP) | approved 2026-11-21 |
| Sign-in other error, too many attempts | SignInOtherError, SignInTooMany | approved 2026-11-21 |
| No DMs yet | DmsEmpty | approved 2026-11-21 |
| States built without boards (M4) | BuiltStatesM4 | approved 2026-11-21 |


## People and access (D-36)

Approved 2026-11-21 (CEO). Rules: PeopleRules.

| Screen | Boards | Status |
|---|---|---|
| Add people: pick a type (Staff / External / Client), then where | PeopleAddStaff, PeopleAddExternal, PeopleAddClient, PeopleAddExternalJP, PeopleAddDark | approved 2026-11-21 |
| Add people in a client space (Staff: clients only) | PeopleAddNordlys | approved 2026-11-21 |
| Add people to a channel; Staff colleagues only, with the error | PeopleAddChannel, PeopleAddStaffOnly | approved 2026-11-21 |
| Client space settings → People with an invite field (replaces SpacePeople's Add people row) | PeopleSpaceInvite, PeopleSpaceInviteJP, PeopleSpaceInviteDark | approved 2026-11-21 |
| Workspace settings → People (new) | PeopleWorkspace, PeopleWorkspaceJP, PeopleWorkspaceDark | approved 2026-11-21 |
| Remove an External from Pasodrum | PeopleRemoveExternal, PeopleRemoveExternalJP | approved 2026-11-21 |
| Workspace settings → Access: roles, new role, not applied | PeopleAccess, PeopleAccessNew, PeopleAccessNotApplied, PeopleAccessJP, PeopleAccessDark | approved 2026-11-21 |
| What an External sees (Pasodrum, a client space) | PeopleExternalView, PeopleExternalNordlys, PeopleExternalJP, PeopleExternalDark | approved 2026-11-21 |
| What a client sees of an External (part of the team) | PeopleClientSeesTeam, PeopleClientSeesTeamJP | approved 2026-11-21 |
| Rules: people and access | PeopleRules | approved 2026-11-21 |

These supersede the Guest boards (GuestShell, GuestShellJP), the Member/Guest segments in AddPeople and AddPeopleMember, and the Add people row in SpacePeople.

## Docs and Boards (D-37)

Approved 2026-11-21 (CEO). Rules: DocsBoardsRules. Components: DocsPage, BoardsPage (self-contained).

| Screen / state | Artboard | Status |
|---|---|---|
| Rules | DocsBoardsRules | approved 2026-11-21 |
| Doc page: tree, blocks, two people present (caret, selection, typing) | DocsPage(+JP, Dark) | approved 2026-11-21 |
| New page, add a block, link to a page | DocsEmpty(+JP), DocsBlocks(+JP, Dark), DocsLink(+JP) | approved 2026-11-21 |
| Offline, loading, no pages yet | DocsOffline, DocsLoading, DocsNone(+JP) | approved 2026-11-21 |
| Page menu, move, delete | DocsPageMenu(+JP, Dark), DocsMoveTo, DocsDeletePage | approved 2026-11-21 |
| Translate a section; translating, couldn't translate | DocsTranslated(+JP, Dark), DocsTranslateStates | approved 2026-11-21 |
| Client space (team), client's view | DocsNordlys, DocsClient | approved 2026-11-21 |
| Dragging a block, a page | DocsDragBlock, DocsDragPage | approved 2026-11-21 |
| Project board, list view | BoardsPage(+JP, Dark), BoardsList | approved 2026-11-21 |
| Issue panel, translated comment; assign; due date | BoardsIssue(+JP, Dark), BoardsAssignee, BoardsDue | approved 2026-11-21 |
| New issue, quick add, create failed | BoardsNewIssue(+JP, Dark), BoardsQuickAdd(+JP), BoardsCreateFailed | approved 2026-11-21 |
| New column (one title), translate a card | BoardsColumn(+JP), BoardsCardTranslate | approved 2026-11-21 |
| Rename column: header ⋯ (team, on hover) → Rename; the column dialog titled "Rename column", prefilled, Save off until the name changes | BoardsBuiltStates | approved 2026-11-21 |
| My issues | BoardsMine(+JP) | approved 2026-11-21 |
| New project, no projects yet, empty project, loading | BoardsNewProject, BoardsNoProjects(+JP), BoardsEmpty, BoardsLoading | approved 2026-11-21 |
| Card menu, delete issue, move failed | BoardsCardMenu(+JP, Dark), BoardsDeleteIssue, BoardsMoveFailed | approved 2026-11-21 |
| Client space (team, custom column), client's view | BoardsNordlys, BoardsClient | approved 2026-11-21 |
| Dragging a card; others dragging, editing, just moved; others in an issue | BoardsDrag, BoardsLive(+Dark), BoardsLiveIssue | approved 2026-11-21 |
| Doc and issue cards in chat (vs Element X plain link) | DocsBoardsCards | approved 2026-11-21 |
| Boards unread: card and list-row dot; the newest unread mention flashes when the issue opens | BoardsBuiltStates | approved 2026-11-21 |
| Boards unread: project badge in the sidebar | — | with DES-01 (uniform sidebar rows) |
| Issue mentions and assignments in Activity (issue key in place of the channel) | BoardsBuiltStates | approved 2026-11-21 |
| Issue panel lies over the board at every width; clicking empty board closes it | BoardsBuiltStates | approved 2026-11-21 |
| Docs file block (same card as a file in chat) | DocsFileBlock | approved 2026-11-21 |
| SIDE-07: Docs and Boards show only the active space, no space heading (layout "space" is now the default of DocsPage/BoardsPage, so every Docs/Boards board shows it) | DocsPage(+JP, Dark), DocsNordlys, BoardsPage(+JP, Dark), BoardsNordlys | approved 2026-11-22 |
| SIDE-07: My issues across every space, space name per group | BoardsMine(+JP) | approved 2026-11-22 |
| SIDE-07: All issues (team, Pasodrum tile only): every open issue across spaces, grouped by project, face filter top right, dashed face = nobody | BoardsAll, BoardsAllPerson, BoardsAllJP, BoardsAllDark | approved 2026-11-22 |
| SIDE-07: in Docs/Boards a space tile stays in Docs/Boards and opens that space | rules note on the Boards page | approved 2026-11-22 |

## Confirm by email (D-38)

Approved 2026-11-21 (CEO). Boards on the canvas page **Confirm by email** (moved from Discovery when the canvas went to one page per feature); mirrored in design/canvas. Rules: EmailConfirmRules.

| Screen | Boards | Status |
|---|---|---|
| Client, new device: Confirm it's you (email; Use another device when one is signed in) | EmailConfirmGate, EmailConfirmGateOther, EmailConfirmGateJP, EmailConfirmGateDark | approved 2026-11-21 |
| Check your email (waiting) | EmailConfirmSent, EmailConfirmSentJP, EmailConfirmSentDark | approved 2026-11-21 |
| You're all set | EmailConfirmDone | approved 2026-11-21 |
| Didn't get the email? (send again, ask contact, start fresh) | EmailConfirmHelp, EmailConfirmHelpJP | approved 2026-11-21 |
| Help is on the way (client) | EmailConfirmHelped, EmailConfirmHelpedJP, EmailConfirmHelpedDark | approved 2026-11-21 |
| The confirm email (EN, JP) | EmailConfirmEmail | approved 2026-11-21 |
| Link page (any device, phone-first): confirm, confirmed, no longer works, help on the way | EmailConfirmLinkAsk, EmailConfirmLinkOk, EmailConfirmLinkExpired, EmailConfirmLinkHelped, EmailConfirmLinkAskJP, EmailConfirmLinkOkJP, EmailConfirmLinkAskDark, EmailConfirmLinkOkDark | approved 2026-11-21 |
| Staff: a client needs your help (DM from Pasodrum), with the next step per reason (DES-04) | EmailConfirmStaffHelp, EmailConfirmStaffHelpJP, EmailConfirmStaffHelpDark, EmailConfirmStaffHelpStuckJP, EmailConfirmStaffHelpLinkDark | approved 2026-11-22 |
| Rules: confirm by email | EmailConfirmRules | approved 2026-11-21 |

| Send/help failed → muted "Something went wrong. Try again." line; link page can't reach us → clock tile + same line; link page line muted (was red) | EmailConfirmBuiltStates | approved 2026-11-21 |
| No key held (account from before D-38) → "We can't email you a link": Ask {contact}, Back · Start fresh | EmailConfirmBuiltStates | approved 2026-11-21 |
| Clients and Externals: sign-out from the last device without the recovery key line; Reset and start fresh? as built (never named the key) | EmailConfirmBuiltStates | approved 2026-11-21 |

Components: `EmailConfirm`, `EmailConfirmLink`, `EmailConfirmStaff`. For clients these replace ConfirmGate/ConfirmGateNoDevice, RecoveryKeySave, RecoveryKeyEnter and the Recovery key row in Settings → Devices; staff and the team keep those (RulesM6).

## Sidebar rows (DES-01)

Approved 2026-11-21 (CEO). One row component for the Home, Docs and Boards columns (and Settings' nav for the selected colour); Home's row is the reference. Boards on the canvas page **Overview & foundations**, section "Sidebar rows". These rules win over row styling drawn in older boards (Main, DocsPage, BoardsPage and their variants). Docs/Boards fold headings (SIDE-07) follow the same heading rule.

| Screen | Boards | Status |
|---|---|---|
| Rules: one sidebar row (spacing, type, icon slot, rest/hover/unread/current, counts, sub-pages, headings, column); selected row = quiet grey (option B) | SidebarRowRules | approved 2026-11-21 |
| Home sidebar (reference; only the selected row turns quiet grey) — EN/JP × light/dark | SidebarRowsHome | approved 2026-11-21 |
| Docs sidebar on Home's row: icons and names line up, sub-page chevron at the end, column 248 — EN/JP × light/dark | SidebarRowsDocs | approved 2026-11-21 |
| Boards sidebar on Home's row: My issues a normal row with a quiet count, swatch in the icon column, column 248 — EN/JP × light/dark | SidebarRowsBoards | approved 2026-11-21 |

## Main contacts (SIDE-05)

Approved 2026-11-21 (CEO). Boards on the canvas page **Client spaces & guests**, section "Main contacts (SIDE-05, approved 2026-11-21)"; rules in the orange note beside ContactHelpPill.

| Screen / state | Artboard | Status |
|---|---|---|
| Client space settings → People: "Main contact" tag; ⋯ Make main contact / Remove as main contact (Owner, Admin; Staff rows incl. your own) | SpaceContacts, SpaceContactsJP, SpaceContactsDark, SpaceContactsJPDark | approved 2026-11-21 |
| Client's help pill names the main contact (EmailConfirm unchanged otherwise) | ContactHelpPill | approved 2026-11-21 |

## Desktop app (DES-03, M9)

Approved 2026-11-22 (CEO). Boards on the canvas page **Desktop app**. Shell-neutral (Tauri or Electron). Reused unchanged: DesktopNotification, Offline/Reconnecting/BackOnline, SignIn, Window1024/Window800, device confirmation.

| Screen / state | Artboard | Status |
|---|---|---|
| Rules: window, closing, links (no screen), badge, updates, device name, where Download shows | DesktopRules | approved 2026-11-22 |
| Download for Mac / Windows: profile menu row (browser only); InviteLanding header + join done buttons back on, label per OS | DesktopDownload | approved 2026-11-22 |
| App window + our own title bar (rail colour, ← →, search field (no shortcut hint); Mac lights inset, Windows controls drawn); empty before sign-in | DesktopWindow | approved 2026-11-22 |
| Update ready: sidebar card → Restart; Mac app menu (Restart to Update / Check for Updates…) | DesktopUpdate | approved 2026-11-22 |
| Dock badge, Windows taskbar overlay + tray menu (Open / Quit) | DesktopBadge | approved 2026-11-22 |
| Can't reach Pasodrum work (window can't load the app) | DesktopOffline | approved 2026-11-22 |

## Rail tidy (DES-05)

Approved 2026-11-22 (CEO, in the DES-05 chat), canvas v94. B on **Overview & foundations** ("Rail: theme in the profile menu, Activity icon-only"); A and C on **Client spaces & guests** ("Archived client spaces & delete"). `Main` now draws the new rail by default (prop `railTidy`, default true).

| Screen / state | Artboard | Status |
|---|---|---|
| A: archived client spaces leave the team's rail; Pasodrum menu: divider, New client space + Archived client spaces (Owner/Admin) → list with Unarchive + bin (Owner); viewing an archived space shows its tile dimmed until you leave | TidyArchivedMenu, TidyArchivedList, TidyArchivedListJP, TidyArchivedOpen | approved 2026-11-22 |
| B: theme toggle → profile menu (Light \| Dark under Language); Activity icon-only in its rail slot, badge kept | TidyRail, TidyProfileMenu, TidyProfileMenuJP, TidyActivityJP, TidyClient | approved 2026-11-22 |
| C: delete an archived client space (Owner only): Client space settings → General, in Archive’s place; confirm with the space card, one line, type the name to arm Delete | TidyDeleteSettings, TidyDeleteSpace, TidyDeleteSpaceJP, TidyDeleteSettingsJP | approved 2026-11-22 |

## Empty-state buttons (DES-06)

Approved 2026-11-22 (CEO). Boards on the **Docs** and **Boards** pages. DocsNone(+JP) and BoardsNoProjects(+JP) now show the new button (the components changed); dark boards added.

| Screen / state | Artboard | Status |
|---|---|---|
| Docs "No pages yet" and Boards "No projects yet": one standard 36px button, tile → title → button 20 apart | DocsNone(+JP, Dark, JPDark), BoardsNoProjects(+JP, Dark, JPDark) | approved 2026-11-22 |
