// E2 (channel rename and archive) against the seeded local server: pnpm dev:server && pnpm dev:seed && pnpm test:matrix
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from './index';
import { channel, mx, open, setupIntegration, until } from './integration.helpers';

setupIntegration();

const E = encodeURIComponent;
const stamp = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as Error);
const state = async (token: string, roomId: string, type: string) => (await mx(token, 'GET', `/_matrix/client/v3/rooms/${E(roomId)}/state/${type}/`)).body;
const post = (token: string, roomId: string, type: string) =>
  mx(token, 'PUT', `/_matrix/client/v3/rooms/${E(roomId)}/send/${type}/e2-${stamp()}`, type === 'm.room.message' ? { msgtype: 'm.text', body: 'hi' } : {});
const find = (s: WorkspaceSnapshot, id: string) => Object.values(s.channels).flat().find((c) => c.id === id);

type Account = Awaited<ReturnType<typeof open>>;
let ingrid: Account;
let jonas: Account;
let pasodrum: string;
const made: string[] = [];

beforeAll(async () => {
  [ingrid, jonas] = await Promise.all([open('ingrid'), open('jonas')]);
  pasodrum = ingrid.store.getSnapshot().spaces.find((s) => s.name === 'Pasodrum')!.id;
});

afterAll(async () => {
  for (const id of made) {
    await mx(ingrid.session.accessToken, 'PUT', `/_matrix/client/v3/rooms/${E(pasodrum)}/state/m.space.child/${E(id)}`, {});
    for (const a of [jonas, ingrid]) {
      await mx(a.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(id)}/leave`);
      await mx(a.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(id)}/forget`);
    }
  }
});

const make = async (owner: Account, joiner: Account) => {
  const id = await owner.store.createChannel({ spaceId: pasodrum, name: `e2-${stamp()}`, private: false });
  made.push(id);
  await joiner.store.joinChannel(id);
  await until(joiner.store, (s) => find(s, id));
  return id;
};

describe('E2: who may rename and archive', () => {
  it('Admins and the creator; not a Member who did not make it; never #general', async () => {
    const general = channel(ingrid.store.getSnapshot(), 'Pasodrum', 'general')!;
    expect(general.manageable).toBeFalsy();
    expect((await rejection(ingrid.store.renameChannel(general.id, `x-${stamp()}`)))?.message).toBe('not-allowed');
    expect((await rejection(ingrid.store.setChannelArchived(general.id, true)))?.message).toBe('not-allowed');

    const byIngrid = await make(ingrid, jonas);
    expect(find(ingrid.store.getSnapshot(), byIngrid)?.manageable).toBe(true);
    expect(find(jonas.store.getSnapshot(), byIngrid)?.manageable).toBeFalsy();
    expect((await rejection(jonas.store.setChannelArchived(byIngrid, true)))?.message).toBe('not-allowed');

    const byJonas = await make(jonas, ingrid);
    expect(await until(jonas.store, (s) => find(s, byJonas)?.manageable)).toBe(true);
    expect(await until(ingrid.store, (s) => find(s, byJonas)?.manageable)).toBe(true);
  });
});

describe('E2: rename and archive round trip', () => {
  it('renames (taken refused), archives read-only below Admin, unarchives back to D-27', async () => {
    const id = await make(ingrid, jonas);
    const token = ingrid.session.accessToken;
    const before = await state(token, id, 'm.room.power_levels');
    const from = find(ingrid.store.getSnapshot(), id)!.name;
    const to = `e2-${stamp()}`;

    expect((await rejection(ingrid.store.renameChannel(id, 'general')))?.message).toBe('name-taken');
    await ingrid.store.renameChannel(id, to);
    expect(await until(jonas.store, (s) => find(s, id)?.name === to)).toBe(true);

    await ingrid.store.setChannelArchived(id, true);
    const levels = await state(token, id, 'm.room.power_levels');
    expect(levels.events_default).toBe(50);
    expect(levels.events).toMatchObject({ 'm.reaction': 50, 'm.room.redaction': 50 });
    expect((await state(token, id, 'work.pasodrum.channel')).archived).toBe(true);
    expect(await until(jonas.store, (s) => find(s, id)?.archived)).toBe(true);
    expect((await post(jonas.session.accessToken, id, 'm.room.message')).status).toBe(403);
    expect((await ingrid.store.browseChannels(pasodrum)).find((c) => c.id === id)?.archived).toBe(true);

    ingrid.store.openTimeline(id);
    const rows = await until(ingrid.store, (s) => {
      const sys = (s.timelines[id]?.messages ?? []).filter((m) => m.system?.renamed || m.system?.archived);
      return sys.length >= 2 && sys;
    });
    expect(rows[0]!.system!.renamed).toMatchObject({ from, to, by: { id: ingrid.session.userId } });
    expect(rows[1]!.system!.archived).toMatchObject({ archived: true, by: { id: ingrid.session.userId } });

    await ingrid.store.setChannelArchived(id, false);
    expect(await state(token, id, 'm.room.power_levels')).toEqual(before);
    expect((await state(token, id, 'work.pasodrum.channel')).archived).toBeUndefined();
    expect(await until(jonas.store, (s) => find(s, id) && !find(s, id)!.archived)).toBe(true);
    expect((await post(jonas.session.accessToken, id, 'm.room.message')).status).toBe(200);
  });
});
