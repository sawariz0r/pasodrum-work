// Checks every API-testable row of the M0 probe table (SPEC §8). Run after pnpm dev:seed: pnpm probe
import { readFileSync, writeFileSync } from 'node:fs';
import { BASE, LOCAL, MAILPIT, PASSWORD, SEED_FILE, SERVER, enc, envToken, login, mx, ok, register, send, sleep, state, userId } from './lib.ts';

const seed = JSON.parse(readFileSync(SEED_FILE, 'utf8'));
const t: Record<string, string> = seed.tokens;
const r: Record<string, string> = seed.rooms;
const client = t['henrik_nordlys.no']!;
const guest = t['lea_freelance.dev']!;

type Row = { check: string; must?: boolean; pass: boolean | null; detail: string; fallback: string };
const rows: Row[] = [];

async function probe(check: string, fallback: string, fn: () => Promise<[boolean | null, string]>, must = false) {
  let pass: boolean | null = false;
  let detail = '';
  try { [pass, detail] = await fn(); } catch (e) { detail = `error: ${String(e).slice(0, 200)}`; }
  rows.push({ check, must, pass, detail, fallback });
  console.log(`${pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL'}${must ? ' (must)' : ''}  ${check} — ${detail}`);
}

const msgs = async (token: string, room: string, filter?: object) =>
  mx(token, 'GET', `/_matrix/client/v3/rooms/${enc(room)}/messages?dir=b&limit=50${filter ? `&filter=${enc(JSON.stringify(filter))}` : ''}`);

// ── Must-haves ─────────────────────────────────────────────
await probe('Simplified Sliding Sync (Element X)', 'None — escalate', async () => {
  const v = await ok(null, 'GET', '/_matrix/client/versions');
  const flag = v.unstable_features?.['org.matrix.simplified_msc3575'] === true;
  const s = await mx(t.sofia!, 'POST', '/_matrix/client/unstable/org.matrix.simplified_msc3575/sync', {
    lists: { all: { ranges: [[0, 20]], timeline_limit: 1, required_state: [['m.room.name', '']] } },
  });
  const rooms = Object.keys(s.body?.rooms ?? {}).length;
  return [flag && s.status === 200 && rooms > 0, `flag=${flag}, sync ${s.status}, ${rooms} rooms`];
}, true);

await probe('Client isolation: restricted join, space listing, history', 'Invite-only rooms everywhere; escalate if still exposed', async () => {
  const join = await mx(client, 'POST', `/_matrix/client/v3/join/${enc(r.general!)}`, {});
  const hier = await mx(client, 'GET', `/_matrix/client/v1/rooms/${enc(r.workspace!)}/hierarchy`);
  const hierRooms = hier.status === 200 ? (hier.body.rooms ?? []).length : 0;
  const read = await msgs(client, r.general!);
  const readEvents = read.status === 200 ? (read.body.chunk ?? []).length : 0;
  const pub = await ok(client, 'POST', '/_matrix/client/v3/publicRooms', {});
  const leaked = (pub.chunk ?? []).length;
  const gJoin = await mx(guest, 'POST', `/_matrix/client/v3/join/${enc(r.general!)}`, {});
  const pass = join.status >= 400 && hierRooms === 0 && readEvents === 0 && leaked === 0 && gJoin.status >= 400;
  return [pass, `client join general ${join.status}, workspace listing ${hier.status}/${hierRooms} rooms, read general ${read.status} with ${readEvents} events, public directory ${leaked}, guest join general ${gJoin.status}`];
}, true);

await probe('Client isolation: user directory hides staff', 'Server config; escalate if staff are still exposed', async () => {
  const s1 = await ok(client, 'POST', '/_matrix/client/v3/user_directory/search', { search_term: 'jonas', limit: 10 });
  const s2 = await ok(client, 'POST', '/_matrix/client/v3/user_directory/search', { search_term: 'ingrid', limit: 10 });
  const s3 = await ok(guest, 'POST', '/_matrix/client/v3/user_directory/search', { search_term: 'henrik', limit: 10 });
  const jonas = s1.results.length, ingrid = s2.results.length, henrik = s3.results.length;
  return [jonas === 0 && henrik === 0, `client finds unrelated staff "jonas": ${jonas}; shared-room staff "ingrid": ${ingrid}; guest finds client "henrik": ${henrik}`];
}, true);

