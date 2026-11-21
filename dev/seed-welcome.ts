// Welcome content for Docs and Boards (D-37): two welcome pages (EN + JP) in the workspace, a project in the workspace and
// one in Nordlys, and Shiori on Nordlys's team. Runs as sofia, looks everything up by title/key and skips what's there,
// so running it again changes nothing. Needs every space migrated first (node dev/migrate-docs.ts --apply).
// Local: node dev/seed-welcome.ts [--dry-run] · Production (only when the CEO asks):
//   set -a; . dev/.env.production; set +a; node dev/seed-welcome.ts --dry-run   (then without --dry-run)
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SERVER, enc, login, mx, ok, send, state, userId } from './lib.ts';
import { LEVEL, PAGES, channelUsers, powerLevels, type SpaceKind } from '../apps/web/src/matrix/levels.ts';

const dry = process.argv.includes('--dry-run');
const PROJECT = 'work.pasodrum.boards.project';
const COLUMNS = 'work.pasodrum.boards.columns';
const ISSUE = 'work.pasodrum.boards.issue';
const DESCRIPTION = 'work.pasodrum.boards.description';
const UPDATE = 'work.pasodrum.docs.update';
const SNAPSHOT = 'work.pasodrum.docs.snapshot';
// Columns are never translated (D-37): the seeded projects store their default titles in English.
const boardsEn = JSON.parse(readFileSync(new URL('../apps/web/src/features/boards/locales/en.json', import.meta.url), 'utf8'));
const COLUMN_TITLES = [
  { id: 'todo', title: boardsEn.columnTodo },
  { id: 'doing', title: boardsEn.columnDoing },
  { id: 'review', title: boardsEn.columnReview },
  { id: 'done', title: boardsEn.columnDone },
];

// The web app's own packages (pnpm keeps them in apps/web), loaded as ESM so yjs is the one y-tiptap uses.
async function webPackage(name: string): Promise<any> {
  const dir = realpathSync(new URL(`../apps/web/node_modules/${name}`, import.meta.url));
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
  const e = pkg.exports?.['.'] ?? pkg.exports;
  const pick = (x: any): string | undefined => (typeof x === 'string' ? x : x && (pick(x.import) ?? pick(x.default)));
  return import(pathToFileURL(`${dir}/${pick(e) ?? pkg.module ?? pkg.main}`).href);
}
const [Y, yTiptap, tiptap, { generateKeyBetween }, docsExt] = await Promise.all([
  webPackage('yjs'),
  webPackage('@tiptap/y-tiptap'),
  webPackage('@tiptap/react'),
  webPackage('fractional-indexing'),
  import(new URL('../apps/web/src/features/docs/extensions.ts', import.meta.url).href),
]);

type StateEvent = { type: string; state_key: string; sender: string; content: Record<string, any> };
const summary: string[] = [];
const note = (item: string, status: string) => void summary.push(`  ${item}: ${status}`);
const would = (s: string) => (dry ? `would ${s}` : s.replace(/^(create|add|comment)\b/, '$1ed').replace(/^createed/, 'created').replace(/^write\b/, 'wrote'));

const me = userId('sofia');
const shioriId = userId('shiori');
const token = await login('sofia');

