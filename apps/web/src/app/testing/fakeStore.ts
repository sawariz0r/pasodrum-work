// In-memory WorkspaceStore with the canvas workspace, for tests and /dev screens. No server.
import { PasswordRequired } from '../../matrix';
import { createFakeDocsBoards } from './fakeDocsBoards';
import type { AccessChange, AccessRole, ActivityItem, AddPeopleResult, Channel, ConnectionState, Device, Dm, Draft, EmailConfirm, ExternalAccess, FilesPage, HelpReason, JoinableChannel, LinkPreview, Media, Member, Message, NotifyLevel, PendingInvite, Person, Reaction, Role, SasEmoji, SearchHit, Security, Space, ThreadSummary, Timeline, Upload, WorkspaceSnapshot, WorkspaceStore } from '../../matrix';

const people: Record<string, Person> = {
  so: { id: '@sofia:pasodrum.localhost', name: 'Sofia Olsen' },
  ih: { id: '@ingrid:pasodrum.localhost', name: 'Ingrid Holm' },
  jb: { id: '@jonas:pasodrum.localhost', name: 'Jonas Berg' },
  ty: { id: '@tanaka:pasodrum.localhost', name: '田中 由紀' },
  ml: { id: '@maja:pasodrum.localhost', name: 'Maja Lind' },
  ek: { id: '@erik:pasodrum.localhost', name: 'Erik Kvam' },
  // D-36: an External (Translators + a one-off #launch-site; still in #design, so not applied).
  la: { id: '@lea:pasodrum.localhost', name: 'Lea Aune', external: true },
  tr: { id: '@tove:pasodrum.localhost', name: 'Tove Rask' },
  hd: { id: '@henrik_nordlys.no:pasodrum.localhost', name: 'Henrik Dahl', external: true, client: '!nordlys' },
  // A Kumo client: the team sees her company; Henrik and Ola never meet her (SwitcherTags, SwitcherWhoSees).
  ci: { id: '@carol_kumo.jp:pasodrum.localhost', name: 'Carol Ito', external: true, client: '!kumo' },
};

// D-38: the system sender of help cards (read-only DM, logo tile).
const pasodrum: Person = { id: '@pasodrum:pasodrum.localhost', name: 'Pasodrum' };
const helpBodies: Record<HelpReason, string> = {
  'email-missing': 'The email to confirm their new device didn’t arrive.',
  stuck: 'They’re stuck confirming a new device.',
  'link-broken': 'The confirm link didn’t work for them.',
};

/** D-38: the help DM from Pasodrum (EmailConfirmStaffHelp): Henrik asks from Nordlys. */
function helpDm(reason: HelpReason): { dm: Dm; messages: Message[] } {
  const ts = at(0, 14, 12);
  const body = `Henrik Dahl needs your help\n${helpBodies[reason]}\nNordlys · henrik@nordlys.no · their time 07:12`;
  const message: Message = {
    id: '$!dm-pasodrum-help', channelId: '!dm-pasodrum', sender: pasodrum, body, ts, status: 'sent',
    help: { who: people.hd!, spaceName: 'Nordlys', reason, email: 'henrik@nordlys.no', localTime: '07:12' },
  };
  return { dm: { id: '!dm-pasodrum', people: [pasodrum], unread: 1, mentions: 1, lastTs: ts, spaceIds: ['!pasodrum'], system: true, last: message }, messages: [message] };
}

// M4/D-36: an External in #design and Nordlys (Nordlys designers); not in the people directory.
const ola: Person = { id: '@ola_fjell.studio:pasodrum.localhost', name: 'Ola Fjell', external: true };

const byEmail = (email: string): Person => ({ id: `@${email.toLowerCase().replace('@', '_')}:pasodrum.localhost`, name: email });
// D-36: an External added by email, not joined yet (PeopleWorkspace, PeopleAccessNotApplied).
const yui = byEmail('yui.sato@kotoba.jp');

// D-36 access roles (PeopleAccess board) and External records; `rooms` is where they are now (joined or invited).
const accessRoleSeed: AccessRole[] = [
  { id: 'role-nordlys-designers', name: 'Nordlys designers', colour: '#0F766E', channels: ['!design'], spaces: ['!nordlys'] },
  { id: 'role-translators', name: 'Translators', colour: '#B45309', channels: ['!launch-site'], spaces: ['!kumo'] },
  { id: 'role-kumo-build', name: 'Kumo build', colour: '#1D4ED8', channels: [], spaces: [] },
];
type ExternalRecord = { roles: string[]; channels: string[]; email?: string; rooms: { channels: string[]; spaces: string[] } };
const externalSeed: Record<string, ExternalRecord> = {
  [ola.id]: { roles: ['role-nordlys-designers'], channels: [], rooms: { channels: ['!design'], spaces: ['!nordlys'] } },
  // Still in #design and not yet in Kumo: "Not applied".
  ['@lea:pasodrum.localhost']: { roles: ['role-translators'], channels: ['!launch-site'], rooms: { channels: ['!design', '!launch-site'], spaces: [] } },
  [yui.id]: { roles: ['role-translators'], channels: [], email: 'yui.sato@kotoba.jp', rooms: { channels: ['!launch-site'], spaces: ['!kumo'] } },
};
const isTeam = (r?: Role) => r === 'owner' || r === 'admin' || r === 'staff';
const byRoleName = (a: AccessRole, b: AccessRole) => a.name.localeCompare(b.name);
/** D-36: the snapshot's access data; empty unless I'm joined to the workspace. */
const accessView = (myRoles: Record<string, Role>, roles: AccessRole[], records: Record<string, ExternalRecord>) =>
  isTeam(myRoles['!pasodrum'])
    ? { accessRoles: [...roles].sort(byRoleName), externals: Object.fromEntries(Object.entries(records).map(([id, r]) => [id, { roles: [...r.roles], channels: [...r.channels] }])) }
    : { accessRoles: [], externals: {} };

// M4: channels you haven't joined (BrowseChannels board).
const unjoined: Record<string, Omit<JoinableChannel, 'joined'>[]> = {
  '!pasodrum': [
    { id: '!marketing', spaceId: '!pasodrum', name: 'marketing', topic: 'Campaigns, launches and the brand', private: false, memberCount: 8 },
    { id: '!office-oslo', spaceId: '!pasodrum', name: 'office-oslo', topic: 'Lunch, parcels and the coffee machine', private: false, memberCount: 15 },
    { id: '!release-notes', spaceId: '!pasodrum', name: 'release-notes', topic: 'What shipped and when', private: false, memberCount: 18 },
    { id: '!sales', spaceId: '!pasodrum', name: 'sales', topic: 'Leads and deals', private: false, memberCount: 6 },
    { id: '!support', spaceId: '!pasodrum', name: 'support', topic: 'Customer questions', private: false, memberCount: 7 },
  ],
  '!nordlys': [{ id: '!design-review', spaceId: '!nordlys', name: 'design-review', topic: 'Screens for review', private: false, memberCount: 4 }],
  '!kumo': [],
};

const spaces: Space[] = [
  { id: '!pasodrum', name: 'Pasodrum', kind: 'workspace' },
  { id: '!kumo', name: 'Kumo', kind: 'client', colour: '#9A3412' },
  { id: '!nordlys', name: 'Nordlys', kind: 'client', colour: '#2F4A6D' },
];

/** Workspace first, then client spaces by name; archived ones last. */
const spaceOrder = (a: Space, b: Space) =>
  (a.kind === 'workspace' ? -1 : b.kind === 'workspace' ? 1 : 0) || Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name);

const ch = (id: string, spaceId: string, name: string, extra: Partial<Channel> = {}): Channel => ({
  id, spaceId, name, private: false, unread: 0, mentions: 0, memberCount: 4, manageable: name !== 'general', canPin: true, ...extra,
});

const channels: Record<string, Channel[]> = {
  '!pasodrum': [
    ch('!design', '!pasodrum', 'design', { topic: 'Product design, critiques and Figma links', memberCount: 8, outside: [people.la!, ola] }),
    ch('!eng', '!pasodrum', 'eng', { unread: 3, topic: 'Builds, releases and the occasional fire' }),
    ch('!general', '!pasodrum', 'general', { topic: 'Company-wide news and announcements' }),
    ch('!launch-site', '!pasodrum', 'launch-site', { topic: 'Fjell Studio × Pasodrum', memberCount: 6, outside: [people.la!, yui] }),
    ch('!lead', '!pasodrum', 'lead', { private: true, encrypted: true, unread: 2, mentions: 2, memberCount: 2, topic: 'Planning and people topics' }),
  ],
  '!kumo': [ch('!kumo-updates', '!kumo', 'project-updates', { memberCount: 3, outside: [yui] })],
  '!nordlys': [
    ch('!project-updates', '!nordlys', 'project-updates', { memberCount: 4, outside: [people.hd!, ola] }),
    ch('!questions', '!nordlys', 'questions', { memberCount: 4, outside: [people.hd!, ola] }),
  ],
};

const t0 = Date.UTC(2026, 10, 20, 8, 0);
const msg = (n: number, channelId: string, who: keyof typeof people, body: string, minutes: number): Message => ({
  id: `$${channelId}-${n}`, channelId, sender: people[who]!, body, ts: t0 + minutes * 60_000, status: 'sent',
});