let threadRoot = '';
await probe('Threads: relations and threads list', 'Escalate — threads are core', async () => {
  threadRoot = await send(t.jonas!, r.general!, { msgtype: 'm.text', body: 'Thread root' });
  await send(t.ingrid!, r.general!, { msgtype: 'm.text', body: 'Reply in thread', 'm.relates_to': { rel_type: 'm.thread', event_id: threadRoot, is_falling_back: true, 'm.in_reply_to': { event_id: threadRoot } } });
  const list = await ok(t.sofia!, 'GET', `/_matrix/client/v1/rooms/${enc(r.general!)}/threads`);
  const rel = await ok(t.sofia!, 'GET', `/_matrix/client/v1/rooms/${enc(r.general!)}/relations/${enc(threadRoot)}/m.thread`);
  const found = (list.chunk ?? []).some((e: any) => e.event_id === threadRoot);
  return [found && rel.chunk.length === 1, `threads list has root: ${found}, relations: ${rel.chunk.length}`];
}, true);

// ── Should-haves ───────────────────────────────────────────
await probe('Thread summaries and per-thread receipts', 'Compute summaries from history; unread per channel only', async () => {
  const ev = await ok(t.sofia!, 'GET', `/_matrix/client/v3/rooms/${enc(r.general!)}/event/${enc(threadRoot)}`);
  const summary = ev.unsigned?.['m.relations']?.['m.thread'];
  const receipt = await mx(t.sofia!, 'POST', `/_matrix/client/v3/rooms/${enc(r.general!)}/receipt/m.read/${enc(threadRoot)}`, { thread_id: threadRoot });
  return [!!summary?.count && receipt.status === 200, `summary count=${summary?.count ?? 'none'}, threaded receipt ${receipt.status}`];
});