const getState = (roomId: string) => ok(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state`) as Promise<StateEvent[]>;
const find = (st: StateEvent[], type: string, key = '') => st.find((e) => e.type === type && e.state_key === key);
const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Spaces: the workspace (by its alias, as the invite service finds it) and the client space Nordlys.
const workspace = (await ok(token, 'GET', `/_matrix/client/v3/directory/room/${enc(`#workspace:${SERVER}`)}`)).room_id as string;
const { joined_rooms: joinedRooms } = (await ok(token, 'GET', '/_matrix/client/v3/joined_rooms')) as { joined_rooms: string[] };
let nordlys: string | undefined;
const spaceState = new Map<string, StateEvent[]>();
for (const roomId of joinedRooms) {
  const st = await getState(roomId);
  if (find(st, 'm.room.create')?.content.type !== 'm.space') continue;
  spaceState.set(roomId, st);
  if (find(st, 'work.pasodrum.space')?.content.kind === 'client' && find(st, 'm.room.name')?.content.name === 'Nordlys') nordlys = roomId;
}
if (!spaceState.has(workspace)) throw new Error('sofia is not in the workspace.');

// Precondition: page entries open to everyone (migrate-docs).
const unmigrated = [workspace, ...(nordlys ? [nordlys] : [])].filter((id) => find(spaceState.get(id)!, 'm.room.power_levels')?.content.events?.[PAGES] !== 0);
if (unmigrated.length) {
  const names = unmigrated.map((id) => find(spaceState.get(id)!, 'm.room.name')?.content.name ?? id).join(', ');
  console.error(`Not migrated yet: ${names}. Run the Docs migration first:\n  node dev/migrate-docs.ts --apply\n(production: set -a; . dev/.env.production; set +a; node dev/migrate-docs.ts --apply)`);
  process.exit(1);
}

// Shiori: exists? her workspace level sets her team level in Nordlys (D-36: Staff 10 at least).
const shioriProfile = await mx(token, 'GET', `/_matrix/client/v3/profile/${enc(shioriId)}`);
const shiori = shioriProfile.status === 200 ? { id: shioriId, name: (shioriProfile.body?.displayname as string | undefined) ?? 'shiori' } : null;
const wsLevels = find(spaceState.get(workspace)!, 'm.room.power_levels')?.content ?? {};
const levelOf = (pl: Record<string, any>, id: string): number => pl.users?.[id] ?? pl.users_default ?? 0;
console.log(`${dry ? 'Dry run: ' : ''}seeding welcome content on ${SERVER} as sofia.`);
if (!shiori) note('Shiori', `no account "shiori" on ${SERVER}: her cards stay unassigned, no comment, not added to Nordlys`);

// Levels for a new page or project room: the space's channel levels (its team keeps their level) plus our own types.
function roomLevels(spaceId: string, extra: Record<string, number>) {
  const st = spaceState.get(spaceId)!;
  const create = find(st, 'm.room.create')!;
  const pl = find(st, 'm.room.power_levels')?.content ?? {};
  const v12 = Number(create.content.room_version) >= 12 || String(create.content.room_version).includes('hydra');
  const creators = v12 ? [create.sender, ...(create.content.additional_creators ?? [])] : [];
  const kind: SpaceKind = find(st, 'work.pasodrum.space')?.content.kind === 'client' ? 'client' : 'workspace';
  const base = powerLevels(kind, 'channel', channelUsers(pl.users ?? {}, creators, me));
  return { ...base, events: { ...base.events, ...extra } };
}
const childState = (spaceId: string) => [
  { type: 'm.space.parent', state_key: spaceId, content: { via: [SERVER], canonical: true } },
  { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'shared' } },
  { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: spaceId }] } },
];

// ---------------------------------------------------------------------------------------------------------------------
// Docs: the page bodies, as the Docs editor's own schema builds them.

type J = Record<string, any>;
const text = (t: string): J => ({ type: 'text', text: t });
const h = (t: string): J => ({ type: 'heading', attrs: { level: 2 }, content: [text(t)] });
const p = (...parts: (string | J)[]): J => ({ type: 'paragraph', content: parts.map((x) => (typeof x === 'string' ? text(x) : x)) });
const ul = (...items: (string | J[])[]): J => ({
  type: 'bulletList',
  content: items.map((i) => ({ type: 'listItem', content: [typeof i === 'string' ? p(i) : p(...i)] })),
});
const todo = (...items: string[]): J => ({ type: 'taskList', content: items.map((i) => ({ type: 'taskItem', attrs: { checked: false }, content: [p(i)] })) });
const link = (id: string, title: string): J => ({ type: 'pageLink', attrs: { id, title } });

const EN_TITLE = 'Welcome to Pasodrum work';
const JA_TITLE = 'Pasodrum work へようこそ';

const enBody = (ja: string): J => ({
  type: 'doc',
  content: [
    p('日本語: ', link(ja, JA_TITLE)),
    h('Chat'),
    ul(
      'Every channel has Pins and Files tabs.',
      'Paste a link and it shows as a card.',
      '⌘K jumps to any channel or person, and searches messages. Japanese works too.',
      'A DM says at the top who can read it.',
      'Translate turns a message into English or Japanese. Team only, not in client spaces.',
    ),
    h('Docs'),
    ul(
      'Edit a page together and see each other’s cursors live.',
      'Type [[ to link to another page.',
      'Add blocks with + or /: headings, lists, checklists, tables, images.',
      'Drag blocks to reorder them, and pages in the sidebar to file them.',
    ),
    h('Boards'),
    ul(
      'Drag cards from column to column.',
      'Open an issue to comment. @mention someone to bring them in.',
      'Give issues a due date and an assignee.',
      'My issues collects everything assigned to you.',
    ),
    h('People and access'),
    ul(
      'Everyone is Staff, External or Client.',
      'Externals reach only what their access roles give them: chosen channels or whole client spaces.',
    ),
    h('Clients’ safety net'),
    ul('Added someone to a client channel later? Share the earlier messages with them.', 'Clients confirm a new device by email.'),
    h('Try it'),
    todo('Drag 「ドラッグしてみて →」 on the board to In progress', 'Type [[ somewhere on this page', 'Press ⌘K'),
  ],
});

const jaBody = (en: string): J => ({
  type: 'doc',
  content: [
    p('新しくなったところを短くまとめました。気になるところから、ぜひ触ってみてください。'),
    h('チャット'),
    ul(
      'どのチャンネルにも「ピン留め」と「ファイル」のタブができました。大事なメッセージや共有されたファイルがすぐに見つかります。',
      'リンクを貼ると、内容がカードで表示されます。',
      '⌘K でチャンネルや人にすぐ移動できます。メッセージ検索も、日本語でちゃんと使えます。',
      'DM では、だれが読めるかがいちばん上に表示されます。',
      '「翻訳」でメッセージを日本語と英語に訳せます。社内向けの機能なので、クライアントスペースでは使えません。',
    ),
    h('ドキュメント'),
    ul(
      'ひとつのページをみんなで同時に編集できます。ほかの人のカーソルもリアルタイムで見えます。',
      '[[ と入力すると、ほかのページへのリンクを貼れます。',
      '+ か / で、見出し・リスト・チェックリスト・表・画像などのブロックを追加できます。',
      'ブロックはドラッグで並べ替えられます。ページもサイドバーでドラッグして整理できます。',
    ),
    h('ボード'),
    ul(
      'カードはドラッグで別の列へ動かせます。',
      '課題を開くとコメントできます。@ でメンションすると、相手に知らせられます。',
      '課題には期限と担当者を設定できます。',
      '「自分の課題」に、自分が担当している課題がまとまります。',
    ),
    h('メンバーとアクセス'),
    ul('メンバーは「スタッフ」「外部」「クライアント」の 3 種類です。', '外部の人が見られるのは、ロールで許可したチャンネルやクライアントスペースだけです。'),
    h('クライアントとのやりとりも安心'),
    ul('あとからチャンネルに加わった人にも、以前のメッセージを共有できます。', 'クライアントが新しいデバイスでサインインするときは、メールで本人確認をします。'),
    h('さっそく試してみましょう'),
    todo('ボードの「ドラッグしてみて →」を「In progress」へ動かす', 'このページのどこかで [[ と入力してみる', '⌘K を押してみる'),
    p('English: ', link(en, EN_TITLE)),
  ],
});

const dummyStore = { render: () => ({}) };
const noView = () => ({});
const schema = tiptap.getSchema(
  docsExt.docsExtensions({ doc: new Y.Doc(), slash: dummyStore, links: dummyStore, slashItems: () => [], linkItems: () => [], onSlash() {}, onLink() {}, views: { pageLink: noView, image: noView, file: noView } }),
);
/** One Yjs update holding the whole page (TipTap Collaboration, fragment 'default'), base64 as docsProvider sends it. */
function bodyUpdate(json: J): string {
  const update: Uint8Array = Y.encodeStateAsUpdate(yTiptap.prosemirrorJSONToYDoc(schema, json, 'default'));
  if (update.byteLength > 40 * 1024) throw new Error('page body too big for one event');
  return Buffer.from(update).toString('base64');
}

const pageEntries = () =>
  spaceState
    .get(workspace)!
    .filter((e) => e.type === PAGES && typeof e.content.order === 'string')
    .map((e) => ({ id: e.state_key, ...(e.content as { title: string; parent?: string; order: string; links?: string[] }) }));

async function hasBody(pageId: string): Promise<boolean> {
  const snap = await mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(pageId)}/state/${SNAPSHOT}/`);
  if (snap.status === 200 && snap.body?.url) return true;
  const filter = enc(JSON.stringify({ types: [UPDATE] }));
  const res = await mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(pageId)}/messages?dir=f&limit=1&filter=${filter}`);
  if (res.status === 403) {
    if (dry) return true;
    await ok(token, 'POST', `/_matrix/client/v3/join/${enc(pageId)}?server_name=${enc(SERVER)}`, {});
    return hasBody(pageId);
  }
  if (res.status >= 300) throw new Error(`messages ${pageId} → ${res.status}`);
  return (res.body.chunk as unknown[]).length > 0;
}

/** Finds or creates the page; returns its id (a placeholder in a dry run). */
async function ensurePage(title: string, parent: string | undefined, first: boolean): Promise<{ id: string; created: boolean }> {
  const existing = pageEntries().find((e) => e.title === title && e.parent === parent);
  if (existing) return { id: existing.id, created: false };
  if (dry) return { id: `(new ${title})`, created: true };
  const siblings = pageEntries()
    .filter((e) => e.parent === parent)
    .sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0));
  // The welcome page goes on top; a child page goes last.
  const order: string = first ? generateKeyBetween(null, siblings[0]?.order ?? null) : generateKeyBetween(siblings.at(-1)?.order ?? null, null);
  const { room_id } = await ok(token, 'POST', '/_matrix/client/v3/createRoom', {
    preset: 'private_chat',
    visibility: 'private',
    creation_content: { type: PAGES },
    power_level_content_override: roomLevels(workspace, { [SNAPSHOT]: 0, 'm.room.name': 0 }),
    initial_state: childState(workspace),
  });
  const entry = { title, ...(parent ? { parent } : {}), order };
  await state(token, workspace, PAGES, room_id, entry);
  spaceState.get(workspace)!.push({ type: PAGES, state_key: room_id, sender: me, content: entry });
  return { id: room_id, created: true };
}

const en = await ensurePage(EN_TITLE, undefined, true);
const ja = await ensurePage(JA_TITLE, en.id, false);
for (const [page, title, body, other] of [
  [en, EN_TITLE, enBody, ja],
  [ja, JA_TITLE, jaBody, en],
] as const) {
  const fresh = page.created || !(await hasBody(page.id));
  if (fresh && !dry) await send(token, page.id, { update: bodyUpdate(body(other.id)) }, UPDATE);
  else if (fresh) bodyUpdate(body(other.id));
  const entry = pageEntries().find((e) => e.id === page.id);
  const linked = entry?.links?.includes(other.id);
  if (!dry && entry && !linked) {
    const content = { title: entry.title, ...(entry.parent ? { parent: entry.parent } : {}), order: entry.order, links: [...new Set([...(entry.links ?? []), other.id])] };
    await state(token, workspace, PAGES, page.id, content);
  }
  note(`page "${title}"`, page.created ? would('create') : fresh ? would('write its empty body') : linked || dry ? 'exists, skipped' : 'exists, links set');
}

// ---------------------------------------------------------------------------------------------------------------------
// Shiori on Nordlys's team, as the app's onTeam does: invited to the space and each of its rooms I'm in, at her team level.

async function membership(roomId: string, user: string): Promise<string | undefined> {
  const r = await mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.member/${enc(user)}`);
  return r.status === 200 ? r.body?.membership : undefined;
}
const isMember = async (roomId: string, user: string) => ['join', 'invite'].includes((await membership(roomId, user)) ?? '');
const childRooms = (spaceId: string) =>
  spaceState
    .get(spaceId)!
    .filter((e) => e.type === 'm.space.child' && (e.content.via?.length ?? 0) > 0 && joinedRooms.includes(e.state_key))
    .map((e) => e.state_key);