const at = (daysAgo: number, h: number, m: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
let seq = 0;
const rich = (channelId: string, who: keyof typeof people, ts: number, extra: Partial<Message>): Message => ({
  id: `$${channelId}-r${seq++}`, channelId, sender: people[who]!, body: '', ts, status: 'sent', ...extra,
});
const media = (ref: string, name: string, extra: Partial<Media> = {}): Media => ({ ref: `mxc://fake/${ref}`, name, ...extra });
const reacted = (key: string, who: (keyof typeof people)[], more = 0): Reaction => ({
  key, count: who.length + more, mine: who.includes('so'), senders: who.map((k) => people[k]!),
});
const pill = (k: keyof typeof people) => `<a href="https://matrix.to/#/${people[k]!.id}" data-mention="${people[k]!.id}">${people[k]!.name}</a>`;

const code = "export function isImeEnter(e: KeyboardEvent) {\n  if (e.key !== 'Enter') return false;\n  return !e.isComposing && e.keyCode !== 229;\n}";
const releaseItems = [
  'Sign in with a work email or a username', 'Workspace and client spaces on the rail', 'Channels with unread and mention counts',
  'Timeline, day dividers and the plain-text composer', 'English and Japanese, light and dark', 'Offline, reconnecting and back-online banners',
  'Sending and not-sent states with retry',
];
const release = [
  '<p><strong>M1 release notes</strong></p>',
  '<p>The walking skeleton is live at <a href="https://pasodrum.work">pasodrum.work</a>. Here is everything that changed since the last build, so nobody has to dig through the board.</p>',
  `<ul>${releaseItems.map((x) => `<li>${x}</li>`).join('')}</ul>`,
  '<p>Not in yet: attachments, reactions, threads. Those land in M2 and M3.</p>',
  '<p>Tested on Chrome and Safari on macOS, plus Japanese IME. The Element X smoke test on production passed on Tuesday.</p>',
  '<p>Next up is M2, the full timeline. Designs are in review this week.</p>',
  '<p>Known issues: the drawer under 1000 px keeps its scroll position, and the language switch needs a reload in Safari.</p>',
  '<p>Thanks everyone for testing on short notice.</p>',
  '<p>Questions in this channel, bugs on the board.</p>',
].join('');

const q1 = 'Open question: should guests see messages from before they joined?';
const a1 = 'Only when the channel is shared with them from day one. Otherwise they start fresh.';

function generalHistory(): Message[] {
  const g = '!general';
  const list: Message[] = [];
  const add = (who: keyof typeof people, ts: number, extra: Partial<Message>) => {
    const m = rich(g, who, ts, extra);
    list.push(m);
    return m;
  };
  add('ih', at(1, 16, 42), { body: 'Pushed onboarding v3 to Figma. Biggest change: we never ask people for a server address anymore. Their work email decides where they land.' });
  add('ih', at(1, 16, 50), { kind: 'system', system: { joined: [people.ml!, people.la!, people.ek!], left: [] } });
  list.push({ ...msg(1, g, 'jb', 'Nordlys review moved to Thursday 14:00.', 0), ts: at(0, 9, 14), pinned: true, reactions: [reacted('👍', ['so', 'ih', 'ml']), reacted('🙌', ['ek'])] });
  list.push({ ...msg(2, g, 'jb', 'Agenda in the doc.', 0), ts: at(0, 9, 14) });
  const q = add('jb', at(0, 9, 15), { body: q1 });
  const a = add('ih', at(0, 9, 20), { body: a1, replyTo: { id: q.id, sender: q.sender, body: q1, found: true } });
  add('tr', at(0, 9, 34), { body: 'Same on my phone: 1.3 s.', replyTo: { id: '$elsewhere', sender: people.ek, body: 'Staging is green. Cold start for the desktop app is down to 1.2 s after the sync rewrite.', found: false } });
  add('so', at(0, 9, 40), { body: 'Agreed. I’ll put it in the spec.', replyTo: { id: a.id, sender: a.sender, body: a1, found: true } });
  list.push({ ...msg(3, g, 'ty', 'これはテストです。木曜日のレビューに参加します。', 0), ts: at(0, 9, 44), edited: true });
  add('ty', at(0, 9, 45), { kind: 'deleted' });
  add('tr', at(0, 9, 46), { kind: 'unsupported', body: 'Where should the offsite be? Oslo, Bergen, Tromsø' });
  add('ek', at(0, 9, 47), { kind: 'unsupported' });
  list.push({ ...msg(4, g, 'ih', 'Board and shared docs for them, nothing internal.', 0), ts: at(0, 9, 50) });
  add('ih', at(0, 9, 52), {
    body: 'Sofia Olsen can you take a pass on the empty states for the channel list? The current ones feel loud.',
    html: `${pill('so')} can you take a pass on the empty states for the channel list? The current ones feel loud.`,
    mentionsMe: true,
  });
  add('ih', at(0, 9, 52), { kind: 'image', media: media('screen', 'empty-states.png', { width: 640, height: 400 }) });
  add('ml', at(0, 10, 2), {
    pinned: true,
    links: ['https://pasodrum.work/spec/composer'],
    body: 'Composer rules, final version: …',
    html: '<p>Composer rules, <strong>final</strong> version:</p><ol><li><strong>Enter</strong> sends, <code>Shift</code> + <code>Enter</code> adds a line</li><li>Paste a URL over selected text to make it a link</li><li>Drafts stay <del>in the cloud</del> <em>on this device</em></li></ol><blockquote>One line of copy, one clear action.</blockquote><p>Details in <a href="https://pasodrum.work/spec/composer">pasodrum.work/spec/composer</a></p>',
  });
  add('ek', at(0, 10, 10), {
    body: 'Fix for the isImeEnter() guard. Safari sends one more Enter right after composition:',
    html: `<p>Fix for the <code>isImeEnter()</code> guard. Safari sends one more Enter right after composition:</p><pre><code>${code.replace(/</g, '&lt;')}</code></pre>`,
  });
  add('ih', at(0, 10, 20), { body: 'Photos from the Nordlys workshop.' });
  for (const [ref, name] of [['wall', 'wall.jpg'], ['team', 'team.jpg'], ['sketch', 'sketch.jpg'], ['desk', 'desk.jpg'], ['screen', 'screen.jpg'], ['header', 'header.jpg']]) {
    add('ih', at(0, 10, 20), { kind: 'image', media: media(ref!, name!, { width: 1200, height: 800 }) });
  }
  add('ml', at(0, 10, 32), { body: 'Final crop for the header:' });
  add('ml', at(0, 10, 32), { kind: 'image', media: media('header', 'header-final.jpg', { width: 1440, height: 808 }) });
  add('ek', at(0, 10, 40), { body: 'Cold start after the sync rewrite, screen recording:' });
  add('ek', at(0, 10, 40), { kind: 'video', media: media('rec', 'cold-start.mov', { width: 1280, height: 720, durationMs: 42_000, thumbnailRef: 'mxc://fake/screen' }) });
  add('la', at(0, 10, 52), { body: 'Henrik’s interview, for the research notes.' });
  add('la', at(0, 10, 52), { kind: 'audio', media: media('interview', 'nordlys-interview-03.m4a', { durationMs: 728_000, mimetype: 'audio/mp4' }) });
  add('ih', at(0, 11, 1), { body: 'Signed contract from Nordlys.' });
  add('ih', at(0, 11, 1), { kind: 'file', pinned: true, media: media('contract', 'Nordlys-contract-signed.pdf', { size: 2_400_000 }) });
  add('jb', at(0, 11, 10), { body: 'Everything for Thursday:' });
  for (const [name, size] of [['agenda-thursday.docx', 86_000], ['budget-2027.xlsx', 312_000], ['nordlys-kickoff.key', 18_200_000], ['brand-assets.zip', 64_900_000]] as const) {
    add('jb', at(0, 11, 10), { kind: 'file', media: media(name, name, { size }) });
  }
  add('la', at(0, 11, 20), { body: 'M1 release notes …', html: release, links: ['https://pasodrum.work'] });
  // M7: a link with a card, one whose page has no preview.
  add('ml', at(0, 11, 22), { body: 'Onboarding v3 in Figma: https://www.figma.com/design/Onb0ardV3/Onboarding-v3', links: ['https://www.figma.com/design/Onb0ardV3/Onboarding-v3'] });
  add('tr', at(0, 11, 23), { body: 'Call notes: https://notes.example.com/nordlys-call', links: ['https://notes.example.com/nordlys-call'] });
  add('ek', at(0, 11, 24), { body: 'Thanks Lea. Ship it.', reactions: [reacted('🚢', ['ih', 'ml', 'jb'])] });
  add('la', at(0, 11, 30), {
    body: 'Add people is live for everyone 🎉',
    reactions: [
      reacted('🎉', ['jb', 'ml', 'so'], 21), reacted('🚀', ['ek'], 11), reacted('👏', ['ih'], 8), reacted('❤️', ['so', 'tr'], 5),
      reacted('🔥', ['jb'], 4), reacted('💯', ['ml'], 2), reacted('😮', ['tr', 'ek']), reacted('🙏', ['ih']),
    ],
  });
  add('so', at(0, 11, 48), { body: 'On it. One line of copy, one clear action.', edited: true });
  return list;
}

function engHistory(): Message[] {
  const e = '!eng';
  return [
    rich(e, 'ek', at(0, 8, 40), { id: '$!eng-sync', body: 'Sync rewrite is merged. Cold start is down to 1.2 s.' }),
    rich(e, 'so', at(0, 8, 52), { body: 'Nice. I’ll check it on Safari.' }),
    rich(e, 'jb', at(0, 9, 30), { body: 'Staging deploy is green.' }),
    rich(e, 'ek', at(0, 9, 41), { body: 'Release notes are in the doc.' }),
    rich(e, 'ih', at(0, 9, 47), { body: 'Can someone review the upload limits PR?' }),
  ];
}

// Thread replies per root id (ThreadNew, ClientThread boards). Roots carry a matching `thread` summary.
const reply = (rootId: string, channelId: string, who: keyof typeof people, ts: number, body: string): Message => ({
  id: `${rootId}-t${seq++}`, channelId, sender: people[who]!, body, ts, status: 'sent',
});
const threadReplies: Record<string, () => Message[]> = {
  '$!general-1': () => [
    reply('$!general-1', '!general', 'ih', at(0, 9, 20), 'Yes, and in the UI it’s always a “client space”. Never a room, never an ID.'),
    reply('$!general-1', '!general', 'so', at(0, 9, 26), 'Agreed. They join from an email link. No handle to copy, no server to pick.'),
    reply('$!general-1', '!general', 'jb', at(0, 9, 41), 'Perfect. Board and shared docs for them; internal channels stay invisible.'),
    reply('$!general-1', '!general', 'ml', at(0, 10, 8), 'I’ll draft the welcome note they see the first time they open it.'),
  ],
  // M6 (UndecryptableThread): one reply this device can't open, one whose key is still arriving.
  '$!lead-q1': () => [
    reply('$!lead-q1', '!lead', 'jb', at(0, 8, 10), 'Added ours. Hiring is the big one.'),
    { ...reply('$!lead-q1', '!lead', 'la', at(0, 8, 22), ''), kind: 'undecryptable' },
    { ...reply('$!lead-q1', '!lead', 'ek', at(0, 8, 31), ''), id: '$!lead-q1-arriving', kind: 'undecryptable', arriving: true },
  ],
  '$!eng-sync': () => [
    reply('$!eng-sync', '!eng', 'jb', at(0, 8, 47), 'Great news. Who should test sign-in on Safari?'),
    reply('$!eng-sync', '!eng', 'ek', at(0, 9, 2), 'Sofia offered. I’ll send the build link.'),
    // M7: a file in a thread shows in the Files tab too.
    { ...reply('$!eng-sync', '!eng', 'ek', at(0, 9, 3), ''), kind: 'file', media: media('build', 'pasodrum-web-build.zip', { size: 8_400_000 }) },
  ],
};

/** A root's summary from its replies; `unread` when someone else wrote after I last looked. */
function withThread(m: Message, unread = false): Message {
  const replies = threadReplies[m.id]?.();
  if (!replies?.length) return m;
  const participants = [...new Map(replies.map((r) => [r.sender.id, r.sender])).values()];
  return { ...m, thread: { count: replies.length, lastTs: replies.at(-1)!.ts, participants, unread } };
}

// M3 (Batch C DMs, Threads, Activity boards): DMs with history, followed threads, mentions and replies to Sofia.
const dmHistory: Record<string, () => Message[]> = {
  '!dm-jonas': () => [
    // M6 (UndecryptableDM): from before this device was confirmed; a run from one sender collapses.
    ...[0, 1, 2].map((i) => rich('!dm-jonas', 'jb', at(1, 16, 40 + i), { kind: 'undecryptable' })),
    rich('!dm-jonas', 'so', at(1, 16, 52), { kind: 'undecryptable' }),
    rich('!dm-jonas', 'jb', at(0, 9, 2), { body: 'Can you look at the client welcome copy today?' }),
    rich('!dm-jonas', 'so', at(0, 9, 5), { body: 'Yes, right after standup.' }),
    rich('!dm-jonas', 'so', at(0, 9, 5), { body: 'Drafting it in the thread so Maja sees it too.' }),
    rich('!dm-jonas', 'jb', at(0, 10, 12), { body: 'Got a minute before the Nordlys call?' }),
  ],
  // SIDE-03: Henrik reset and Sofia shared the history back; the older messages are `restored` (only the client sees that flag).
  '!dm-henrik': () => [
    rich('!dm-henrik', 'so', at(2, 14, 3), { body: 'Welcome to Pasodrum work, Henrik. This is where we talk one to one.', restored: true }),
    rich('!dm-henrik', 'hd', at(2, 14, 10), { body: 'Thanks! 来週の打ち合わせの資料を送ります。', restored: true }),
    rich('!dm-henrik', 'so', at(2, 14, 12), { body: 'Perfect, the agenda is in the doc.', restored: true }),
    rich('!dm-henrik', 'so', at(0, 9, 30), { kind: 'system', system: { joined: [], left: [], historyShared: { by: people.so! } } }),
    rich('!dm-henrik', 'hd', at(0, 9, 40), { body: 'Morning! Where can I find the new screens?' }),
    rich('!dm-henrik', 'so', at(0, 9, 58), { body: 'I’ll send the sign-in screens tomorrow.' }),
  ],
  '!dm-ingrid': () => [rich('!dm-ingrid', 'ih', at(0, 9, 40), { body: 'Lunch at 12?' }), ingridLast],
  '!dm-erik-lea': () => [
    rich('!dm-erik-lea', 'ek', at(1, 15, 2), { body: 'Is the M2 summary ready?' }),
    rich('!dm-erik-lea', 'la', at(1, 15, 20), { body: 'Release notes are in the doc.' }),
  ],
  '!dm-maja': () => [rich('!dm-maja', 'so', at(4, 11, 0), { body: 'Thanks!' })],
};

// M6: the DM list preview of a message this device can't open.
const ingridLast = rich('!dm-ingrid', 'ih', at(0, 9, 41), { kind: 'undecryptable' });

// M6: every DM is end-to-end encrypted (D-11).
function sampleDms() {
  const dm = (id: string, who: (keyof typeof people)[], lastTs: number, spaceIds: string[], unread = 0) => ({
    id, people: who.map((k) => people[k]!), unread, mentions: unread, lastTs, spaceIds, encrypted: true, canPin: true,
  });
  return [
    dm('!dm-jonas', ['jb'], at(0, 10, 12), ['!pasodrum', '!nordlys'], 1),
    dm('!dm-henrik', ['hd'], at(0, 9, 58), ['!nordlys']),
    { ...dm('!dm-ingrid', ['ih'], at(0, 9, 41), ['!pasodrum', '!nordlys']), last: ingridLast },
    dm('!dm-erik-lea', ['ek', 'la'], at(1, 15, 20), ['!pasodrum']),
    dm('!dm-maja', ['ml'], at(4, 11, 0), ['!pasodrum', '!nordlys']),
    dm('!dm-tove', ['tr'], at(9, 16, 0), ['!pasodrum']),
  ];
}

function sampleThreads(): ThreadSummary[] {
  const root = (channelId: string, id: string, who: keyof typeof people, ts: number, extra: Partial<Message>): Message => ({
    id, channelId, sender: people[who]!, body: '', ts, status: 'sent', ...extra,
  });
  const general = threadReplies['$!general-1']!();
  const eng = threadReplies['$!eng-sync']!();
  return [
    {
      channelId: '!general', rootId: '$!general-1', count: general.length, unread: true, lastTs: general.at(-1)!.ts, lastReply: general.at(-1),
      root: root('!general', '$!general-1', 'jb', at(0, 9, 14), { body: 'Nordlys review moved to Thursday 14:00.' }),
    },
    {
      channelId: '!eng', rootId: '$!eng-sync', count: eng.length, unread: false, lastTs: eng.at(-1)!.ts, lastReply: eng.at(-1),
      root: root('!eng', '$!eng-sync', 'ek', at(0, 8, 40), { body: 'Sync rewrite is merged. Cold start is down to 1.2 s.' }),
    },
    {
      channelId: '!lead', rootId: '$!lead-q1', count: 3, unread: false, lastTs: at(1, 16, 40),
      root: root('!lead', '$!lead-q1', 'ih', at(1, 7, 55), {
        body: 'Q1 planning doc is up. Sofia Olsen Jonas Berg please add your team’s priorities by Friday.',
        html: `Q1 planning doc is up. ${pill('so')} ${pill('jb')} please add your team’s priorities by Friday.`,
      }),
      lastReply: root('!lead', '$!lead-q1-r', 'jb', at(1, 16, 40), { body: 'Added ours. Hiring is the big one.' }),
    },
  ];
}

function sampleActivity(): ActivityItem[] {
  const item = (id: string, kind: ActivityItem['kind'], channelId: string, who: keyof typeof people, ts: number, extra: Partial<Message>, more: Partial<ActivityItem> = {}): ActivityItem => ({
    id, kind, channelId, unread: false, ...more,
    message: { id: `$act-${id}`, channelId, sender: people[who]!, body: '', ts, status: 'sent', ...extra },
  });
  const mine = (body: string) => ({ id: '$mine', sender: people.so, body, found: true });
  return [
    item('a1', 'mention', '!general', 'ih', at(0, 9, 52), {
      body: 'Sofia Olsen can you take a pass on the empty states for the channel list? The current ones feel loud.',
      html: `${pill('so')} can you take a pass on the empty states for the channel list? The current ones feel loud.`, mentionsMe: true,
    }, { unread: true }),
    item('a2', 'reply', '!general', 'jb', at(0, 9, 50), {
      body: 'Love it. Can the client space get the same treatment?', replyTo: mine('On it. One line of copy, one clear action.'),
    }, { unread: true }),
    item('a3', 'mention', '!general', 'ml', at(0, 9, 20), {
      body: 'Sofia Olsen can you check the welcome note before I post it?',
      html: `${pill('so')} can you check the welcome note before I post it?`, mentionsMe: true,
    }, { threadRootId: '$!general-1' }),
    item('a4', 'mention', '!eng', 'ek', at(0, 8, 22), {
      body: 'Works for me. Sofia Olsen the invite email template is ready for copy whenever you are.',
      html: `Works for me. ${pill('so')} the invite email template is ready for copy whenever you are.`, mentionsMe: true,
    }),
    item('a5', 'mention', '!lead', 'ih', at(0, 7, 55), {
      body: 'Q1 planning doc is up. Sofia Olsen Jonas Berg please add your team’s priorities by Friday.',
      html: `Q1 planning doc is up. ${pill('so')} ${pill('jb')} please add your team’s priorities by Friday.`, mentionsMe: true,
    }),
    item('a6', 'reply', '!general', 'la', at(3, 14, 5), {
      body: 'I do. Left it at the front desk.', replyTo: mine('Who has the key for the meeting room?'),
    }),
  ];
}

// M6 (UndecryptableThread): a private channel; this device can't open the first message.
function leadHistory(): Message[] {
  return [
    rich('!lead', 'ek', at(0, 7, 41), { kind: 'undecryptable' }),
    // M7: files in an encrypted channel (the Files tab scans them after decrypting).
    rich('!lead', 'ih', at(0, 7, 50), { kind: 'file', media: media('q1-plan', 'Q1-plan.pdf', { size: 420_000 }) }),
    rich('!lead', 'ih', at(0, 7, 51), { kind: 'image', media: media('desk', 'offsite-venue.jpg', { width: 1200, height: 800 }) }),
    withThread(rich('!lead', 'ih', at(0, 7, 55), {
      id: '$!lead-q1',
      body: 'Q1 planning doc is up. Sofia Olsen Jonas Berg please add your team’s priorities by Friday.',
      html: `Q1 planning doc is up. ${pill('so')} ${pill('jb')} please add your team’s priorities by Friday.`,
      mentionsMe: true,
    })),
  ];
}

// M8: older history only search reaches (not in any timeline, so a jump to it can't find it).
const archive: Message[] = [
  rich('!general', 'ty', at(40, 10, 5), { body: 'キックオフの議事録を共有しました。レビューをお願いします。' }),
  rich('!general', 'jb', at(41, 9, 0), { body: 'Kickoff notes for Nordlys are in the shared folder.' }),
  rich('!dm-henrik', 'hd', at(35, 16, 20), { body: 'キックオフ、ありがとうございました！', restored: true }),
  rich('!eng', 'ek', at(50, 11, 0), { body: 'ＴＥＳＴ build for the kickoff demo is up.' }),
];

const history: Record<string, () => Message[]> = {
  '!general': () => generalHistory().map((m) => withThread(m, true)),
  '!lead': leadHistory,
  '!eng': () => engHistory().map((m) => withThread(m)),
  ...dmHistory,
};

// M7: link cards by URL; anything else has no preview.
const PREVIEWS: Record<string, LinkPreview> = {
  'https://pasodrum.work': { url: 'https://pasodrum.work', title: 'Pasodrum work', description: 'One workspace for the team and every client.', site: 'pasodrum.work' },
  'https://pasodrum.work/spec/composer': { url: 'https://pasodrum.work/spec/composer', title: 'Composer rules', description: 'Enter sends, Shift + Enter adds a line, drafts stay on this device.', site: 'pasodrum.work' },
  'https://www.figma.com/design/Onb0ardV3/Onboarding-v3': {
    url: 'https://www.figma.com/design/Onb0ardV3/Onboarding-v3', title: 'Onboarding v3 – Figma', description: 'Created with Figma', site: 'Figma', image: 'mxc://fake/sketch',
  },
};

const ART: Record<string, [string, string, string]> = {
  wall: ['#EFE9DE', '#D9CFBF', '#F2C94C'],
  team: ['#123A34', '#1F5A50', '#3DD6A5'],
  sketch: ['#FBFBF9', '#E9E8E3', '#0E7C66'],
  desk: ['#D8B48E', '#5B3E30', '#FFECC4'],
  screen: ['#FFFFFF', '#ECEAE4', '#1D4ED8'],
  header: ['#F4C99E', '#3E2A44', '#FFE2AA'],
};

/** A small SVG "photo" per media ref, so dev screens show distinct images without files. */
function fakeArt(ref: string): string {
  const [a, b, c] = ART[ref.replace('mxc://fake/', '')] ?? ['#0E7C66', '#123A34', '#3DD6A5'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient><radialGradient id="r"><stop offset="0" stop-color="${c}" stop-opacity=".9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="780" cy="420" r="320" fill="url(#r)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export interface FakeStoreOptions {
  connection?: ConnectionState;
  me?: Person;
  /** Delay before timelines finish loading; 0 = instant. */
  loadMs?: number;
  /** Delay before media URLs resolve, to see the placeholders. */
  mediaMs?: number;
  /** Time an upload takes, with progress; 0 = finished at once. */
  uploadMs?: number;
  /** Thread replies fail to load (ThreadError); Retry loads them. */
  threadFails?: boolean;
  /** M4. My role per space (default: Owner everywhere). */
  roles?: Record<string, Role>;
  /** M5/D-36. Signed in as the client (Henrik: Nordlys only) or an External (Ola: #design and Nordlys), as the server would show them. */
  perspective?: 'client' | 'external';
  /** M6. Start state of this device (default: confirmed, recovery key saved). */
  security?: Partial<Security>;
  /** M6. newRecoveryKey asks for the password first (RecoveryKeyPassword). */
  keyNeedsPassword?: boolean;
  /** M6. A backup exists this device can't open: newRecoveryKey rejects 'backup-unreadable' until useRecoveryKey succeeds. */
  backupUnreadable?: boolean;
  /** M6. signOutRisk answer (default 'none'). */
  signOutRisk?: 'none' | 'last-device' | 'no-backup';
  /** SIDE-03. People whose identity I've already confirmed (personConfirmed). An incoming request: `security.confirmation` with role 'person', phase 'asked'. */
  confirmedPeople?: string[];
  /** SIDE-03. People who haven't set up again yet: shareHistory rejects 'not-ready'. */
  notReadyPeople?: string[];
  /** D-38 (with security.confirmByEmail). The link is tapped this long after the email goes out; unset = never. */
  emailTapMs?: number;
  /** D-38. Email me a link fails with this ('no-key': nothing held for the account yet). */
  emailFails?: NonNullable<EmailConfirm['error']>;
  /** D-38. A help card from Pasodrum waits in a system DM (staff side). */
  helpCard?: HelpReason;
}

/** M6. The fake account's recovery key; useRecoveryKey accepts it without spaces (the UI strips them), case-sensitive. */
export const FAKE_RECOVERY_KEY = 'EsTc 3vJH 9pLm Qx2R 7nWd Kf4A Zb8Y Hu6G Ve1T Rs5C Pj0N Mq3X';
// Indexes into the Matrix SAS emoji table (as on the ConfirmCompare board).
const SAS: SasEmoji[] = [
  { emoji: '🐶', index: 0 }, { emoji: '🦄', index: 4 }, { emoji: '🌵', index: 17 }, { emoji: '🍕', index: 27 },
  { emoji: '🚀', index: 54 }, { emoji: '🎸', index: 57 }, { emoji: '🐧', index: 10 },
];

/** M5/D-36. What a client or External gets from the server (RulesM5 shells): their spaces and channels, no outside marks, no access data. */
function outsideView(perspective: 'client' | 'external', me: Person | undefined): { view: Partial<WorkspaceSnapshot>; visible: string[] } {
  const plain = (c: Channel): Channel => {
    const rest = { ...c };
    delete rest.outside;
    return rest;
  };
  const dms = (keys: string[], spaceId: string) =>
    sampleDms()
      .filter((d) => d.people.length === 1 && keys.some((k) => people[k]!.id === d.people[0]!.id))
      .map((d) => ({ ...d, spaceIds: [spaceId] }));
  const empty = { threads: [], activity: [], typing: {}, accessRoles: [], externals: {} };
  // Like the real store: my own Person never carries `external`, whoever I am.
  const self = (p: Person): Person => {
    const copy = { ...p };
    delete copy.external;
    delete copy.client;
    return copy;
  };
  if (perspective === 'client') {
    return {
      visible: [people.so!.id, people.jb!.id, people.ih!.id],
      view: {
        ...empty,
        me: self(me ?? people.hd!),
        spaces: spaces.filter((sp) => sp.id === '!nordlys'),
        channels: { '!nordlys': channels['!nordlys']!.map(plain) },
        dms: [...dms(['jb', 'ih'], '!nordlys'), { ...sampleDms().find((d) => d.id === '!dm-henrik')!, people: [people.so!], spaceIds: ['!nordlys'] }],
        myRoles: { '!nordlys': 'client' },
      },
    };
  }
  return {
    visible: [people.ih!.id, people.jb!.id, people.so!.id, people.ml!.id, people.ek!.id, people.la!.id, people.tr!.id, people.hd!.id],
    view: {
      ...empty,
      me: self(me ?? ola),
      spaces: spaces.filter((sp) => sp.id === '!pasodrum' || sp.id === '!nordlys'),
      channels: { '!pasodrum': [plain(channels['!pasodrum']![0]!)], '!nordlys': channels['!nordlys']!.map(plain) },
      dms: dms(['jb', 'ml'], '!pasodrum'),
      myRoles: { '!pasodrum': 'external', '!nordlys': 'external' },
    },
  };
}

export function createFakeStore(opts: FakeStoreOptions = {}): WorkspaceStore & { set(patch: Partial<WorkspaceSnapshot>): void } {
  let accessRoles = accessRoleSeed.map((r) => ({ ...r, channels: [...r.channels], spaces: [...r.spaces] }));
  const externalRecords: Record<string, ExternalRecord> = structuredClone(externalSeed);
  const myRoles = opts.roles ?? { '!pasodrum': 'owner', '!kumo': 'owner', '!nordlys': 'owner' };
  let snapshot: WorkspaceSnapshot = {
    me: opts.me ?? people.so!,
    connection: opts.connection ?? 'online',
    spaces,
    // E2: only Owners and Admins manage channels they didn't make.
    channels: Object.fromEntries(
      Object.entries(channels).map(([k, v]) => [k, opts.roles?.[k] && opts.roles[k] !== 'owner' && opts.roles[k] !== 'admin' ? v.map((c) => ({ ...c, manageable: false })) : v]),
    ),
    timelines: {},
    sessionExpired: false,
    typing: { '!eng': [people.jb!] },
    uploads: {},
    dms: sampleDms(),
    threads: sampleThreads(),
    threadTimelines: {},
    activity: sampleActivity(),
    myRoles,
    security: { device: 'confirmed', otherConfirmedDevices: 2, needsRecoveryKey: false, confirmByEmail: false, ...opts.security },
    ...accessView(myRoles, accessRoles, externalRecords),
  };
  const outsider = opts.perspective ? outsideView(opts.perspective, opts.me) : undefined;
  if (outsider) snapshot = { ...snapshot, ...outsider.view };
  const help = opts.helpCard ? helpDm(opts.helpCard) : undefined;
  if (help) snapshot = { ...snapshot, dms: [help.dm, ...snapshot.dms] };
  const listeners = new Set<() => void>();
  let localId = 0;

  const set = (patch: Partial<WorkspaceSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((l) => l());
  };
  const setTimeline = (channelId: string, next: Partial<Timeline>) => {
    const prev = snapshot.timelines[channelId] ?? { messages: [], initialLoading: false, loadingOlder: false, hasOlder: false };
    set({ timelines: { ...snapshot.timelines, [channelId]: { ...prev, ...next } } });
  };
  const patchUpload = (channelId: string, id: string, patch: Partial<Upload>) =>
    set({ uploads: { ...snapshot.uploads, [channelId]: (snapshot.uploads[channelId] ?? []).map((u) => (u.id === id ? { ...u, ...patch } : u)) } });
  const progressUpload = (channelId: string, id: string, ms: number, end: 'done' | 'failed') => {
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      setTimeout(() => {
        if (!(snapshot.uploads[channelId] ?? []).some((u) => u.id === id)) return;
        patchUpload(channelId, id, i < steps ? { progress: i / steps } : end === 'failed' ? { status: 'failed', progress: 0.6 } : { status: 'done', progress: 1 });
      }, (ms / steps) * i);
    }
  };
  const messagesOf = (channelId: string) => snapshot.timelines[channelId]?.messages ?? [];
  const setThread = (rootId: string, next: Partial<Timeline> & { failed?: boolean }) => {
    const prev = snapshot.threadTimelines[rootId] ?? { messages: [], initialLoading: false, loadingOlder: false, hasOlder: false };
    set({ threadTimelines: { ...snapshot.threadTimelines, [rootId]: { ...prev, ...next } } });
  };
  /** Where a draft lands: the thread's timeline, or the channel's. */
  const listOf = (channelId: string, draft?: Pick<Draft, 'threadRootId'>) =>
    draft?.threadRootId ? (snapshot.threadTimelines[draft.threadRootId]?.messages ?? []) : messagesOf(channelId);
  const setList = (channelId: string, draft: Pick<Draft, 'threadRootId'> | undefined, messages: Message[]) =>
    draft?.threadRootId ? setThread(draft.threadRootId, { messages }) : setTimeline(channelId, { messages });
  /** Changes one message wherever it shows: the channel and any open thread. */
  const patchMessage = (channelId: string, messageId: string, fn: (m: Message) => Message) => {
    const map = (list: Message[]) => (list.some((x) => x.id === messageId) ? list.map((x) => (x.id === messageId ? fn(x) : x)) : list);
    const threadTimelines = Object.fromEntries(
      Object.entries(snapshot.threadTimelines).map(([k, tl]) => {
        const messages = map(tl.messages);
        return [k, messages === tl.messages ? tl : { ...tl, messages }];
      }),
    );
    const tl = snapshot.timelines[channelId];
    set({ threadTimelines, ...(tl ? { timelines: { ...snapshot.timelines, [channelId]: { ...tl, messages: map(tl.messages) } } } : {}) });
  };
  let failThreads = !!opts.threadFails;
  let myZone: string | undefined;
  const levels: Record<string, NotifyLevel> = {};
  const settings: Record<string, string> = {};
  // M6: this device follows security.device; Safari on Mac signed in a minute ago and isn't confirmed (SettingsDevicesM6).
  let devices: Device[] = [
    { id: 'WEB1', name: 'Chrome on Mac', lastSeenTs: Date.now(), current: true, confirmed: snapshot.security.device !== 'unconfirmed' },
    { id: 'IOS1', name: 'Safari on Mac', lastSeenTs: Date.now() - 60_000, current: false, confirmed: false },
    { id: 'IOS2', name: 'Element X on iPhone', lastSeenTs: Date.now() - 86_400_000, current: false, confirmed: true },
    { id: 'WIN1', name: 'Firefox on Windows', lastSeenTs: Date.now() - 8 * 86_400_000, current: false, confirmed: true },
  ];
  // M4/D-36: workspace roles (PeopleWorkspace board), channel members and pending people.
  const roleOf: Record<string, Role> = { [people.ih!.id]: 'admin', [people.hd!.id]: 'client', [ola.id]: 'external', [people.la!.id]: 'external', [yui.id]: 'external' };
  // D-36: the workspace's own people (Owner/Admin/Staff), me first.
  const staffIds = [people.so!.id, people.ih!.id, people.jb!.id, people.ml!.id, people.ek!.id, people.tr!.id];
  // Added by email, not joined yet: a pending member (role External) plus a pending invite with the join link.
  const waiting = new Map<string, Person>();
  const kari = byEmail('kari@nordlys.no');
  waiting.set(kari.id, kari);
  waiting.set(yui.id, yui);
  const role = (id: string): Role => (id === snapshot.me.id ? (snapshot.myRoles['!pasodrum'] ?? 'staff') : (roleOf[id] ?? 'staff'));
  const memberIds: Record<string, string[]> = {
    '!design': [people.ih!.id, people.jb!.id, people.so!.id, people.ml!.id, people.ek!.id, people.la!.id, people.tr!.id, ola.id, kari.id],
    '!launch-site': [people.so!.id, people.jb!.id, people.ml!.id, people.la!.id, yui.id],
    '!kumo-updates': [people.so!.id, people.jb!.id, yui.id],
    '!lead': [people.ih!.id, people.so!.id],
    '!project-updates': [people.hd!.id, people.jb!.id, people.so!.id, ola.id],
    '!questions': [people.hd!.id, people.jb!.id, people.so!.id, ola.id],
  };
  const membersOf = (channelId: string) => (memberIds[channelId] ??= [people.ih!.id, people.jb!.id, people.so!.id, people.ml!.id, people.ek!.id]);
  const pendingBy: Record<string, PendingInvite[]> = {
    '!design': [{ code: 'kari', email: 'kari@nordlys.no', role: 'external', createdTs: Date.now() - 3_600_000, link: 'https://pasodrum.work/join/kari' }],
    '!launch-site': [{ code: 'yui', email: 'yui.sato@kotoba.jp', role: 'external', createdTs: Date.now() - 7_200_000, link: 'https://pasodrum.work/join/yui' }],
  };
  const browse = Object.fromEntries(Object.entries(unjoined).map(([k, v]) => [k, [...v]]));
  const patchChannel = (channelId: string, patch: Partial<Channel>) =>
    set({ channels: Object.fromEntries(Object.entries(snapshot.channels).map(([k, v]) => [k, v.map((c) => (c.id === channelId ? { ...c, ...patch } : c))])) });
  // M5: who is in each client space (team on top, client below).
  const spaceRoster: Record<string, { team: string[]; clients: string[] }> = {
    '!nordlys': { team: [people.so!.id, people.jb!.id, people.ih!.id, ola.id], clients: [people.hd!.id] },
    '!kumo': { team: [people.so!.id, people.jb!.id, yui.id], clients: [] },
  };
  const rosterOf = (spaceId: string) => (spaceRoster[spaceId] ??= { team: [snapshot.me.id], clients: [] });
  const failedOnce = new Set<string>();
  const setSecurity = (patch: Partial<Security>) => set({ security: { ...snapshot.security, ...patch } });
  let backupReadable = !opts.backupUnreadable;
  const setConfirmation = (confirmation: Security['confirmation']) => setSecurity({ confirmation });
  // One copy of each channel's history per store, so pins and files match the timeline.
  const loaded: Record<string, Message[]> = {};
  // SIDE-03: `restored` only shows on the side that received the history (the client).
  const unrestored = (m: Message) => {
    const copy = { ...m };
    delete copy.restored;
    return copy;
  };
  const ownHistory = (list: Message[]) => (opts.perspective === 'client' ? list : list.map(unrestored));
  const historyOf = (channelId: string) => (loaded[channelId] ??= channelId === help?.dm.id ? help.messages : ownHistory(history[channelId]?.() ?? []));
  const confirmedPeople = new Set(opts.confirmedPeople ?? []);
  const isEncrypted = (id: string) => !!Object.values(snapshot.channels).flat().find((c) => c.id === id)?.encrypted || !!snapshot.dms.find((d) => d.id === id)?.encrypted;
  const loadedReplies: Record<string, Message[]> = {};
  const finishLoad = (channelId: string) => setTimeline(channelId, { messages: historyOf(channelId), initialLoading: false });
  // M7: pinned ids per channel, newest pin first.
  const pinned: Record<string, string[]> = {};
  const pinsIn = (channelId: string) => (pinned[channelId] ??= historyOf(channelId).filter((m) => m.pinned).sort((a, b) => b.ts - a.ts).map((m) => m.id));
  const findMessage = (channelId: string, id: string) =>
    [...messagesOf(channelId), ...Object.values(snapshot.threadTimelines).flatMap((tl) => tl.messages), ...historyOf(channelId)].find((m) => m.id === id);
  const canPinIn = (channelId: string) =>
    !!Object.values(snapshot.channels).flat().find((c) => c.id === channelId)?.canPin || !!snapshot.dms.find((d) => d.id === channelId)?.canPin;
  const setPinned = async (channelId: string, messageId: string, on: boolean) => {
    if (!canPinIn(channelId)) throw new Error('not-allowed');
    const rest = pinsIn(channelId).filter((id) => id !== messageId);
    pinned[channelId] = on ? [messageId, ...rest] : rest;
    loaded[channelId] = historyOf(channelId).map((m) => (m.id === messageId ? { ...m, pinned: on || undefined } : m));
    patchMessage(channelId, messageId, (m) => ({ ...m, pinned: on || undefined }));
  };
  const previewMs = opts.loadMs ?? 0;
  // D-36: membership follows access (roles ∪ one-off channels), as the editor's app does it.
  const personOf = (id: string): Person =>
    id === snapshot.me.id ? snapshot.me : ([...Object.values(people), ola].find((p) => p.id === id) ?? waiting.get(id) ?? { id, name: id });
  const uniq = (list: string[]) => [...new Set(list)];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const expectedOf = (r: ExternalRecord) => {
    const held = accessRoles.filter((x) => r.roles.includes(x.id));
    return { channels: uniq([...held.flatMap((x) => x.channels), ...r.channels]), spaces: uniq(held.flatMap((x) => x.spaces)) };
  };
  const publishAccess = () => set(accessView(snapshot.myRoles, accessRoles, externalRecords));
  const follow = (userId: string) => {
    const r = externalRecords[userId];
    if (!r) return;
    const want = expectedOf(r);
    const reach = (rooms: ExternalRecord['rooms']) => new Set([...rooms.channels, ...rooms.spaces.flatMap((sid) => (snapshot.channels[sid] ?? []).map((c) => c.id))]);
    const before = reach(r.rooms);
    const after = reach(want);
    for (const sid of r.rooms.spaces) if (!want.spaces.includes(sid)) rosterOf(sid).team = rosterOf(sid).team.filter((id) => id !== userId);
    for (const sid of want.spaces) if (!rosterOf(sid).team.includes(userId)) rosterOf(sid).team.push(userId);
    for (const id of before) if (!after.has(id)) memberIds[id] = membersOf(id).filter((x) => x !== userId);
    for (const id of after) if (!membersOf(id).includes(userId)) membersOf(id).push(userId);
    r.rooms = want;
    const p = personOf(userId);
    set({
      channels: Object.fromEntries(
        Object.entries(snapshot.channels).map(([k, list]) => [
          k,
          list.map((c) => {
            if (before.has(c.id) === after.has(c.id)) return c;
            const rest = (c.outside ?? []).filter((x) => x.id !== userId);
            const next: Channel = { ...c, outside: after.has(c.id) ? [...rest, p].sort((a, b) => a.name.localeCompare(b.name)) : rest };
            if (!next.outside?.length) delete next.outside;
            return next;
          }),
        ]),
      ),
    });
  };
  const followAll = (ids: string[]): AccessChange => {
    ids.forEach(follow);
    publishAccess();
    return { failed: [] };
  };
  const holders = (roleId: string) => Object.keys(externalRecords).filter((id) => externalRecords[id]!.roles.includes(roleId));
  const mayManage = () => {
    const mine = snapshot.myRoles['!pasodrum'];
    if (mine !== 'owner' && mine !== 'admin') throw new Error('not-allowed');
  };
  const recordOf = (userId: string) => {
    const r = externalRecords[userId];
    if (!r) throw new Error('not-allowed');
    return r;
  };

  return {
    set,
    getSnapshot: () => snapshot,
    docsBoards: createFakeDocsBoards({ perspective: opts.perspective, me: snapshot.me }),
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    openTimeline(channelId) {
      if (snapshot.timelines[channelId]) return;
      setTimeline(channelId, { initialLoading: true });
      if (opts.loadMs) setTimeout(() => finishLoad(channelId), opts.loadMs);
      else finishLoad(channelId);
    },
    loadOlder(channelId) {
      setTimeline(channelId, { hasOlder: false });
    },
    sendText(channelId, body) {
      const m: Message = { id: `~local${localId++}`, channelId, sender: snapshot.me, body, ts: Date.now(), status: 'sending' };
      setTimeline(channelId, { messages: [...messagesOf(channelId), m] });
      setTimeout(() => {
        setTimeline(channelId, {
          messages: messagesOf(channelId).map((x) => (x.id === m.id ? { ...x, status: body.includes('fail') ? 'failed' : 'sent' } : x)),
        });
      }, 300);
    },
    retry(channelId, messageId) {
      setTimeline(channelId, { messages: messagesOf(channelId).map((x) => (x.id === messageId ? { ...x, status: 'sent' } : x)) });
    },
    discard(channelId, messageId) {
      setTimeline(channelId, { messages: messagesOf(channelId).filter((x) => x.id !== messageId) });
    },
    markRead(channelId) {
      const list = snapshot.channels;
      const next = Object.fromEntries(
        Object.entries(list).map(([space, chans]) => [space, chans.map((c) => (c.id === channelId ? { ...c, unread: 0, mentions: 0 } : c))]),
      );
      set({ channels: next, dms: snapshot.dms.map((d) => (d.id === channelId && d.unread ? { ...d, unread: 0, mentions: 0 } : d)) });
    },
    reconnectNow() {
      set({ connection: 'online' });
    },
    // D-33: the other tab lets go at once.
    useHere() {
      if (snapshot.security.device === 'elsewhere') setSecurity({ device: 'confirmed' });
    },
    async signOut() {},
    send(channelId, draft) {
      const original = draft.replyTo ? listOf(channelId, draft).find((x) => x.id === draft.replyTo) : undefined;
      const encrypted = !!Object.values(snapshot.channels).flat().find((c) => c.id === channelId)?.encrypted || !!snapshot.dms.find((d) => d.id === channelId)?.encrypted;
      const links = encrypted ? [] : [...new Set(draft.body.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+[A-Za-z0-9/#=_-]/g) ?? [])];
      const m: Message = {
        id: `~local${localId++}`, channelId, sender: snapshot.me, body: draft.body, html: draft.html, ts: Date.now(), status: 'sending',
        ...(links.length ? { links } : {}),
        replyTo: original ? { id: original.id, sender: original.sender, body: original.body || original.media?.name || '', found: true } : undefined,
      };
      if (draft.body) setList(channelId, draft, [...listOf(channelId, draft), m]);
      const files = (snapshot.uploads[channelId] ?? []).filter((u) => u.status === 'done');
      const sentFiles: Message[] = files.map((u) => ({
        id: `~local${localId++}`, channelId, sender: snapshot.me, body: '', ts: Date.now(), status: 'sending',
        kind: u.mimetype.startsWith('image/') ? 'image' : u.mimetype.startsWith('video/') ? 'video' : u.mimetype.startsWith('audio/') ? 'audio' : 'file',
        media: { ref: u.previewUrl ?? `mxc://fake/${u.name}`, name: u.name, size: u.size, mimetype: u.mimetype },
      }));
      if (files.length) {
        set({ uploads: { ...snapshot.uploads, [channelId]: (snapshot.uploads[channelId] ?? []).filter((u) => u.status === 'uploading') } });
        setList(channelId, draft, [...listOf(channelId, draft), ...sentFiles]);
      }
      const ids = new Set([m.id, ...sentFiles.map((x) => x.id)]);
      const root = draft.threadRootId;
      if (root && (draft.body || files.length)) {
        patchMessage(channelId, root, (x) => {
          const t = x.thread ?? { count: 0, lastTs: 0, participants: [], unread: false };
          const participants = t.participants.some((p) => p.id === snapshot.me.id) ? t.participants : [...t.participants, snapshot.me];
          return { ...x, thread: { ...t, count: t.count + ids.size - (draft.body ? 0 : 1), lastTs: Date.now(), participants } };
        });
      }
      setTimeout(() => {
        setList(channelId, draft, listOf(channelId, draft).map((x) => (ids.has(x.id) ? { ...x, status: draft.body.includes('fail') ? 'failed' : 'sent' } : x)));
      }, 300);
    },
    edit(channelId, messageId, draft) {
      patchMessage(channelId, messageId, (x) => ({ ...x, body: draft.body, html: draft.html, edited: true }));
    },
    remove(channelId, messageId) {
      patchMessage(channelId, messageId, (x) => ({ ...x, kind: 'deleted', body: '', html: undefined }));
    },
    react(channelId, messageId, key) {
      patchMessage(channelId, messageId, (x) => {
          const list = x.reactions ?? [];
          const hit = list.find((r) => r.key === key);
          if (hit?.mine) return x;
          const next = hit
            ? list.map((r) => (r.key === key ? { ...r, count: r.count + 1, mine: true, senders: [...r.senders, snapshot.me] } : r))
            : [...list, { key, count: 1, mine: true, senders: [snapshot.me] }];
          return { ...x, reactions: next };
      });
    },
    unreact(channelId, messageId, key) {
      patchMessage(channelId, messageId, (x) => {
          const next = (x.reactions ?? [])
            .map((r) => (r.key === key && r.mine ? { ...r, count: r.count - 1, mine: false, senders: r.senders.filter((p) => p.id !== snapshot.me.id) } : r))
            .filter((r) => r.count > 0);
          return { ...x, reactions: next };
      });
    },
    attach(channelId, files) {
      const ms = opts.uploadMs ?? 0;
      const added: Upload[] = files.map((f) => {
        const end = f.size > 50 * 1024 * 1024 ? ('too-large' as const) : f.name.includes('fail') ? ('failed' as const) : ('done' as const);
        const previewUrl = f.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(f) : undefined;
        return { id: `up${localId++}`, name: f.name, size: f.size, mimetype: f.type, previewUrl, progress: ms && end !== 'too-large' ? 0 : 1, status: ms && end !== 'too-large' ? 'uploading' : end };
      });
      set({ uploads: { ...snapshot.uploads, [channelId]: [...(snapshot.uploads[channelId] ?? []), ...added] } });
      if (ms) for (const u of added) if (u.status === 'uploading') progressUpload(channelId, u.id, ms, u.name.includes('fail') ? 'failed' : 'done');
    },
    retryUpload(channelId, uploadId) {
      if (opts.uploadMs) {
        patchUpload(channelId, uploadId, { status: 'uploading', progress: 0 });
        progressUpload(channelId, uploadId, opts.uploadMs, 'done');
      } else patchUpload(channelId, uploadId, { status: 'done' });
    },
    removeUpload(channelId, uploadId) {
      set({ uploads: { ...snapshot.uploads, [channelId]: (snapshot.uploads[channelId] ?? []).filter((u) => u.id !== uploadId) } });
    },
    setTyping() {},
    members: () => Object.values(people),
    mediaUrl: (ref) => {
      const url = ref.startsWith('mxc://fake/') ? fakeArt(ref) : ref;
      return opts.mediaMs ? new Promise((r) => setTimeout(() => r(url), opts.mediaMs)) : Promise.resolve(url);
    },
    messageLink: (channelId, messageId) => `https://pasodrum.work/m/${encodeURIComponent(channelId)}/${encodeURIComponent(messageId)}`,
    // M3
    openThread(channelId, rootId) {
      const open = snapshot.threadTimelines[rootId] as (Timeline & { failed?: boolean }) | undefined;
      if (open && !open.failed) return;
      setThread(rootId, { initialLoading: true, failed: false });
      const finish = () => {
        if (failThreads) {
          failThreads = false;
          setThread(rootId, { initialLoading: false, failed: true });
        } else {
          // Like matrix/: the root (with its summary) first, then the replies.
          const root = messagesOf(channelId).find((x) => x.id === rootId) ?? snapshot.threads.find((x) => x.rootId === rootId)?.root;
          setThread(rootId, { messages: [...(root ? [root] : []), ...(threadReplies[rootId]?.() ?? [])], initialLoading: false });
          // M6: the key for the arriving reply comes from the backup a moment later; the message fades in where it is.
          if (rootId === '$!lead-q1' && opts.loadMs) {
            setTimeout(() => patchMessage(channelId, '$!lead-q1-arriving', (m) => ({ ...m, kind: 'text', arriving: undefined, body: 'Ours too. Two hires in Q1.' })), 4000);
          }
        }
      };
      if (opts.loadMs) setTimeout(finish, opts.loadMs);
      else finish();
    },
    loadOlderInThread() {},
    markThreadRead(channelId, rootId) {
      set({ threads: snapshot.threads.map((t) => (t.rootId === rootId && t.channelId === channelId ? { ...t, unread: false } : t)) });
      if (messagesOf(channelId).find((x) => x.id === rootId)?.thread?.unread) {
        patchMessage(channelId, rootId, (x) => ({ ...x, thread: { ...x.thread!, unread: false } }));
      }
    },
    markActivityRead(itemId) {
      set({ activity: snapshot.activity.map((a) => (a.id === itemId ? { ...a, unread: false } : a)) });
    },
    searchPeople: (query) =>
      Promise.resolve(
        Object.values(people).filter((p) => p.id !== snapshot.me.id && (!outsider || outsider.visible.includes(p.id)) && p.name.toLowerCase().includes(query.toLowerCase())),
      ),
    async openDm(userIds) {
      const hit = snapshot.dms.find((d) => d.people.length === userIds.length && d.people.every((p) => userIds.includes(p.id)));
      if (hit) return hit.id;
      const id = `!dm-${localId++}`;
      const dmPeople = Object.values(people).filter((p) => userIds.includes(p.id));
      set({ dms: [{ id, people: dmPeople, unread: 0, mentions: 0, lastTs: Date.now(), spaceIds: ['!pasodrum'] }, ...snapshot.dms] });
      return id;
    },
    profile: (userId) => {
      const person = [...Object.values(people), ola].find((p) => p.id === userId) ?? { id: userId, name: userId };
      const zones: Record<string, string> = { '田中 由紀': 'Asia/Tokyo', 'Tove Rask': 'Europe/Stockholm', 'Henrik Dahl': 'Europe/Oslo' };
      const email = person.external ? 'henrik@nordlys.no' : `${person.name.split(' ')[0]!.toLowerCase()}@pasodrum.work`;
      const zone = userId === snapshot.me.id && myZone ? myZone : zones[person.name] ?? 'Europe/Oslo';
      return Promise.resolve({ person: userId === snapshot.me.id ? snapshot.me : person, email, timeZone: zone });
    },
    // M4
    async createChannel({ spaceId, name, private: isPrivate, topic }) {
      const names = [...(snapshot.channels[spaceId] ?? []), ...(browse[spaceId] ?? [])].map((c) => c.name);
      if (!isTeam(snapshot.myRoles[spaceId])) throw new Error('not-allowed');
      if (names.includes(name)) throw new Error('taken');
      const id = `!ch-${localId++}`;
      memberIds[id] = [snapshot.me.id];
      set({ channels: { ...snapshot.channels, [spaceId]: [...(snapshot.channels[spaceId] ?? []), { id, spaceId, name, topic, private: isPrivate, unread: 0, mentions: 0, memberCount: 1, manageable: true }].sort((a, b) => a.name.localeCompare(b.name)) } });
      return id;
    },
    browseChannels: (spaceId) =>
      Promise.resolve([
        ...(snapshot.channels[spaceId] ?? []).map((c) => ({ id: c.id, spaceId, name: c.name, topic: c.topic, private: c.private, memberCount: c.memberCount, joined: true, ...(c.archived ? { archived: true } : {}) })),
        ...(browse[spaceId] ?? []).map((c) => ({ ...c, joined: false })),
      ]),
    async joinChannel(channelId) {
      for (const [spaceId, list] of Object.entries(browse)) {
        const hit = list.find((c) => c.id === channelId);
        if (!hit) continue;
        browse[spaceId] = list.filter((c) => c.id !== channelId);
        membersOf(channelId).push(snapshot.me.id);
        const joined: Channel = { id: hit.id, spaceId, name: hit.name, topic: hit.topic, private: hit.private, unread: 0, mentions: 0, memberCount: hit.memberCount + 1 };
        set({ channels: { ...snapshot.channels, [spaceId]: [...(snapshot.channels[spaceId] ?? []), joined].sort((a, b) => a.name.localeCompare(b.name)) } });
      }
    },
    async leaveChannel(channelId) {
      set({ channels: Object.fromEntries(Object.entries(snapshot.channels).map(([k, v]) => [k, v.filter((c) => c.id !== channelId)])) });
    },
    async setTopic(channelId, topic) {
      patchChannel(channelId, { topic });
    },
    channelMembers: (channelId) =>
      Promise.resolve(
        membersOf(channelId).map((id) => {
          const pending = waiting.get(id);
          if (pending) return { person: pending, role: 'external' as const, pending: true };
          return { person: id === snapshot.me.id ? snapshot.me : ([...Object.values(people), ola].find((p) => p.id === id) ?? { id, name: id }), role: role(id) };
        }),
      ),
    async setRole(_spaceId, userId, next) {
      const mine = role(snapshot.me.id);
      if (mine !== 'owner' && (mine !== 'admin' || next === 'owner' || role(userId) === 'owner')) throw new Error('not-allowed');
      roleOf[userId] = next;
      if (userId === snapshot.me.id) set({ myRoles: { ...snapshot.myRoles, '!pasodrum': next } });
    },
    async removeFromChannel(channelId, userId) {
      memberIds[channelId] = membersOf(channelId).filter((id) => id !== userId);
    },
    async addPeople(target, req) {
      const ok = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
      const result: AddPeopleResult = { added: [], invited: [], failed: [] };
      // D-36: an External gets a record (roles + one-off channels) and membership follows.
      if (req.type === 'external') {
        mayManage();
        const give = (id: string, email?: string) => {
          const r = (externalRecords[id] ??= { roles: [], channels: [], ...(email ? { email } : {}), rooms: { channels: [], spaces: [] } });
          r.roles = uniq([...r.roles, ...req.roles]);
          r.channels = uniq([...r.channels, ...req.channels]);
          roleOf[id] = 'external';
        };
        for (const id of req.userIds) {
          if (externalRecords[id]) result.failed.push({ who: id, reason: 'already-member' });
          else {
            give(id);
            result.added.push(id);
          }
        }
        for (const email of req.emails) {
          if (!ok(email)) result.failed.push({ who: email, reason: 'invalid-email' });
          else {
            const person = byEmail(email);
            waiting.set(person.id, person);
            give(person.id, email);
            result.invited.push(email);
          }
        }
        followAll([...result.added, ...result.invited.map((e) => byEmail(e).id)]);
        return result;
      }
      if (req.type === 'staff') {
        for (const id of [...req.userIds, ...req.emails.filter(ok).map((e) => byEmail(e).id)]) {
          roleOf[id] = 'staff';
          if (!staffIds.includes(id)) staffIds.push(id);
          for (const sid of req.spaces) if (!rosterOf(sid).team.includes(id)) rosterOf(sid).team.push(id);
        }
      }
      // A space id adds to the space's people and its first channel.
      const roster = snapshot.spaces.some((sp) => sp.id === target) ? rosterOf(target) : undefined;
      const channelId = (roster && snapshot.channels[target]?.[0]?.id) || target;
      const isIn = (id: string) => (roster ? [...roster.team, ...roster.clients] : membersOf(channelId)).includes(id);
      const join = (id: string) => {
        if (roster) (req.type === 'client' ? roster.clients : roster.team).push(id);
        if (!membersOf(channelId).includes(id)) membersOf(channelId).push(id);
      };
      for (const id of req.userIds) {
        if (isIn(id)) result.failed.push({ who: id, reason: 'already-member' });
        else {
          join(id);
          result.added.push(id);
        }
      }
      for (const email of req.emails) {
        if (!ok(email)) result.failed.push({ who: email, reason: 'invalid-email' });
        else if (email.includes('notallowed')) result.failed.push({ who: email, reason: 'not-allowed' });
        else {
          const code = `c${localId++}`;
          const person = byEmail(email);
          if (isIn(person.id)) {
            result.failed.push({ who: email, reason: 'already-member' });
            continue;
          }
          waiting.set(person.id, person);
          join(person.id);
          (pendingBy[channelId] ??= []).push({ code, email, role: req.type === 'client' || req.type === 'staff' ? req.type : 'external', createdTs: Date.now(), link: `https://pasodrum.work/join/${code}` });
          result.invited.push(email);
        }
      }
      return result;
    },
    pendingInvites: (channelId) => Promise.resolve([...(pendingBy[channelId] ?? [])]),
    async resendInvite() {},
    async revokeInvite(code) {
      for (const k of Object.keys(pendingBy)) {
        const gone = pendingBy[k]!.find((p) => p.code === code);
        if (gone) memberIds[k] = membersOf(k).filter((id) => id !== byEmail(gone.email).id);
        pendingBy[k] = pendingBy[k]!.filter((p) => p.code !== code);
      }
    },
    async updateProfile(patch) {
      if (patch.name) set({ me: { ...snapshot.me, name: patch.name } });
      if (patch.timeZone) myZone = patch.timeZone;
      if (patch.avatar) set({ me: { ...snapshot.me, avatarUrl: `mxc://fake/${patch.avatar.name}` } });
    },
    devices: () => Promise.resolve(devices),
    async signOutDevice(deviceId) {
      devices = devices.filter((d) => d.id !== deviceId);
    },
    async signOutOtherDevices() {
      // Like the server: it asks for the password again; "wrong" is wrong.
      throw new PasswordRequired(async (password) => {
        if (password === 'wrong') throw new Error('wrong-password');
        devices = devices.filter((d) => d.current);
      });
    },
    notifyLevel: (channelId) => levels[channelId] ?? levels.default ?? 'mentions',
    async setNotifyLevel(channelId, level) {
      levels[channelId] = level;
    },
    async setSetting(key, value) {
      settings[key] = value;
    },
    // M5. Names containing "fail" reject once with a generic error (ClientSpaceCreateError board).
    async createClientSpace({ name, colour, channels: names, team, clientEmails }) {
      const clean = name.trim();
      if (snapshot.spaces.some((sp) => sp.kind === 'client' && sp.name.toLowerCase() === clean.toLowerCase())) throw new Error('name-taken');
      await new Promise((r) => setTimeout(r, opts.loadMs ?? 0));
      if (clean.toLowerCase().includes('fail') && !failedOnce.has(clean)) {
        failedOnce.add(clean);
        throw new Error('other');
      }
      const spaceId = `!${clean.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${localId++}`;
      const outside = clientEmails.map(byEmail);
      outside.forEach((p) => waiting.set(p.id, p));
      const list = names.map((n, i) => ch(`${spaceId}-c${i}`, spaceId, n, { memberCount: team.length + 1 + outside.length, ...(outside.length ? { outside } : {}) }));
      for (const c of list) memberIds[c.id] = [snapshot.me.id, ...team, ...outside.map((p) => p.id)];
      spaceRoster[spaceId] = { team: [snapshot.me.id, ...team], clients: outside.map((p) => p.id) };
      const sorted = [...snapshot.spaces, { id: spaceId, name: clean, kind: 'client' as const, colour }].sort(spaceOrder);
      set({ spaces: sorted, channels: { ...snapshot.channels, [spaceId]: list }, myRoles: { ...snapshot.myRoles, [spaceId]: snapshot.myRoles['!pasodrum'] ?? 'staff' } });
      return { spaceId, channelId: list[0]!.id };
    },
    async updateSpace(spaceId, patch) {
      set({ spaces: snapshot.spaces.map((sp) => (sp.id === spaceId ? { ...sp, ...patch } : sp)).sort(spaceOrder) });
    },
    spaceMembers: (spaceId) => {
      const r = rosterOf(spaceId);
      const of = (id: string, fallback: Role): Member => {
        const pending = waiting.get(id);
        if (pending) return { person: pending, role: roleOf[id] ?? fallback, pending: true };
        return { person: id === snapshot.me.id ? snapshot.me : ([...Object.values(people), ola].find((p) => p.id === id) ?? { id, name: id }), role: fallback === 'client' ? 'client' : role(id) };
      };
      return Promise.resolve([...r.team.map((id) => of(id, 'staff')), ...r.clients.map((id) => of(id, 'client'))]);
    },
    async removeFromSpace(spaceId, userId) {
      const r = rosterOf(spaceId);
      r.team = r.team.filter((id) => id !== userId);
      r.clients = r.clients.filter((id) => id !== userId);
      for (const c of snapshot.channels[spaceId] ?? []) memberIds[c.id] = membersOf(c.id).filter((id) => id !== userId);
      set({
        channels: {
          ...snapshot.channels,
          [spaceId]: (snapshot.channels[spaceId] ?? []).map((c) => {
            const next = { ...c, outside: c.outside?.filter((p) => p.id !== userId) };
            if (!next.outside?.length) delete next.outside;
            return next;
          }),
        },
      });
    },
    async setArchived(spaceId, archived) {
      set({
        spaces: snapshot.spaces.map((sp) => (sp.id === spaceId ? { ...sp, archived } : sp)).sort(spaceOrder),
        channels: { ...snapshot.channels, [spaceId]: (snapshot.channels[spaceId] ?? []).map((c) => ({ ...c, canPin: !archived && !c.archived })) },
      });
    },
    // Keeps the ⟦n⟧ tokens where they were; a segment containing "fail" rejects so the failed state can be seen.
    async translate(segments, to) {
      await new Promise((r) => setTimeout(r, 700));
      if (segments.some((x) => /fail/i.test(x))) throw new Error('failed');
      return segments.map((x) => `[${to}] ${x}`);
    },
    anotherApp: () => ({ server: 'pasodrum.work', username: snapshot.me.id.slice(1, snapshot.me.id.indexOf(':')) }),
    // M6: the other device answers by itself; it declines when the device name contains "decline", times out with "timeout", mismatches with "mismatch".
    requestConfirmation() {
      setConfirmation({ role: 'new', phase: 'waiting' });
      setTimeout(() => {
        const c = snapshot.security.confirmation;
        if (c?.phase !== 'waiting') return;
        const other = opts.security?.confirmation?.otherDevice ?? 'Chrome on Mac';
        if (other.includes('decline')) setConfirmation({ role: 'new', otherDevice: other, phase: 'declined' });
        else if (other.includes('timeout')) setConfirmation({ role: 'new', otherDevice: other, phase: 'timeout' });
        else setConfirmation({ role: 'new', otherDevice: other, phase: 'compare', emoji: SAS });
      }, opts.loadMs ?? 0);
    },
    acceptConfirmation() {
      const c = snapshot.security.confirmation;
      if (c?.phase === 'asked') setConfirmation({ ...c, phase: 'compare', emoji: SAS });
    },
    declineConfirmation() {
      setConfirmation(undefined);
    },
    confirmEmoji(match) {
      const c = snapshot.security.confirmation;
      if (!c) return;
      if (!match || c.otherDevice?.includes('mismatch')) return setConfirmation({ ...c, phase: 'mismatch' });
      setConfirmation({ ...c, phase: 'done' });
      if (c.role === 'new') setSecurity({ device: 'confirmed' });
      if (c.role === 'person' && c.person) confirmedPeople.add(c.person.id);
    },
    dismissConfirmation() {
      setConfirmation(undefined);
    },
    async useRecoveryKey(key) {
      const norm = (k: string) => k.replace(/\s+/g, '');
      if (norm(key) !== norm(FAKE_RECOVERY_KEY)) throw new Error('wrong-key');
      backupReadable = true;
      setSecurity({ device: 'confirmed', confirmation: undefined });
    },
    async newRecoveryKey(password) {
      if (opts.keyNeedsPassword && !password) throw new Error('password-required');
      if (password === 'wrong') throw new Error('wrong-password');
      if (!backupReadable) throw new Error('backup-unreadable');
      setSecurity({ needsRecoveryKey: false });
      return FAKE_RECOVERY_KEY;
    },
    // D-38: sending → sent (resend in a minute) → the link is tapped after emailTapMs → confirmed with the held key.
    async requestConfirmEmail() {
      const ec = snapshot.security.emailConfirm ?? { phase: 'idle', email: 'henrik@nordlys.no' };
      const setEc = (patch: Partial<EmailConfirm>, extra: Partial<Security> = {}) =>
        setSecurity({ emailConfirm: { ...(snapshot.security.emailConfirm ?? ec), ...patch }, ...extra });
      if (ec.canResendAt && ec.canResendAt > Date.now()) {
        setEc({ phase: 'failed', error: 'rate-limited' });
        throw new Error('rate-limited');
      }
      setEc({ phase: 'sending', error: undefined });
      await new Promise((r) => setTimeout(r, opts.loadMs ?? 0));
      if (opts.emailFails) {
        setEc({ phase: 'failed', error: opts.emailFails });
        throw new Error(opts.emailFails);
      }
      const sentAt = Date.now();
      setEc({ phase: 'sent', canResendAt: sentAt + 60_000 });
      if (opts.emailTapMs === undefined) return;
      setTimeout(() => {
        const now = snapshot.security.emailConfirm;
        // Only the newest email's link works.
        if (now?.phase !== 'sent' || now.canResendAt !== sentAt + 60_000) return;
        setEc({ phase: 'confirmed' }, { device: 'confirmed', confirmation: undefined });
      }, opts.emailTapMs);
    },
    async askForHelp() {
      await new Promise((r) => setTimeout(r, opts.loadMs ?? 0));
      if (!snapshot.security.helpContact) throw new Error('no-contact');
    },
    async resetEncryption(password) {
      if (password === 'wrong') throw new Error('wrong-password');
      setSecurity({ device: 'confirmed', needsRecoveryKey: false, confirmation: undefined });
      return FAKE_RECOVERY_KEY;
    },
    // E2: "general" can't be managed; names already used in the space are taken.
    async renameChannel(channelId, name) {
      const spaceId = Object.keys(snapshot.channels).find((k) => snapshot.channels[k]!.some((c) => c.id === channelId))!;
      if (snapshot.channels[spaceId]!.some((c) => c.id !== channelId && c.name === name)) throw new Error('name-taken');
      patchChannel(channelId, { name });
    },
    async setChannelArchived(channelId, archived) {
      patchChannel(channelId, { archived, canPin: !archived });
    },
    signOutRisk: () => Promise.resolve(opts.signOutRisk ?? 'none'),
    // M7: #general has three pins, files in the history, cards for the URLs in PREVIEWS.
    async pins(channelId) {
      return pinsIn(channelId)
        .map((id) => findMessage(channelId, id))
        .filter((m): m is Message => !!m && m.kind !== 'deleted')
        .map((m) => ({ ...m, pinned: true }));
    },
    pin: (channelId, messageId) => setPinned(channelId, messageId, true),
    unpin: (channelId, messageId) => setPinned(channelId, messageId, false),
    // Like the real store: thread replies included; an encrypted channel is scanned a bit at a time, so its first page
    // comes back empty and later ones short, with `next` set.
    async files(channelId, from) {
      const replies = (loadedReplies[channelId] ??= Object.values(threadReplies).flatMap((f) => f()).filter((m) => m.channelId === channelId));
      const all = [...messagesOf(channelId), ...historyOf(channelId), ...replies]
        .filter((m, i, list) => !!m.media && m.status === 'sent' && list.findIndex((x) => x.id === m.id) === i)
        .sort((a, b) => b.ts - a.ts);
      const encrypted = !!Object.values(snapshot.channels).flat().find((c) => c.id === channelId)?.encrypted || !!snapshot.dms.find((d) => d.id === channelId)?.encrypted;
      if (encrypted && from === undefined) return { items: [], next: '0' };
      const size = encrypted ? 1 : 8;
      const start = Number(from ?? 0);
      const page: FilesPage = { items: all.slice(start, start + size) };
      if (start + size < all.length) page.next = String(start + size);
      return page;
    },
    async linkPreview(url) {
      if (previewMs) await new Promise((r) => setTimeout(r, previewMs));
      return PREVIEWS[url] ?? null;
    },
    // M8: like the real store: loaded timelines first, then older history in batches; a second pass (cursor) reaches the archive.
    // An unconfirmed device skips encrypted conversations.
    async search(query, { channelId, cursor, signal, onHits }) {
      const fold = (x: string) => x.normalize('NFKC').toLowerCase();
      const needle = fold(query.trim());
      const aborted = () => new DOMException('Aborted', 'AbortError');
      const pause = () =>
        new Promise<void>((resolve, reject) => {
          if (signal.aborted) return reject(aborted());
          const t = setTimeout(resolve, opts.loadMs ?? 0);
          signal.addEventListener('abort', () => (clearTimeout(t), reject(aborted())), { once: true });
        });
      if (!needle) return {};
      const readable = (id: string) => (!channelId || id === channelId) && (snapshot.security.device === 'confirmed' || !isEncrypted(id));
      const replies = Object.entries(threadReplies).flatMap(([rootId, f]) => f().map((message) => ({ message, threadRootId: rootId })));
      const hitsOf = (list: SearchHit[]) =>
        list
          .filter(({ message: m }) => readable(m.channelId) && m.status === 'sent' && !['deleted', 'system', 'undecryptable'].includes(m.kind ?? 'text') && fold(m.body).includes(needle))
          .sort((a, b) => b.message.ts - a.message.ts);
      const ids = [...Object.values(snapshot.channels).flat().map((c) => c.id), ...snapshot.dms.map((d) => d.id)];
      if (cursor !== 'fake-archive') {
        await pause();
        const loadedHits = hitsOf(ids.flatMap((id) => historyOf(id).map((message) => ({ message }))));
        if (loadedHits.length) onHits(loadedHits);
        await pause();
        const threadHits = hitsOf(replies);
        if (threadHits.length) onHits(threadHits);
        return { next: 'fake-archive' };
      }
      await pause();
      const older = hitsOf(ownHistory(archive).map((message) => ({ message })));
      if (older.length) onHits(older);
      return {};
    },
    // SIDE-03: the other person says yes by themselves; confirmEmoji(true) confirms them.
    requestPersonConfirmation(userId) {
      if (snapshot.security.device !== 'confirmed') return;
      const person = [...Object.values(people), ola].find((p) => p.id === userId) ?? { id: userId, name: userId };
      setConfirmation({ role: 'person', person, phase: 'waiting' });
      setTimeout(() => {
        const c = snapshot.security.confirmation;
        if (c?.role === 'person' && c.phase === 'waiting') setConfirmation({ ...c, phase: 'compare', emoji: SAS });
      }, opts.loadMs ?? 0);
    },
    personConfirmed: async (userId) => confirmedPeople.has(userId),
    async shareHistory(dmId, userId) {
      const dm = snapshot.dms.find((d) => d.id === dmId);
      const team = isTeam(snapshot.myRoles['!pasodrum']);
      if (!team || !dm?.encrypted || dm.people.length !== 1 || dm.people[0]!.id !== userId || !dm.people[0]!.external) throw new Error('not-allowed');
      if (snapshot.security.device !== 'confirmed') throw new Error('device-unconfirmed');
      if (!confirmedPeople.has(userId)) throw new Error('not-confirmed');
      if (opts.notReadyPeople?.includes(userId)) throw new Error('not-ready');
      await new Promise((r) => setTimeout(r, opts.loadMs ?? 0));
      const row = rich(dmId, 'so', Date.now(), { sender: snapshot.me, kind: 'system', system: { joined: [], left: [], historyShared: { by: snapshot.me } } });
      loaded[dmId] = [...historyOf(dmId), row];
      if (snapshot.timelines[dmId]) setTimeline(dmId, { messages: [...messagesOf(dmId), row] });
    },
    // D-36 people and access: canvas data (PeopleWorkspace, PeopleAccess, PeopleAccessNotApplied).
    async workspacePeople() {
      if (!isTeam(snapshot.myRoles['!pasodrum'])) return [];
      const staff = [snapshot.me.id, ...staffIds.filter((id) => id !== snapshot.me.id)].map((id): Member => {
        const pending = waiting.get(id);
        return { person: personOf(id), role: role(id), ...(pending ? { pending: true, email: pending.name } : {}) };
      });
      const outside = Object.entries(externalRecords).map(([id, r]): Member => ({
        person: personOf(id),
        role: 'external',
        roles: [...r.roles],
        ...(r.email ? { pending: true, email: r.email } : {}),
      }));
      return [...staff, ...outside];
    },
    async externalAccess(userId) {
      if (!isTeam(snapshot.myRoles['!pasodrum'])) return [];
      return Object.entries(externalRecords)
        .filter(([id]) => !userId || id === userId)
        .map(([id, r]): ExternalAccess => {
          const want = expectedOf(r);
          const notApplied = !same(want.channels, r.rooms.channels) || !same(want.spaces, r.rooms.spaces);
          return {
            person: personOf(id),
            ...(r.email ? { email: r.email, pending: true } : {}),
            roles: [...r.roles],
            channels: [...r.channels],
            ...(notApplied ? { notApplied: true } : {}),
            rooms: { channels: [...r.rooms.channels], spaces: [...r.rooms.spaces] },
          };
        });
    },
    async saveAccessRole(input) {
      mayManage();
      const id = input.id ?? `role-${localId++}`;
      const next: AccessRole = { id, name: input.name, colour: input.colour, channels: [...input.channels], spaces: [...input.spaces] };
      accessRoles = accessRoles.some((r) => r.id === id) ? accessRoles.map((r) => (r.id === id ? next : r)) : [...accessRoles, next];
      return { id, ...followAll(holders(id)) };
    },
    async deleteAccessRole(id) {
      mayManage();
      const had = holders(id);
      accessRoles = accessRoles.filter((r) => r.id !== id);
      for (const h of had) externalRecords[h]!.roles = externalRecords[h]!.roles.filter((x) => x !== id);
      return followAll(had);
    },
    async setExternalRoles(userId, roles) {
      mayManage();
      recordOf(userId).roles = [...roles];
      return followAll([userId]);
    },
    async applyAccess(userId) {
      mayManage();
      recordOf(userId);
      return followAll([userId]);
    },
    async removeExternal(userId) {
      mayManage();
      const r = recordOf(userId);
      r.roles = [];
      r.channels = [];
      follow(userId);
      delete externalRecords[userId];
      if (r.email) for (const k of Object.keys(pendingBy)) pendingBy[k] = pendingBy[k]!.filter((p) => p.email !== r.email);
      publishAccess();
    },
  };
}
