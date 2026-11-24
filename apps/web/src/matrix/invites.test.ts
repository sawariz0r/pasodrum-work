import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claimInvite, createInvite, InviteError, listInvites, normalizeEmail, previewInvite, resendInvite, revokeInvite } from './invites';

const calls: { url: string; init: RequestInit }[] = [];
let reply: { status: number; body?: unknown; raw?: string } = { status: 200 };

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal('location', { origin: 'https://pasodrum.work' });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(reply.raw ?? (reply.body === undefined ? null : JSON.stringify(reply.body)), { status: reply.status });
  });
});
afterEach(() => vi.unstubAllGlobals());

const rejection = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e as InviteError);

describe('invite service client', () => {
  it('previews a code', async () => {
    reply = { status: 200, body: { email: 'henrik@nordlys.no', spaceName: 'Nordlys', spaceKind: 'client', inviter: 'Ingrid Holm', team: [{ id: '@ingrid:x', name: 'Ingrid Holm' }, { id: '@jonas:x' }], state: 'open' } };
    expect(await previewInvite('a b')).toEqual({
      email: 'henrik@nordlys.no',
      spaceName: 'Nordlys',
      spaceKind: 'client',
      inviter: 'Ingrid Holm',
      team: [{ id: '@ingrid:x', name: 'Ingrid Holm' }, { id: '@jonas:x', name: '@jonas:x' }],
      state: 'open',
    });
    expect(calls[0]!.url).toBe('https://pasodrum.work/api/invites/a%20b');
    expect(calls[0]!.init.method).toBe('GET');
  });

  it('maps link states: revoked reads as used, unknown as expired', async () => {
    const states: Record<string, string> = {};
    for (const state of ['open', 'used', 'expired', 'revoked', 'weird', undefined]) {
      reply = { status: 200, body: { email: 'a@b.no', spaceName: 'S', state } };
      states[String(state)] = (await previewInvite('x')).state;
    }
    expect(states).toEqual({ open: 'open', used: 'used', expired: 'expired', revoked: 'used', weird: 'expired', undefined: 'expired' });
  });

  it('a proxy page or empty body instead of the service is unreachable; a dead network too', async () => {
    reply = { status: 200 };
    expect((await rejection(previewInvite('x')))?.message).toBe('unreachable');
    reply = { status: 502, raw: '<html>Bad gateway</html>' };
    expect((await rejection(previewInvite('x')))?.message).toBe('other');
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    expect((await rejection(previewInvite('x')))?.message).toBe('unreachable');
  });

  it('claims with name and password and resolves to the identifier; used/expired reject', async () => {
    reply = { status: 200, body: { userId: '@henrik_nordlys.no:x', identifier: 'henrik@nordlys.no' } };
    expect(await claimInvite('c', 'Henrik Dahl', 'secret-pass')).toBe('henrik@nordlys.no');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name: 'Henrik Dahl', password: 'secret-pass' });
    expect(calls[0]!.url).toBe('https://pasodrum.work/api/invites/c/claim');
    await claimInvite('c', 'Henrik Dahl', 'secret-pass', 'ja');
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ name: 'Henrik Dahl', password: 'secret-pass', language: 'ja' });
    reply = { status: 410, body: { error: 'used' } };
    expect((await rejection(claimInvite('c', 'H', 'p')))?.message).toBe('used');
    reply = { status: 410, body: {} };
    expect((await rejection(claimInvite('c', 'H', 'p')))?.message).toBe('expired');
  });

  it('creates with the bearer token; 409 carries the existing account', async () => {
    reply = { status: 201, body: { code: 'k', userId: '@new_x.no:x', link: 'https://pasodrum.work/join/k' } };
    const invite = { email: 'new@x.no', role: 'external' as const, spaceId: '!s', channelIds: ['!c'], locale: 'ja' as const };
    expect(await createInvite('tok', invite)).toEqual({ code: 'k', userId: '@new_x.no:x', link: 'https://pasodrum.work/join/k' });
    expect(calls[0]!.init.headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual(invite);
    reply = { status: 409, body: { error: 'exists', userId: '@jonas:x' } };
    const e = await rejection(createInvite('tok', invite));
    expect([e?.code, e?.userId]).toEqual(['exists', '@jonas:x']);
    for (const [status, code] of [[400, 'invalid-email'], [403, 'not-allowed'], [429, 'rate-limited']] as const) {
      reply = { status, body: {} };
      expect((await rejection(createInvite('tok', invite)))?.code).toBe(code);
    }
  });

  it('lists pending invites for a room; resend and revoke', async () => {
    reply = { status: 200, body: [{ code: 'k', email: 'a@b.no', role: 'client', createdTs: 5, link: 'L' }, { code: 'j', email: 'c@d.no', role: 'weird' }, { nope: true }] };
    expect(await listInvites('tok', '!c:x')).toEqual([
      { code: 'k', email: 'a@b.no', role: 'client', createdTs: 5, link: 'L' },
      { code: 'j', email: 'c@d.no', role: 'external', createdTs: 0 },
    ]);
    expect(calls[0]!.url).toBe('https://pasodrum.work/api/invites?roomId=!c%3Ax');
    reply = { status: 204 };
    await resendInvite('tok', 'k');
    await revokeInvite('tok', 'k');
    expect(calls.slice(1).map((c) => [c.init.method, c.url])).toEqual([
      ['POST', 'https://pasodrum.work/api/invites/k/resend'],
      ['DELETE', 'https://pasodrum.work/api/invites/k'],
    ]);
  });
});

describe('normalizeEmail', () => {
  it('matches the invite service rule', () => {
    expect(normalizeEmail('  Henrik@Nordlys.NO ')).toBe('henrik@nordlys.no');
    for (const bad of ['', 'henrik', 'henrik@', '@nordlys.no', 'hen rik@nordlys.no', 'h@nordlys', 'not an email']) expect(normalizeEmail(bad)).toBeNull();
  });
});