async function setLevel(roomId: string, user: string, level: number) {
  const pl = await ok(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`);
  if (levelOf(pl, user) >= level) return;
  await ok(token, 'PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.power_levels/`, { ...pl, users: { ...pl.users, [user]: level } });
}

let shioriNordlys = shiori ? 'n/a' : 'skipped (no account)';
if (shiori && nordlys) {
  const level = Math.max(LEVEL.staff, Math.min(levelOf(wsLevels, shiori.id), LEVEL.owner));
  if (await isMember(nordlys, shiori.id)) shioriNordlys = 'already on the team';
  else {
    if (!dry) {
      for (const roomId of [nordlys, ...childRooms(nordlys)]) {
        if (!(await isMember(roomId, shiori.id))) await ok(token, 'POST', `/_matrix/client/v3/rooms/${enc(roomId)}/invite`, { user_id: shiori.id });
        await setLevel(roomId, shiori.id, level);
      }
      // Later rooms (the project below) take her level from the space.
      spaceState.set(nordlys, await getState(nordlys));
    }
    shioriNordlys = would(`add her to the team (level ${level})`);
  }
  if (!(await isMember(workspace, shiori.id))) note('Shiori', 'not in the workspace (add her with pnpm add:staff)');
}
note('Shiori on Nordlys', nordlys ? shioriNordlys : 'no client space "Nordlys", skipped');

