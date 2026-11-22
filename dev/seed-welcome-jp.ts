// SEED-01: a casual Japanese guide page and a 「Pasodrum work」 try-it board in the workspace, made as whoever signs in.
// Asks for the username and password (hidden), signs out at the end, and skips whatever already exists.
//   pnpm seed:welcome-jp --dry-run     production (https://pasodrum.work), nothing written
//   pnpm seed:welcome-jp               production, writes
//   pnpm seed:welcome-jp --local       the dev stack (or MATRIX_BASE=…)
import { readFileSync, realpathSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

const dry = process.argv.includes('--dry-run');
process.env.MATRIX_BASE ??= process.argv.includes('--local') ? 'http://localhost:8008' : 'https://pasodrum.work';
const { BASE, askHidden, enc, mx, ok, send, state } = await import('./lib.ts');
const { powerLevels, channelUsers } = await import('../apps/web/src/matrix/levels.ts');

const PAGES = 'work.pasodrum.docs.page';
const UPDATE = 'work.pasodrum.docs.update';
const SNAPSHOT = 'work.pasodrum.docs.snapshot';
const PROJECT = 'work.pasodrum.boards.project';
const COLUMNS = 'work.pasodrum.boards.columns';
const ISSUE = 'work.pasodrum.boards.issue';
const DESCRIPTION = 'work.pasodrum.boards.description';

// ---------------------------------------------------------------------------------------------------------------------
// Content

type J = Record<string, any>;
const text = (t: string): J => ({ type: 'text', text: t });
const h = (t: string): J => ({ type: 'heading', attrs: { level: 2 }, content: [text(t)] });
const p = (t = ''): J => ({ type: 'paragraph', ...(t ? { content: [text(t)] } : {}) });
const ul = (...items: string[]): J => ({ type: 'bulletList', content: items.map((i) => ({ type: 'listItem', content: [p(i)] })) });

const PAGE_TITLE = 'Pasodrum work のつかいかた';
const PROJECT_NAME = 'Pasodrum work';
const PROJECT_COLOUR = '#0F766E';

const pageBody: J = {
  type: 'doc',
  content: [
    p('やっほー！ざっくり紹介するね 👋'),
    h('💬 チャット'),
    ul('チャンネルはみんなの話し場。DM は個別で', '返信はスレッドにするとスッキリ'),
    p('👉 メッセージにカーソルを乗せて「スレッドで返信」してみて'),
    h('📄 ドキュメント'),
    ul('このページもドキュメント。みんなで同時に編集できるよ', '/ で見出し、チェックリスト、表とかを足せる'),
    p('👉 この下に行を足して [[メモ って打ってみて。新しいページができるよ'),
    p(),
    p('👉 右上の 🔗 でリンクをコピーして、#general に貼ってみて'),
    h('📋 ボード'),
    ul('プロジェクトごとのボード。カードはドラッグで動かすだけ'),
    p('👉 ボードの「Pasodrum work」を開いてみて。お試しカードが待ってるよ'),
    h('🔍 検索とアクティビティ'),
    ul('⌘K でチャンネル、人、メッセージにひとっ飛び', 'メンションや返信、担当になったカードはアクティビティに届くよ'),
    p('👉 ⌘K を押して「general」って打ってみて'),
    p('わからないことは #general で気軽に聞いてね 🙌'),
  ],
};

type IssueSpec = { title: string; column: string; mine?: boolean; description: string; comment?: string };
const issues: IssueSpec[] = [
  { title: 'ドラッグしてみて 👉', column: 'todo', mine: true, description: 'このカードをとなりの列に引っぱってみて' },
  { title: '自分にアサインしてみて', column: 'todo', description: 'カードを開いて「担当」から自分を選んでね' },
  { title: 'コメントしてみて', column: 'todo', mine: true, description: 'カードを開いて、下にひとこと書いてみて。@ でメンションもできるよ', comment: 'やっほー！下から返事してみて 👇' },
  { title: 'このリンクをチャットに貼ってみて', column: 'doing', mine: true, description: 'カードの … から「リンクをコピー」して #general に貼ると、カードになるよ' },
  { title: '期限を決めてみて', column: 'doing', mine: true, description: 'カードを開いて「期限」から日にちを選んでね' },
  { title: '完了にしてみて', column: 'review', mine: true, description: '「完了」の列にドラッグしてみて' },
  { title: 'Pasodrum work をはじめる 🎉', column: 'done', mine: true, description: 'できた！' },
];

// Column titles as the app stores them for someone using it in Japanese (D-37: titles aren't translated later).
const boardsJa = JSON.parse(readFileSync(new URL('../apps/web/src/features/boards/locales/ja.json', import.meta.url), 'utf8'));
const COLUMN_TITLES = [
  { id: 'todo', title: boardsJa.columnTodo },
  { id: 'doing', title: boardsJa.columnDoing },
  { id: 'review', title: boardsJa.columnReview },
  { id: 'done', title: boardsJa.columnDone },
];

// ---------------------------------------------------------------------------------------------------------------------
// The page body, built with the Docs editor's own schema (one Yjs update, as docsProvider sends it).

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
const dummyStore = { render: () => ({}) };
const noView = () => ({});
const schema = tiptap.getSchema(
  docsExt.docsExtensions({ doc: new Y.Doc(), slash: dummyStore, links: dummyStore, slashItems: () => [], linkItems: () => [], onSlash() {}, onLink() {}, views: { pageLink: noView, image: noView, file: noView } }),
);
function bodyUpdate(json: J): string {
  const update: Uint8Array = Y.encodeStateAsUpdate(yTiptap.prosemirrorJSONToYDoc(schema, json, 'default'));
  if (update.byteLength > 40 * 1024) throw new Error('page body too big for one event');
  return Buffer.from(update).toString('base64');
}
const body = bodyUpdate(pageBody); // fails here, before signing in, if the content doesn't fit the schema

// ---------------------------------------------------------------------------------------------------------------------
// Sign in

console.log(`${dry ? 'Dry run on' : 'Writing to'} ${BASE}`);
let username: string;
let password: string;
if (process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  username = await rl.question('Username: ');
  rl.close();
  password = await askHidden('Password: ');
} else {
  // Piped (tests): both lines from one reader.
  const it = createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  username = (await it.next()).value ?? '';
  password = (await it.next()).value ?? '';
}
username = username.trim().replace(/^@/, '').replace(/:.*$/, '');
const signIn = await mx(null, 'POST', '/_matrix/client/v3/login', {
  type: 'm.login.password',
  identifier: { type: 'm.id.user', user: username },
  password,
  initial_device_display_name: 'seed-welcome-jp',
});
if (signIn.status !== 200) {
  console.error(signIn.status === 403 ? 'Wrong username or password.' : `Sign-in failed (${signIn.status}).`);
  process.exit(1);
}
const token: string = signIn.body.access_token;
const me: string = signIn.body.user_id;
const SERVER = me.slice(me.indexOf(':') + 1);

type StateEvent = { type: string; state_key: string; sender: string; content: Record<string, any> };
const lines: string[] = [];
let writes = 0;
const did = (item: string, status: string) => void lines.push(`  ${item}: ${status}`);
const write = (what: string) => (writes++, dry ? `would ${what}` : what.replace(/^create\b/, 'created').replace(/^write\b/, 'wrote').replace(/^set\b/, 'set').replace(/^add\b/, 'added'));
const getState = (roomId: string) => ok(token, 'GET', `/_matrix/client/v3/rooms/${enc(roomId)}/state`) as Promise<StateEvent[]>;
const find = (st: StateEvent[], type: string, key = '') => st.find((e) => e.type === type && e.state_key === key);
const join = (roomId: string) => mx(token, 'POST', `/_matrix/client/v3/join/${enc(roomId)}?server_name=${enc(SERVER)}`, {});

try {
  const workspace = (await ok(token, 'GET', `/_matrix/client/v3/directory/room/${enc(`#workspace:${SERVER}`)}`)).room_id as string;
  const wsState = await getState(workspace).catch(() => {
    throw new Error(`${me} is not in the workspace.`);
  });
  const { joined_rooms: joined } = (await ok(token, 'GET', '/_matrix/client/v3/joined_rooms')) as { joined_rooms: string[] };
  console.log(`Signed in as ${me}.`);

  // Same levels and join rules the app gives a new page or project (docsBoardsCore roomLevels / childState).
  const roomLevels = (extra: Record<string, number>) => {
    const create = find(wsState, 'm.room.create')!;
    const pl = find(wsState, 'm.room.power_levels')?.content ?? {};
    const v12 = Number(create.content.room_version) >= 12 || String(create.content.room_version).includes('hydra');
    const creators = v12 ? [create.sender, ...(create.content.additional_creators ?? [])] : [];
    const base = powerLevels('workspace', 'channel', channelUsers(pl.users ?? {}, creators, me));
    return { ...base, events: { ...base.events, ...extra } };
  };
  const childState = [
    { type: 'm.space.parent', state_key: workspace, content: { via: [SERVER], canonical: true } },
    { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: 'shared' } },
    { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'restricted', allow: [{ type: 'm.room_membership', room_id: workspace }] } },
  ];

  // --- The page: top of the workspace's Docs.
  const pages = wsState.filter((e) => e.type === PAGES && typeof e.content.order === 'string');
  const existing = pages.find((e) => e.content.title === PAGE_TITLE && !e.content.parent);
  if (!existing) {
    if (!dry) {
      const first = pages.filter((e) => !e.content.parent).map((e) => e.content.order as string).sort()[0] ?? null;
      const { room_id } = await ok(token, 'POST', '/_matrix/client/v3/createRoom', {
        preset: 'private_chat',
        visibility: 'private',
        creation_content: { type: PAGES },
        power_level_content_override: roomLevels({ [SNAPSHOT]: 0, 'm.room.name': 0 }),
        initial_state: childState,
      });
      await state(token, workspace, PAGES, room_id, { title: PAGE_TITLE, order: generateKeyBetween(null, first) });
      await send(token, room_id, { update: body }, UPDATE);
    }
    did(`page 「${PAGE_TITLE}」`, write('create'));
  } else {
    const pageId = existing.state_key;
    if (!joined.includes(pageId) && !dry) await join(pageId);
    const snap = await mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(pageId)}/state/${SNAPSHOT}/`);
    const filter = enc(JSON.stringify({ types: [UPDATE] }));
    const msgs = await mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(pageId)}/messages?dir=f&limit=1&filter=${filter}`);
    const empty = !(snap.status === 200 && snap.body?.url) && msgs.status === 200 && msgs.body.chunk.length === 0;
    if (empty && !dry) await send(token, pageId, { update: body }, UPDATE);
    did(`page 「${PAGE_TITLE}」`, empty ? write('write its empty body') : msgs.status === 200 ? 'exists, skipped' : 'exists (not joined), skipped');
  }

  // --- The project, found by name among the workspace's projects.
  let projectId: string | undefined;
  let from: string | undefined;
  do {
    const res = await ok(token, 'GET', `/_matrix/client/v1/rooms/${enc(workspace)}/hierarchy?max_depth=1&limit=100${from ? `&from=${enc(from)}` : ''}`);
    projectId ??= (res.rooms as { room_id: string; room_type?: string; name?: string }[]).find((r) => r.room_type === PROJECT && r.name === PROJECT_NAME)?.room_id;
    from = res.next_batch;
  } while (from);

  if (!projectId) {
    // The key the app would pick for this name ("Pasodrum work" → PAS), unless another workspace project has it.
    const taken = new Set<string>();
    for (const r of wsState.filter((e) => e.type === 'm.space.child' && e.content.via?.length && joined.includes(e.state_key))) {
      const key = await mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(r.state_key)}/state/${PROJECT}/`);
      if (key.status === 200 && key.body?.key) taken.add(key.body.key);
    }
    const base = PROJECT_NAME.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3);
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base}${i}`;
    if (!dry) {
      ({ room_id: projectId } = await ok(token, 'POST', '/_matrix/client/v3/createRoom', {
        name: PROJECT_NAME,
        preset: 'private_chat',
        visibility: 'private',
        creation_content: { type: PROJECT },
        power_level_content_override: roomLevels({ [ISSUE]: 0, [DESCRIPTION]: 0, [COLUMNS]: 0 }),
        initial_state: [...childState, { type: PROJECT, state_key: '', content: { key, colour: PROJECT_COLOUR } }, { type: COLUMNS, state_key: '', content: { columns: COLUMN_TITLES } }],
      }));
      await state(token, workspace, 'm.space.child', projectId!, { via: [SERVER] });
    }
    did(`project 「${PROJECT_NAME}」 (${key})`, write('create'));
  } else {
    did(`project 「${PROJECT_NAME}」`, 'exists, skipped');
    if (!joined.includes(projectId) && !dry && (await join(projectId)).status >= 300) throw new Error(`Can't join the project ${projectId}.`);
  }

  // --- Its issues, found by title. A dry run against a project I'm not in yet can't see them.
  const st = projectId && (joined.includes(projectId) || !dry) ? await getState(projectId) : [];
  const key: string = find(st, PROJECT)?.content.key ?? 'PAS';
  const issueState = st.filter((e) => e.type === ISSUE);
  const live = issueState.filter((e) => typeof e.content.order === 'string');
  let n = Math.max(0, ...issueState.map((e) => (typeof e.content.n === 'number' ? e.content.n : 0)));
  const last = new Map<string, string>();
  for (const e of live) if (!last.has(e.content.column) || e.content.order > last.get(e.content.column)!) last.set(e.content.column, e.content.order);

  for (const spec of issues) {
    const found = live.find((e) => e.content.title === spec.title);
    let issueId = found?.state_key;
    const parts: string[] = [];
    if (!issueId) {
      n++;
      const order: string = generateKeyBetween(last.get(spec.column) ?? null, null);
      last.set(spec.column, order);
      if (!dry) {
        issueId = await send(token, projectId!, { msgtype: 'm.text', body: `${key}-${n} ${spec.title}`, [ISSUE]: { n } });
        await state(token, projectId!, ISSUE, issueId, { title: spec.title, column: spec.column, ...(spec.mine ? { assignee: me } : {}), order, n });
      }
      parts.push(write('create'));
    } else parts.push('exists, skipped');
    if (!issueId || !find(st, DESCRIPTION, issueId)?.content.body) {
      if (!dry) await state(token, projectId!, DESCRIPTION, issueId!, { body: spec.description });
      parts.push(write('set description'));
    }
    if (spec.comment) {
      const replies = issueId ? await ok(token, 'GET', `/_matrix/client/v1/rooms/${enc(projectId!)}/relations/${enc(issueId)}/m.thread?limit=1`) : { chunk: [] };
      if (!replies.chunk.length) {
        if (!dry) {
          await send(token, projectId!, {
            msgtype: 'm.text',
            body: spec.comment,
            'm.relates_to': { rel_type: 'm.thread', event_id: issueId, is_falling_back: true, 'm.in_reply_to': { event_id: issueId } },
          });
        }
        parts.push(write('add comment'));
      }
    }
    did(`  ${spec.title}`, parts.join(', '));
  }

  console.log(lines.join('\n'));
  console.log(dry ? `Dry run: ${writes} writes needed, nothing written.` : `Done: ${writes} writes.`);
} finally {
  await mx(token, 'POST', '/_matrix/client/v3/logout', {});
}
