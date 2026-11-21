// M7 pins against the seeded local server: pnpm dev:server && pnpm dev:seed && pnpm test:matrix
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from './index';
import { mx, open, sendRaw, setupIntegration, until } from './integration.helpers';

setupIntegration();

const E = encodeURIComponent;
const find = (s: WorkspaceSnapshot, id: string) => Object.values(s.channels).flat().find((c) => c.id === id);

type Account = Awaited<ReturnType<typeof open>>;
let ingrid: Account;
let jonas: Account;
let channelId = '';

beforeAll(async () => {
  [ingrid, jonas] = await Promise.all([open('ingrid'), open('jonas')]);
  const pasodrum = ingrid.store.getSnapshot().spaces.find((s) => s.name === 'Pasodrum')!.id;
  channelId = await ingrid.store.createChannel({ spaceId: pasodrum, name: `m7-${Date.now().toString(36)}`, private: false });
  await jonas.store.joinChannel(channelId);
});

afterAll(async () => {
  const pasodrum = ingrid.store.getSnapshot().spaces.find((s) => s.name === 'Pasodrum')!.id;
  await mx(ingrid.session.accessToken, 'PUT', `/_matrix/client/v3/rooms/${E(pasodrum)}/state/m.space.child/${E(channelId)}`, {});
  for (const a of [jonas, ingrid]) {
    await mx(a.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(channelId)}/leave`);
    await mx(a.session.accessToken, 'POST', `/_matrix/client/v3/rooms/${E(channelId)}/forget`);
  }
});

describe('M7: anyone in a channel can pin (D-33)', () => {
  it('a Member (level 0) pins and unpins; everyone sees it', async () => {
    expect(await until(jonas.store, (s) => find(s, channelId)?.canPin)).toBe(true);
    const first = await sendRaw(jonas.session.accessToken, channelId, { msgtype: 'm.text', body: 'first' });
    const second = await sendRaw(ingrid.session.accessToken, channelId, { msgtype: 'm.text', body: 'second' });

    await jonas.store.pin(channelId, first);
    await jonas.store.pin(channelId, second);
    expect((await jonas.store.pins(channelId)).map((m) => [m.id, m.pinned])).toEqual([[second, true], [first, true]]);

    ingrid.store.openTimeline(channelId);
    expect(await until(ingrid.store, (s) => s.timelines[channelId]?.messages.find((m) => m.id === first)?.pinned)).toBe(true);

    await jonas.store.unpin(channelId, first);
    expect(await until(ingrid.store, (s) => s.timelines[channelId]?.messages.find((m) => m.id === first)?.pinned !== true)).toBe(true);
    expect((await ingrid.store.pins(channelId)).map((m) => m.id)).toEqual([second]);
  });
});