// ---------------------------------------------------------------------------------------------------------------------
// Boards

type IssueSpec = { title: string; column: string; assignee?: 'shiori' | 'sofia'; due?: number; description?: string; comment?: boolean };

async function hierarchy(spaceId: string) {
  const rooms: { room_id: string; room_type?: string; name?: string }[] = [];
  let from: string | undefined;
  do {
    const res = await ok(token, 'GET', `/_matrix/client/v1/rooms/${enc(spaceId)}/hierarchy?max_depth=1&limit=100${from ? `&from=${enc(from)}` : ''}`);
    rooms.push(...res.rooms);
    from = res.next_batch;
  } while (from);
  return rooms;
}

async function ensureProject(spaceId: string, name: string, key: string, colour: string, issues: IssueSpec[]) {
  const label = `project ${key} "${name}"`;
  let projectId: string | undefined;
  for (const r of await hierarchy(spaceId)) {
    if (r.room_type !== PROJECT) continue;
    if (!joinedRooms.includes(r.room_id)) {
      if (dry) {
        if (r.name === name) projectId = r.room_id;
        continue;
      }
      if ((await mx(token, 'POST', `/_matrix/client/v3/join/${enc(r.room_id)}?server_name=${enc(SERVER)}`, {})).status >= 300) continue;
      joinedRooms.push(r.room_id);
    }
    const st = await getState(r.room_id);
    if (find(st, PROJECT)?.content.key === key || find(st, 'm.room.name')?.content.name === name) projectId = r.room_id;
    if (projectId) break;
  }
  if (!projectId) {
    if (!dry) {
      ({ room_id: projectId } = await ok(token, 'POST', '/_matrix/client/v3/createRoom', {
        name,
        preset: 'private_chat',
        visibility: 'private',
        creation_content: { type: PROJECT },
        power_level_content_override: roomLevels(spaceId, { [ISSUE]: 0, [DESCRIPTION]: 0, [COLUMNS]: spaceId === workspace ? 0 : LEVEL.staff }),
        initial_state: [
          ...childState(spaceId),
          { type: PROJECT, state_key: '', content: { key, colour } },
          { type: COLUMNS, state_key: '', content: { columns: COLUMN_TITLES } },
        ],
      }));
      await state(token, spaceId, 'm.space.child', projectId!, { via: [SERVER] });
      joinedRooms.push(projectId!);
    }
    note(label, would('create'));
  } else note(label, 'exists, skipped');

  const st = projectId && joinedRooms.includes(projectId) ? await getState(projectId) : projectId && dry ? null : [];
  if (!st) {
    note(`  ${key} issues`, 'project not joined yet, would join and check');
    return;
  }
  const realKey: string = find(st, PROJECT)?.content.key ?? key;
  const issueState = st.filter((e) => e.type === ISSUE);
  const live = issueState.filter((e) => typeof e.content.order === 'string');
  let n = Math.max(0, ...issueState.map((e) => (typeof e.content.n === 'number' ? e.content.n : 0)));
  const lastOrder = new Map<string, string>();
  for (const e of live) if (!lastOrder.has(e.content.column) || e.content.order > lastOrder.get(e.content.column)!) lastOrder.set(e.content.column, e.content.order);

  for (const spec of issues) {
    const found = live.find((e) => e.content.title === spec.title);
    let issueId = found?.state_key;
    const assignee = spec.assignee === 'shiori' ? shiori?.id : spec.assignee === 'sofia' ? me : undefined;
    if (!issueId) {
      n++;
      const order: string = generateKeyBetween(lastOrder.get(spec.column) ?? null, null);
      lastOrder.set(spec.column, order);
      if (!dry) {
        issueId = await send(token, projectId!, { msgtype: 'm.text', body: `${realKey}-${n} ${spec.title}`, [ISSUE]: { n } });
        await state(token, projectId!, ISSUE, issueId, {
          title: spec.title,
          column: spec.column,
          ...(assignee ? { assignee } : {}),
          ...(spec.due !== undefined ? { due: day(spec.due) } : {}),
          order,
          n,
        });
      }
    }
    const parts: string[] = [found ? 'exists, skipped' : would('create')];
    if (spec.description && (!issueId || !find(st, DESCRIPTION, issueId)?.content.body)) {
      if (!dry && issueId) await state(token, projectId!, DESCRIPTION, issueId, { body: spec.description });
      parts.push(would('set description'));
    }
    if (spec.comment && shiori) {
      const replies = issueId ? await ok(token, 'GET', `/_matrix/client/v1/rooms/${enc(projectId!)}/relations/${enc(issueId)}/m.thread?limit=1`) : { chunk: [] };
      if (!replies.chunk.length) {
        if (!dry) {
          const rest = ', could you take the first pass? A short list is plenty to start.';
          await send(token, projectId!, {
            msgtype: 'm.text',
            body: `${shiori.name}${rest}`,
            format: 'org.matrix.custom.html',
            formatted_body: `<a href="https://matrix.to/#/${shiori.id}">${shiori.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</a>${rest}`,
            'm.mentions': { user_ids: [shiori.id] },
            'm.relates_to': { rel_type: 'm.thread', event_id: issueId, is_falling_back: true, 'm.in_reply_to': { event_id: issueId } },
          });
        }
        parts.push(would('comment mentioning Shiori'));
      }
    }
    if (spec.assignee === 'shiori' && !shiori && !found) parts.push('unassigned (no Shiori)');
    note(`  ${realKey} ${spec.title}`, parts.join(', '));
  }
}

