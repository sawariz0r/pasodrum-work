// M2 (D-22) against the seeded local server: pnpm dev:server && pnpm dev:seed && pnpm test:matrix
import { beforeAll, describe, expect, it } from 'vitest';
import type { Message, WorkspaceSnapshot, WorkspaceStore } from './index';
import { channel, mx, open, sendRaw, setupIntegration, until } from './integration.helpers';

setupIntegration();

const JONAS = '@jonas:pasodrum.localhost';
const INGRID = '@ingrid:pasodrum.localhost';
const HTML = 'org.matrix.custom.html';
// 2×1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8DwnwEIGAAZ6wL+GdTwGQAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

const find = (store: WorkspaceStore, roomId: string, pick: (m: Message) => boolean, ms?: number) =>
  until(store, (s) => s.timelines[roomId]?.messages.find(pick), ms).catch((e: Error) => {
    throw new Error(`${e.message.slice(0, 20)}; last messages: ${JSON.stringify(store.getSnapshot().timelines[roomId]?.messages.slice(-3))}`);
  });
const unique = (label: string) => `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const rawEvent = async (token: string, roomId: string, eventId: string) =>
  (await mx(token, 'GET', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/event/${encodeURIComponent(eventId)}`)).body.content as Record<string, unknown>;

describe('rich messages', () => {
  let jonas: Awaited<ReturnType<typeof open>>;
  let ingrid: Awaited<ReturnType<typeof open>>;
  let general: string;

  beforeAll(async () => {
    [jonas, ingrid] = await Promise.all([open('jonas'), open('ingrid')]);
    general = channel(jonas.store.getSnapshot(), 'Pasodrum', 'general')!.id;
    for (const { store } of [jonas, ingrid]) {
      store.openTimeline(general);
      await until(store, (s) => s.timelines[general]?.initialLoading === false);
    }
  });

  it('sends formatting and a mention; the mentioned person sees mentionsMe', async () => {
    const body = unique('Hi Ingrid, bold');
    jonas.store.send(general, {
      body,
      html: `Hi <a href="https://matrix.to/#/${INGRID}">Ingrid</a>, <strong>bold</strong> ${body}<script>alert(1)</script>`,
      mentions: [INGRID],
    });
    const got = await find(ingrid.store, general, (m) => m.body === body && m.status === 'sent');
    expect(got).toMatchObject({ kind: 'text', mentionsMe: true, sender: { id: JONAS } });
    expect(got.html).toBe(`Hi <a href="https://matrix.to/#/${INGRID}" data-mention="${INGRID}">Ingrid</a>, <strong>bold</strong> ${body}`);
    const mine = await find(jonas.store, general, (m) => m.id === got.id);
    expect(mine.mentionsMe).toBeUndefined();
    expect(await rawEvent(jonas.session.accessToken, general, got.id)).toMatchObject({ format: HTML, 'm.mentions': { user_ids: [INGRID] } });
  });

  it('sanitizes what other apps send; a pill alone counts as a mention', async () => {
    const body = unique('from another app');
    const id = await sendRaw(jonas.session.accessToken, general, {
      msgtype: 'm.notice',
      body,
      format: HTML,
      formatted_body: `<h2>Title</h2><a href="javascript:alert(1)">x</a> <span data-mx-color="#f00">red</span> <a href="https://matrix.to/#/${INGRID}">Ingrid</a>`,
    });
    const got = await find(ingrid.store, general, (m) => m.id === id);
    expect(got).toMatchObject({ kind: 'notice', body, mentionsMe: true });
    expect(got.html).toBe(`<p><strong>Title</strong></p>x red <a href="https://matrix.to/#/${INGRID}" data-mention="${INGRID}">Ingrid</a>`);

    const emote = await sendRaw(jonas.session.accessToken, general, { msgtype: 'm.emote', body: 'waves' });
    const unknown = await sendRaw(jonas.session.accessToken, general, { msgtype: 'm.location', body: 'Oslo', geo_uri: 'geo:59.9,10.7' });
    const poll = await sendRaw(jonas.session.accessToken, general, { 'org.matrix.msc1767.text': 'Lunch?\n1. Yes', 'org.matrix.msc3381.poll.start': {} }, 'org.matrix.msc3381.poll.start');
    expect(await find(ingrid.store, general, (m) => m.id === emote)).toMatchObject({ kind: 'emote', body: 'waves' });
    expect(await find(ingrid.store, general, (m) => m.id === unknown)).toMatchObject({ kind: 'unsupported', body: 'Oslo' });
    expect(await find(ingrid.store, general, (m) => m.id === poll)).toMatchObject({ kind: 'unsupported', body: 'Lunch?\n1. Yes' });
  });

  it('reads an Element-style reply and sends one with the fallback', async () => {
    const original = unique('original');
    jonas.store.sendText(general, original);
    const orig = await find(ingrid.store, general, (m) => m.body === original && m.id.startsWith('$'));

    const id = await sendRaw(ingrid.session.accessToken, general, {
      msgtype: 'm.text',
      body: `> <${JONAS}> ${original}\n\nAgreed`,
      format: HTML,
      formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/${general}/${orig.id}">In reply to</a> <a href="https://matrix.to/#/${JONAS}">${JONAS}</a><br>${original}</blockquote></mx-reply><em>Agreed</em>`,
      'm.relates_to': { 'm.in_reply_to': { event_id: orig.id } },
    });
    const reply = await find(jonas.store, general, (m) => m.id === id);
    expect(reply).toMatchObject({ body: 'Agreed', html: '<em>Agreed</em>', replyTo: { id: orig.id, sender: { id: JONAS, name: 'Jonas Berg' }, body: original, found: true } });
    expect(reply.mentionsMe).toBeUndefined();

    jonas.store.send(general, { body: 'Thanks', mentions: [], replyTo: id });
    const mine = await find(ingrid.store, general, (m) => m.body === 'Thanks' && m.replyTo?.id === id && m.id.startsWith('$'));
    expect(mine).toMatchObject({ mentionsMe: true, replyTo: { sender: { id: INGRID }, body: 'Agreed', found: true } });
    const content = await rawEvent(jonas.session.accessToken, general, mine.id);
    expect(content.body).toBe(`> <${INGRID}> Agreed\n\nThanks`);
    expect(content.formatted_body).toMatch(/^<mx-reply><blockquote>.*<em>Agreed<\/em><\/blockquote><\/mx-reply>Thanks$/);
    expect(content['m.relates_to']).toEqual({ 'm.in_reply_to': { event_id: id } });
    expect(content['m.mentions']).toEqual({ user_ids: [INGRID] });

    const missing = await sendRaw(ingrid.session.accessToken, general, {
      msgtype: 'm.text',
      body: `> <${JONAS}> something long gone\n\nStill true`,
      'm.relates_to': { 'm.in_reply_to': { event_id: '$missing-event' } },
    });
    expect(await find(jonas.store, general, (m) => m.id === missing)).toMatchObject({
      body: 'Still true',
      replyTo: { id: '$missing-event', sender: { id: JONAS }, body: 'something long gone', found: false },
    });
  });

  it('fetches a reply original that is not loaded, once', async () => {
    const { body } = await mx(jonas.session.accessToken, 'POST', '/_matrix/client/v3/createRoom', { preset: 'private_chat', name: 'reply fetch test' });
    const roomId = body.room_id as string;
    const first = await sendRaw(jonas.session.accessToken, roomId, { msgtype: 'm.text', body: 'way back' });
    for (let n = 0; n < 35; n++) await sendRaw(jonas.session.accessToken, roomId, { msgtype: 'm.text', body: `filler ${n}` });
    const reply = await sendRaw(jonas.session.accessToken, roomId, { msgtype: 'm.text', body: 'about that', 'm.relates_to': { 'm.in_reply_to': { event_id: first } } });
    // A fresh device starts from the latest page, so the original is not loaded.
    const fresh = await open('jonas');
    fresh.store.openTimeline(roomId);
    const got = await find(fresh.store, roomId, (m) => m.id === reply && m.replyTo?.body === 'way back');
    expect(got.replyTo).toEqual({ id: first, sender: { id: JONAS, name: 'Jonas Berg' }, body: 'way back', found: false });
    await mx(jonas.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/leave`);
  });

  it('aggregates reactions from two people; unreact redacts mine', async () => {
    const text = unique('react to me');
    jonas.store.sendText(general, text);
    const msg = await find(jonas.store, general, (m) => m.body === text && m.id.startsWith('$'));
    await find(ingrid.store, general, (m) => m.id === msg.id);

    jonas.store.react(general, msg.id, '👍');
    jonas.store.react(general, msg.id, '👍');
    ingrid.store.react(general, msg.id, '👍');
    await sendRaw(ingrid.session.accessToken, general, { 'm.relates_to': { rel_type: 'm.annotation', event_id: msg.id, key: '🎉' } }, 'm.reaction');
    const thumbs = (m: Message) => m.reactions?.find((r) => r.key === '👍');
    const both = await find(jonas.store, general, (m) => m.id === msg.id && thumbs(m)?.count === 2 && m.reactions!.length === 2);
    expect(thumbs(both)).toEqual({ key: '👍', count: 2, mine: true, senders: expect.arrayContaining([{ id: JONAS, name: 'Jonas Berg' }, { id: INGRID, name: 'Ingrid Holm' }]) });
    expect(both.reactions!.find((r) => r.key === '🎉')).toEqual({ key: '🎉', count: 1, mine: false, senders: [{ id: INGRID, name: 'Ingrid Holm' }] });

    ingrid.store.unreact(general, msg.id, '👍');
    const after = await find(jonas.store, general, (m) => m.id === msg.id && thumbs(m)?.count === 1);
    expect(thumbs(after)).toEqual({ key: '👍', count: 1, mine: true, senders: [{ id: JONAS, name: 'Jonas Berg' }] });
    jonas.store.unreact(general, msg.id, '👍');
    const gone = await find(ingrid.store, general, (m) => m.id === msg.id && m.reactions?.length === 1);
    expect(gone.reactions![0]!.key).toBe('🎉');
  });

  it('edits with formatting and deletes', async () => {
    const text = unique('to edit');
    jonas.store.sendText(general, text);
    const msg = await find(jonas.store, general, (m) => m.body === text && m.id.startsWith('$'));
    jonas.store.edit(general, msg.id, { body: `${text} fixed`, html: `${text} <b>fixed</b>`, mentions: [INGRID] });
    const edited = await find(ingrid.store, general, (m) => m.id === msg.id && m.edited === true);
    expect(edited).toMatchObject({ body: `${text} fixed`, html: `${text} <b>fixed</b>`, mentionsMe: true });

    jonas.store.remove(general, msg.id);
    const deleted = await find(ingrid.store, general, (m) => m.id === msg.id && m.kind === 'deleted');
    expect(deleted.body).toBe('');
    expect(deleted.html).toBeUndefined();
  });

  it('uploads an image with progress and sends it with info; mediaUrl hands out a cached blob URL', async () => {
    globalThis.createImageBitmap = (async () => ({ width: 2, height: 1, close() {} })) as unknown as typeof createImageBitmap;
    jonas.store.attach(general, [new File([PNG], 'dot.png', { type: 'image/png' })]);
    const [uploading] = jonas.store.getSnapshot().uploads[general] ?? (await until(jonas.store, (s) => s.uploads[general]));
    expect(uploading).toMatchObject({ name: 'dot.png', size: PNG.length, mimetype: 'image/png', progress: 0, status: 'uploading' });
    expect(uploading!.previewUrl).toMatch(/^blob:/);
    const done = await until(jonas.store, (s) => s.uploads[general]?.find((u) => u.status === 'done'));
    expect(done.progress).toBe(1);

    jonas.store.send(general, { body: '', mentions: [] });
    await until(jonas.store, (s) => !s.uploads[general]);
    const got = await find(ingrid.store, general, (m) => m.kind === 'image' && m.media?.name === 'dot.png' && m.sender.id === JONAS && m.ts > Date.now() - 60_000);
    expect(got.body).toBe('');
    expect(got.media).toMatchObject({ name: 'dot.png', mimetype: 'image/png', size: PNG.length, width: 2, height: 1 });
    expect(got.media!.ref).toMatch(/^mxc:\/\//);

    const url = await ingrid.store.mediaUrl(got.media!.ref);
    expect(url).toMatch(/^blob:/);
    expect(await ingrid.store.mediaUrl(got.media!.ref)).toBe(url);
    const thumb = await ingrid.store.mediaUrl(got.media!.ref, { thumbnail: true });
    expect(thumb).toMatch(/^blob:/);
    expect(thumb).not.toBe(url);
    await expect(ingrid.store.mediaUrl('mxc://pasodrum.localhost/nope')).rejects.toThrow();
  });

  it('marks too-large and failed uploads; retry and remove', async () => {
    const tray = (s: WorkspaceSnapshot) => s.uploads[general] ?? [];
    jonas.store.attach(general, [new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'huge.bin')]);
    const big = await until(jonas.store, (s) => tray(s).find((u) => u.name === 'huge.bin'));
    expect(big).toMatchObject({ status: 'too-large', mimetype: 'application/octet-stream' });
    jonas.store.removeUpload(general, big.id);
    await until(jonas.store, (s) => !tray(s).some((u) => u.id === big.id));

    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/upload') ? Promise.reject(new TypeError('network down')) : realFetch(input, init)) as typeof fetch;
    jonas.store.attach(general, [new File(['hello'], 'note.txt', { type: 'text/plain' })]);
    const failed = await until(jonas.store, (s) => tray(s).find((u) => u.name === 'note.txt' && u.status === 'failed'));
    globalThis.fetch = realFetch;
    jonas.store.retryUpload(general, failed.id);
    await until(jonas.store, (s) => tray(s).find((u) => u.id === failed.id && u.status === 'done'));
    jonas.store.removeUpload(general, failed.id);
    await until(jonas.store, (s) => !s.uploads[general]);
  });

  it('shows typing to the other person only', async () => {
    jonas.store.setTyping(general, true);
    const typing = await until(ingrid.store, (s) => s.typing[general]);
    expect(typing).toEqual([{ id: JONAS, name: 'Jonas Berg' }]);
    expect(jonas.store.getSnapshot().typing[general]).toBeUndefined();
    jonas.store.setTyping(general, false);
    await until(ingrid.store, (s) => !s.typing[general]);
  });

  it('lists joined members and builds message links', async () => {
    let people = ingrid.store.members(general);
    for (let i = 0; i < 50 && people.length < 4; i++) {
      await new Promise((r) => setTimeout(r, 100));
      people = ingrid.store.members(general);
    }
    expect(people.map((p) => p.name)).toEqual(expect.arrayContaining(['Jonas Berg', 'Ingrid Holm', 'Sofia Olsen', '田中 由紀']));
    expect(people).toContainEqual({ id: JONAS, name: 'Jonas Berg' });
    globalThis.location = { origin: 'https://pasodrum.work' } as Location;
    expect(ingrid.store.messageLink('!a:b', '$c')).toBe('https://pasodrum.work/m/!a%3Ab/%24c');
  });

  it('summarizes joins and leaves between messages, hiding profile changes', async () => {
    const { body } = await mx(jonas.session.accessToken, 'POST', '/_matrix/client/v3/createRoom', { preset: 'public_chat', name: 'system rows test' });
    const roomId = body.room_id as string;
    const path = `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}`;
    await sendRaw(jonas.session.accessToken, roomId, { msgtype: 'm.text', body: 'one' });
    await mx(ingrid.session.accessToken, 'POST', `/_matrix/client/v3/join/${encodeURIComponent(roomId)}`);
    await mx(ingrid.session.accessToken, 'PUT', `${path}/state/m.room.member/${encodeURIComponent(INGRID)}`, { membership: 'join', displayname: 'Ingrid H.' });
    await sendRaw(jonas.session.accessToken, roomId, { msgtype: 'm.text', body: 'two' });
    await mx(ingrid.session.accessToken, 'PUT', `${path}/state/m.room.member/${encodeURIComponent(INGRID)}`, { membership: 'join', displayname: 'Ingrid Holm' });
    await sendRaw(jonas.session.accessToken, roomId, { msgtype: 'm.text', body: 'three' });
    await mx(ingrid.session.accessToken, 'POST', `${path}/leave`);
    await sendRaw(jonas.session.accessToken, roomId, { msgtype: 'm.text', body: 'four' });

    jonas.store.openTimeline(roomId);
    const t = await until(jonas.store, (s) => s.timelines[roomId]?.messages.at(-1)?.body === 'four' && s.timelines[roomId]);
    const shape = t.messages.map((m) => (m.kind === 'system' ? { joined: m.system!.joined.map((p) => p.id), left: m.system!.left.map((p) => p.id) } : m.body));
    expect(shape).toEqual([{ joined: [JONAS], left: [] }, 'one', { joined: [INGRID], left: [] }, 'two', 'three', { joined: [], left: [INGRID] }, 'four']);
    expect(t.messages[0]!.body).toBe('');
    await mx(jonas.session.accessToken, 'POST', `${path}/leave`);
  });
});
