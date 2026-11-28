import { MatrixClient } from 'matrix-js-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkspaceStore } from './store';

// Loaded by a computed path so the web typecheck does not pull the invite service into this project.
const worldModule = ['..', '..', '..', '..', 'services', 'invite', 'test', 'preclaim-world.ts'].join('/');

type Party = { userId: string; token: string; deviceId: string };
type World = {
  base: string;
  admin: Party;
  staffB: Party;
  attacker: Party;
  rooms: { workspace: string; general: string; spaceA: string; chatA: string; spaceB: string; chatB: string };
  mails: { to: string }[];
  unknown: string[];
  inviteCreates: number;
  api: (token: string | null, method: string, path: string, body?: unknown) => Promise<{ status: number; body: { code?: string; userId?: string } }>;
  membership: (roomId: string, userId: string) => string | undefined;
  reads: (localpart: string, password: string, roomId: string) => Promise<boolean>;
  accountId: (email: string) => string;
  close: () => Promise<void>;
};
type WorldModule = {
  ATTACKER_PASSWORD: string;
  SERVER: string;
  createWorld: () => Promise<World>;
  preclaim: (world: World, email: string, claim: boolean) => Promise<{ created: { status: number; body: { code?: string } }; code?: string; claimed?: { status: number }; accountId: string }>;
};

const idsModule = ['..', '..', '..', '..', 'services', 'invite', 'src', 'ids.ts'].join('/');
const { ATTACKER_PASSWORD, SERVER, createWorld, preclaim } = await (import(worldModule) as Promise<WorldModule>);
const { localpartFor } = await (import(idsModule) as Promise<{ localpartFor: (email: string, serverName: string) => string }>);

// Each add-people path that turns an invite-service "exists" (or a 201 for an account
// this service already created) into a Matrix invite. The account Staff pre-claimed
// must not land in a space they were never granted, and must not be able to read it.
const REAL = 'bob@client.test';

let world: World | undefined;
const stores: { signOut: () => Promise<void> }[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(stores.splice(0).map((store) => Promise.race([
    store.signOut().catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ])));
  await world?.close();
  world = undefined;
});

function open(party: Party) {
  vi.stubGlobal('location', { origin: world!.base });
  vi.spyOn(MatrixClient.prototype, 'initRustCrypto').mockResolvedValue(undefined);
  const store = createWorkspaceStore({
    baseUrl: world!.base,
    userId: party.userId,
    deviceId: party.deviceId,
    accessToken: party.token,
  });
  stores.push(store);
  return store;
}

async function notIn(roomIds: string[], accountId: string, localpart: string) {
  expect(world!.inviteCreates, world!.unknown.join(' | ')).toBeGreaterThan(0);
  for (const roomId of roomIds) {
    const membership = world!.membership(roomId, accountId);
    expect(membership, `${roomId} ${accountId}`).not.toBe('invite');
    expect(membership, `${roomId} ${accountId}`).not.toBe('join');
  }
  expect(await world!.reads(localpart, ATTACKER_PASSWORD, roomIds[0]!)).toBe(false);
}

describe('pre-claimed email is not added as that person', () => {
  it('addPeople client on another client space', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, true);
    const before = world.inviteCreates;
    const store = open(world.staffB);
    const result = await store.addPeople(world.rooms.spaceB, { type: 'client', userIds: [], emails: [REAL] });
    expect(world.inviteCreates, JSON.stringify({ result, unknown: world.unknown })).toBeGreaterThan(before);
    await notIn([world.rooms.spaceB, world.rooms.chatB], first.accountId, localpartFor(REAL, SERVER));
  });

  it('addPeople on a channel of another client space', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, true);
    const before = world.inviteCreates;
    const store = open(world.staffB);
    await store.addPeople(world.rooms.chatB, { type: 'channel', userIds: [], emails: [REAL] });
    expect(world.inviteCreates).toBeGreaterThan(before);
    await notIn([world.rooms.spaceB, world.rooms.chatB], first.accountId, localpartFor(REAL, SERVER));
  });

  it('createClientSpace does not add a pre-claimed account', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, true);
    const before = world.inviteCreates;
    const store = open(world.admin);
    const made = await store.createClientSpace({ name: 'New Client', colour: '#335544', channels: ['general'], team: [], clientEmails: [REAL] });
    expect(world.inviteCreates).toBeGreaterThan(before);
    await notIn([made.spaceId, made.channelId], first.accountId, localpartFor(REAL, SERVER));
  });

  it('addPeople staff puts the pre-claimed account in the workspace', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, true);
    const before = world.inviteCreates;
    const store = open(world.admin);
    await store.addPeople(world.rooms.workspace, { type: 'staff', userIds: [], emails: [REAL], spaces: [] });
    expect(world.inviteCreates).toBeGreaterThan(before);
    await notIn([world.rooms.workspace, world.rooms.general], first.accountId, localpartFor(REAL, SERVER));
  });

  it('addPeople external puts the pre-claimed account on a workspace channel', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, true);
    const before = world.inviteCreates;
    const store = open(world.admin);
    await store.addPeople(world.rooms.workspace, { type: 'external', userIds: [], emails: [REAL], roles: [], channels: [world.rooms.general] });
    expect(world.inviteCreates).toBeGreaterThan(before);
    await notIn([world.rooms.general], first.accountId, localpartFor(REAL, SERVER));
  });

  it('addPeople on a workspace channel puts the pre-claimed account in that channel', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, true);
    const before = world.inviteCreates;
    const store = open(world.admin);
    await store.addPeople(world.rooms.general, { type: 'channel', userIds: [], emails: [REAL] });
    expect(world.inviteCreates).toBeGreaterThan(before);
    await notIn([world.rooms.general], first.accountId, localpartFor(REAL, SERVER));
  });

  it('an unclaimed code the inviter still holds is not added when an Admin who manages that invite adds the email', async () => {
    world = await createWorld();
    const first = await preclaim(world, REAL, false);
    expect(first.created.status).toBe(201);
    const before = world.inviteCreates;
    const store = open(world.admin);
    await store.addPeople(world.rooms.spaceB, { type: 'client', userIds: [], emails: [REAL] });
    expect(world.inviteCreates).toBeGreaterThan(before);
    if (first.code) await world.api(null, 'POST', `/${first.code}/claim`, { name: 'Bob', password: ATTACKER_PASSWORD });
    await notIn([world.rooms.spaceB, world.rooms.chatB], first.accountId, localpartFor(REAL, SERVER));
  });

  it('a server-domain address that collides with the external email is not added as that person', async () => {
    world = await createWorld();
    const collision = `bob_client.test@${SERVER}`;
    const first = await preclaim(world, collision, true);
    const before = world.inviteCreates;
    const store = open(world.staffB);
    await store.addPeople(world.rooms.spaceB, { type: 'client', userIds: [], emails: [REAL] });
    expect(world.inviteCreates).toBeGreaterThan(before);
    await notIn([world.rooms.spaceB, world.rooms.chatB], first.accountId, localpartFor(collision, SERVER));
    expect(localpartFor(collision, SERVER)).not.toBe(localpartFor(REAL, SERVER));
  });
});