await ensureProject(workspace, 'Pasodrum work', 'PDW', '#0F766E', [
  { title: 'ドラッグしてみて →', column: 'todo', assignee: 'shiori', description: 'このカードを「In progress」へドラッグしてみてください。' },
  { title: 'Write the onboarding checklist for new clients', column: 'todo', due: 7 },
  { title: '社内用語の翻訳ルールをまとめる', column: 'doing', assignee: 'shiori', due: 3, comment: true },
  { title: 'Desktop app: try Electron and Tauri', column: 'doing', assignee: 'sofia', due: 10 },
  { title: 'ウェルカムページを読んで感想を送る', column: 'review', assignee: 'shiori', due: 1 },
  { title: 'Move the team chat to Pasodrum work', column: 'done', assignee: 'sofia' },
]);
if (nordlys) {
  await ensureProject(nordlys, 'Meter portal', 'MTR', '#1D4ED8', [
    { title: 'Photo upload for meter readings', column: 'todo', due: 14 },
    { title: '前月比で検針値をチェックする', column: 'doing', assignee: 'shiori', due: 5 },
    { title: 'Sign in with customer number', column: 'review', assignee: 'sofia', due: 2 },
    { title: 'Kick-off with Nordlys', column: 'done' },
  ]);
}

console.log(summary.join('\n'));
console.log(`${dry ? 'Dry run, nothing written.' : 'Done.'} Shiori on Nordlys: ${shioriNordlys}.`);
