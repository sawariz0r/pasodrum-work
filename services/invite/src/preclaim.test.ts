import { afterEach, describe, expect, it } from 'vitest';
import { localpartFor } from './ids.ts';
import { ATTACKER_PASSWORD, createWorld, preclaim, SERVER, type World } from '../test/preclaim-world.ts';

// A staff member of client space A must not be able to bind someone else's email to an
// account they control, so a later invite of that email in another space adds them.
const REAL = 'bob@client.test';
const COLLISION = `bob_client.test@${SERVER}`;

let world: World | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

function shown(body: { error?: string; userId?: string; emailed?: boolean; code?: string } | undefined) {
  return JSON.stringify({ error: body?.error, userId: body?.userId, emailed: body?.emailed, hasCode: Boolean(body?.code) });
}

async function inviteAgain(by: 'staffB' | 'admin', email: string) {
  const party = by === 'admin' ? world!.admin : world!.staffB;
  const space = by === 'admin' ? world!.rooms.spaceA : world!.rooms.spaceB;
  // staff B invites into B (they are not on A). Admin invites into A, which they manage.
  const spaceId = by === 'staffB' ? world!.rooms.spaceB : space;
  const channel = by === 'staffB' ? world!.rooms.chatB : world!.rooms.chatA;
  return world!.api(party.token, 'POST', '', { email, role: 'client', spaceId, channelIds: [channel], locale: 'en' });
}

describe('account pre-claim', () => {
  it('lets Staff of a client space create a client invite there', async () => {
    world = await createWorld();
    const created = await world.api(world.attacker.token, 'POST', '', {
      email: 'ada@client.test', role: 'client', spaceId: world.rooms.spaceA, channelIds: [world.rooms.chatA], locale: 'en',
    });
    expect(created.status, shown(created.body)).toBe(201);
    expect(world.membership(world.rooms.spaceB, world.attacker.userId)).toBeUndefined();
  });

  it('does not hand a later invite the account a Staff member claimed with only the link', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, true);
    expect(first.created.status, shown(first.created.body)).toBe(201);
    const second = await inviteAgain('staffB', REAL);
    expect(second.body?.userId, shown(second.body)).toBeUndefined();
    expect(await world.reads(localpartFor(REAL, SERVER), ATTACKER_PASSWORD, world.rooms.chatB)).toBe(false);
    expect(world.membership(world.rooms.chatB, first.accountId)).not.toBe('invite');
    expect(world.membership(world.rooms.chatB, first.accountId)).not.toBe('join');
    expect(world.membership(world.rooms.spaceB, first.accountId)).not.toBe('invite');
    expect(world.membership(world.rooms.spaceB, first.accountId)).not.toBe('join');
  });

  it('does not hand out an unclaimed account the inviter still holds the code for', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, false);
    expect(first.created.status, shown(first.created.body)).toBe(201);
    expect(first.code).toBeTruthy();
    const second = await inviteAgain('staffB', REAL);
    expect(second.body?.userId, shown(second.body)).toBeUndefined();
    if (first.code) await world.api(null, 'POST', `/${first.code}/claim`, { name: 'Bob', password: ATTACKER_PASSWORD });
    expect(await world.reads(localpartFor(REAL, SERVER), ATTACKER_PASSWORD, world.rooms.chatB)).toBe(false);
    expect(world.membership(world.rooms.spaceB, first.accountId)).not.toBe('invite');
    expect(world.membership(world.rooms.spaceB, first.accountId)).not.toBe('join');
  });

  it('does not treat a server-domain localpart as the same person as the external address', async () => {
    world = await createWorld();
    const first = await preclaim(world, COLLISION, true);
    expect(world.mails.filter((mail) => mail.to === REAL)).toEqual([]);
    const second = await inviteAgain('staffB', REAL);
    expect(second.body?.userId, shown(second.body)).not.toBe(first.accountId);
    expect(localpartFor(COLLISION, SERVER)).not.toBe(localpartFor(REAL, SERVER));
    expect(await world.reads(localpartFor(COLLISION, SERVER), ATTACKER_PASSWORD, world.rooms.chatB)).toBe(false);
    expect(world.membership(world.rooms.chatB, first.accountId)).not.toBe('join');
    expect(world.membership(world.rooms.spaceB, first.accountId)).not.toBe('invite');
  });
});