await probe('Token registration; claim (set password) and revoke (deactivate) with standard API', 'Service drives admin-room commands', async () => {
  const lp = `probe_${Date.now()}`;
  const tok = await register(lp, envToken());
  const pw = await mx(tok, 'POST', '/_matrix/client/v3/account/password', { new_password: 'claimed-pass', logout_devices: false, auth: { type: 'm.login.password', identifier: { type: 'm.id.user', user: lp }, password: PASSWORD } });
  const tok2 = await login(lp, 'claimed-pass');
  const de = await mx(tok2, 'POST', '/_matrix/client/v3/account/deactivate', { auth: { type: 'm.login.password', identifier: { type: 'm.id.user', user: lp }, password: 'claimed-pass' } });
  const after = await mx(null, 'POST', '/_matrix/client/v3/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: lp }, password: 'claimed-pass' });
  return [pw.status === 200 && de.status === 200 && after.status >= 400, `register ok, change password ${pw.status}, deactivate ${de.status}, login after ${after.status}`];
});

await probe('Password login (SSO not configured; OIDC would disable passwords)', 'None needed — password only in v1 (D-12)', async () => {
  const f = await ok(null, 'GET', '/_matrix/client/v3/login');
  const types = f.flows.map((x: any) => x.type);
  return [types.includes('m.login.password'), types.join(', ')];
});

await probe('/notifications lists mentions', 'Mentions list built locally', async () => {
  await send(t.jonas!, r.general!, { msgtype: 'm.text', body: 'Sofia Olsen can you check?', 'm.mentions': { user_ids: [userId('sofia')] } });
  await sleep(500);
  const n = await mx(t.sofia!, 'GET', '/_matrix/client/v3/notifications?limit=20');
  const hit = (n.body.notifications ?? []).some((x: any) => x.event?.content?.body?.includes('can you check'));
  return [n.status === 200 && hit, `status ${n.status}, mention present: ${hit}, ${(n.body.notifications ?? []).length} notifications`];
});

await probe('Presence', 'Hide presence dots', async () => {
  await ok(t.jonas!, 'PUT', `/_matrix/client/v3/presence/${enc(userId('jonas'))}/status`, { presence: 'online' });
  const p = await mx(t.sofia!, 'GET', `/_matrix/client/v3/presence/${enc(userId('jonas'))}/status`);
  return [p.body?.presence === 'online', `status ${p.status}, presence=${p.body?.presence}`];
});

await probe('URL previews', 'Links stay plain', async () => {
  const p = await mx(t.sofia!, 'GET', `/_matrix/client/v1/media/preview_url?url=${enc('https://example.com')}`);
  return [p.status === 200 && !!p.body['og:title'], `status ${p.status}, og:title=${p.body?.['og:title'] ?? '—'}`];
});

async function latestMail(subject: string, to: string): Promise<string> {
  if (!MAILPIT) throw new Error('no Mailpit');
  for (let i = 0; i < 20; i++) {
    const list = await fetch(`${MAILPIT}/api/v1/messages`).then((x) => x.json());
    const hit = (list.messages ?? []).find((m: any) => m.Subject.includes(subject) && m.To.some((x: any) => x.Address === to));
    if (hit) return (await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`).then((x) => x.json())).Text;
    await sleep(250);
  }
  throw new Error(`no "${subject}" mail to ${to}`);
}

await probe('Email password reset (verify email, then reset)', 'Reset link issued by invite service', async () => {
  if (!MAILPIT) return [null, 'no Mailpit on this server'];
  const email = `jonas.${Date.now()}@pasodrum.localhost`;
  const secret = `probe${Date.now()}`;
  const req = await ok(t.jonas!, 'POST', '/_matrix/client/v3/account/3pid/email/requestToken', { client_secret: secret, email, send_attempt: 1 });
  const link = (await latestMail('Verify', email)).match(/https?:\/\/\S+validate\S+/)![0];
  const v = await fetch(link);
  let add = await mx(t.jonas!, 'POST', '/_matrix/client/v3/account/3pid/add', { client_secret: secret, sid: req.sid });
  if (add.status === 401) add = await mx(t.jonas!, 'POST', '/_matrix/client/v3/account/3pid/add', { client_secret: secret, sid: req.sid, auth: { type: 'm.login.password', identifier: { type: 'm.id.user', user: 'jonas' }, password: PASSWORD, session: add.body.session } });
  const reset = await mx(null, 'POST', '/_matrix/client/v3/account/password/email/requestToken', { client_secret: `${secret}r`, email, send_attempt: 1 });
  const mail = reset.status === 200 ? await latestMail('', email).then(() => 'mail sent') : 'no mail';
  return [add.status === 200 && reset.status === 200, `verify link ${v.status}, bind email ${add.status}, reset request ${reset.status} ${reset.body?.errcode ?? ''} (${mail}); server mail shows the Matrix ID and server branding`];
});

await probe('SMTP delivery (Mailpit)', 'Invite service sends its own mail', async () => {
  if (!MAILPIT) return [null, 'no Mailpit on this server'];
  const m = await fetch(`${MAILPIT}/api/v1/messages`).then((x) => x.json()).catch(() => null);
  const count = m?.total ?? m?.messages_count ?? 0;
  return [count > 0, `${count} messages in Mailpit`];
});

await probe('CORS and .well-known', 'Caddy serves them', async () => {
  const wk = await ok(null, 'GET', '/.well-known/matrix/client');
  const res = await fetch(BASE + '/_matrix/client/v3/login', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } });
  const allow = res.headers.get('access-control-allow-origin');
  if (!LOCAL) return [!!wk['m.homeserver']?.base_url?.startsWith('https://') && allow === '*', `well-known base_url=${wk['m.homeserver']?.base_url}, preflight allow-origin=${allow}`];
  return [!!wk['m.homeserver']?.base_url && allow === '*', `well-known base_url=${wk['m.homeserver']?.base_url}, preflight allow-origin=${allow}`];
});

await probe('Message search incl. Japanese and partial words', 'Local substring scan of cached history', async () => {
  const s = async (term: string) => {
    const b = await ok(t.sofia!, 'POST', '/_matrix/client/v3/search', { search_categories: { room_events: { search_term: term } } });
    return b.search_categories.room_events.count ?? b.search_categories.room_events.results.length;
  };
  const en = await s('Thursday'), part = await s('Thurs'), ja = await s('テスト'), ja2 = await s('レビュー');
  return [en > 0 && ja > 0 && ja2 > 0, `"Thursday" ${en}, "Thurs" ${part}, "テスト" ${ja}, "レビュー" ${ja2}`];
});

await probe('contains_url filter (Files tab)', 'Local scan for Files tab', async () => {
  const up = await fetch(`${BASE}/_matrix/media/v3/upload?filename=${enc('資料.pdf')}`, { method: 'POST', headers: { Authorization: `Bearer ${t.jonas}`, 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 probe' }).then((x) => x.json());
  await send(t.jonas!, r.general!, { msgtype: 'm.file', body: '資料.pdf', filename: '資料.pdf', url: up.content_uri, info: { mimetype: 'application/pdf' } });
  const m = await msgs(t.sofia!, r.general!, { contains_url: true });
  const chunk = m.body.chunk ?? [];
  const onlyFiles = chunk.length > 0 && chunk.every((e: any) => !!e.content?.url);
  return [onlyFiles, `${chunk.length} events, all with url: ${onlyFiles}`];
});

await probe('Key backup and cross-signing upload', 'Encrypted channels show no pre-join history', async () => {
  const kb = await mx(t.sofia!, 'POST', '/_matrix/client/v3/room_keys/version', { algorithm: 'm.megolm_backup.v1.curve25519-aes-sha2', auth_data: { public_key: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG' } });
  const keys = (usage: string) => ({ user_id: userId('sofia'), usage: [usage], keys: { [`ed25519:${usage}probe`]: `${usage}probe` } });
  const body = { master_key: keys('master') }; // sub-keys need real signatures; covered with the SDK in M6
  let cs = await mx(t.sofia!, 'POST', '/_matrix/client/v3/keys/device_signing/upload', body);
  if (cs.status === 401) cs = await mx(t.sofia!, 'POST', '/_matrix/client/v3/keys/device_signing/upload', { ...body, auth: { type: 'm.login.password', identifier: { type: 'm.id.user', user: 'sofia' }, password: PASSWORD, session: cs.body.session } });
  return [kb.status === 200 && cs.status === 200, `backup version ${kb.status}, cross-signing master key upload ${cs.status}; signed sub-keys and history sharing verified with the SDK in M6`];
});

await probe('Custom profile field (email)', 'Derive email from sign-in ID', async () => {
  const paths = [`/_matrix/client/v3/profile/${enc(userId('jonas'))}/work.pasodrum.email`, `/_matrix/client/unstable/uk.tcpip.msc4133/profile/${enc(userId('jonas'))}/work.pasodrum.email`];
  for (const p of paths) {
    const put = await mx(t.jonas!, 'PUT', p, { 'work.pasodrum.email': 'jonas@pasodrum.no' });
    if (put.status === 200) {
      const get = await mx(t.sofia!, 'GET', p);
      return [get.body?.['work.pasodrum.email'] === 'jonas@pasodrum.no', `${p.includes('unstable') ? 'unstable MSC4133' : 'v3'} put ${put.status}, get ${get.status}`];
    }
  }
  return [false, 'no profile field endpoint accepted the write'];
});

await probe('Custom room type, custom state and extra message keys round-trip', 'Docs/Boards data lives outside rooms', async () => {
  const room = await ok(t.sofia!, 'POST', '/_matrix/client/v3/createRoom', { name: 'Probe board', preset: 'private_chat', creation_content: { type: 'work.pasodrum.boards.board' } });
  const create = await ok(t.sofia!, 'GET', `/_matrix/client/v3/rooms/${enc(room.room_id)}/state/m.room.create/`);
  await state(t.sofia!, r.general!, 'work.pasodrum.tab', 'probe', { type: 'boards.board', title: 'Board', order: 1, ref: room.room_id });
  const tab = await ok(t.sofia!, 'GET', `/_matrix/client/v3/rooms/${enc(r.general!)}/state/work.pasodrum.tab/probe`);
  await state(t.sofia!, r.general!, 'work.pasodrum.tab', 'probe', {});
  const id = await send(t.sofia!, r.general!, { msgtype: 'm.text', body: 'See https://example.com', 'work.pasodrum.link_cards.card': { url: 'https://example.com', title: 'Example' } });
  const ev = await ok(t.jonas!, 'GET', `/_matrix/client/v3/rooms/${enc(r.general!)}/event/${enc(id)}`);
  const pass = create.type === 'work.pasodrum.boards.board' && tab.ref === room.room_id && ev.content['work.pasodrum.link_cards.card']?.title === 'Example';
  return [pass, `room type ${create.type}, tab state ref ok: ${tab.ref === room.room_id}, extra key kept: ${!!ev.content['work.pasodrum.link_cards.card']}`];
});

await probe('Invite service identity check (OpenID / whoami)', 'whoami with caller token', async () => {
  const o = await mx(t.jonas!, 'POST', `/_matrix/client/v3/user/${enc(userId('jonas'))}/openid/request_token`, {});
  const info = o.status === 200 ? await mx(null, 'GET', `/_matrix/federation/v1/openid/userinfo?access_token=${enc(o.body.access_token)}`) : { status: 0, body: {} };
  const who = await ok(t.jonas!, 'GET', '/_matrix/client/v3/account/whoami');
  return [info.status === 200 && info.body.sub === userId('jonas'), `openid token ${o.status}, userinfo ${info.status}, whoami=${who.user_id}`];
});

await probe('Japanese names, channel names and filenames round-trip', 'Fix or escape on our side', async () => {
  const dn = await ok(t.sofia!, 'GET', `/_matrix/client/v3/profile/${enc(userId('tanaka'))}/displayname`);
  const room = await ok(t.sofia!, 'POST', '/_matrix/client/v3/createRoom', { name: '日本語チャンネル', preset: 'private_chat' });
  const name = await ok(t.sofia!, 'GET', `/_matrix/client/v3/rooms/${enc(room.room_id)}/state/m.room.name/`);
  const up = await fetch(`${BASE}/_matrix/media/v3/upload?filename=${enc('見積書.pdf')}`, { method: 'POST', headers: { Authorization: `Bearer ${t.sofia}`, 'Content-Type': 'application/pdf' }, body: '%PDF probe' }).then((x) => x.json());
  const [, mediaServer, mediaId] = (up.content_uri as string).match(/^mxc:\/\/([^/]+)\/(.+)$/)!;
  const dl = await fetch(`${BASE}/_matrix/client/v1/media/download/${mediaServer}/${mediaId}`, { headers: { Authorization: `Bearer ${t.sofia}` } });
  const cd = dl.headers.get('content-disposition') ?? '';
  const fileOk = cd.includes(enc('見積書.pdf')) || cd.includes('見積書.pdf');
  return [dn.displayname === '田中 由紀' && name.name === '日本語チャンネル' && fileOk, `display name ${dn.displayname}, channel ${name.name}, download ${dl.status} disposition: ${cd}`];
});

// ── Report ────────────────────────────────────────────────
const failedMust = rows.filter((x) => x.must && !x.pass);
const md = [
  '# Server probe results',
  '',
  `Server \`${SERVER}\` at ${BASE} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · generated by \`pnpm probe\``,
  '',
  failedMust.length ? `**Must-have failures: ${failedMust.map((x) => x.check).join('; ')}**` : '**All must-haves pass.**',
  '',
  '| Check | Result | Detail | Fallback if failed |',
  '|---|---|---|---|',
  ...rows.map((x) => `| ${x.must ? '**Must:** ' : ''}${x.check} | ${x.pass === null ? 'skipped' : x.pass ? 'pass' : '**fail**'} | ${x.detail.replace(/\|/g, '\\|')} | ${x.pass === false ? x.fallback : '—'} |`),
  '',
  'Manual rows (Element X): sign-in, client sees only its client space, threads/mentions readable, custom room type hidden — see M0-05.',
  '',
].join('\n');
const out = LOCAL ? 'probe-results.md' : `probe-results-${SERVER}.md`;
writeFileSync(new URL(`../docs/${out}`, import.meta.url), md);
console.log(`\n${rows.filter((x) => x.pass).length}/${rows.filter((x) => x.pass !== null).length} pass → docs/${out}`);
process.exit(failedMust.length ? 1 : 0);
