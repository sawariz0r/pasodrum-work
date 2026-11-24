import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderInvite, tileColor } from './email.ts';
import { isCode, localpartFor, newCode, newPassword, normalizeEmail } from './ids.ts';
import { mailer, parseAddress } from './mail.ts';
import { canDelete, canInvite, canManage, isGenuine, normalizeRole, rateLimiter, spaceInfo, stateOf, teamOf, type StateEvent } from './rules.ts';
import { keyFrom, seal, unseal } from './secret.ts';

describe('ids', () => {
  it('derives deterministic IDs (D-07)', () => {
    expect(localpartFor('henrik@nordlys.no', 'pasodrum.work')).toBe('henrik_nordlys.no');
    expect(localpartFor('oscar@pasodrum.work', 'pasodrum.work')).toBe('oscar');
    expect(localpartFor('a.b-c@sub.example.com', 'pasodrum.work')).toBe('a.b-c_sub.example.com');
  });

  it('normalizes and validates emails', () => {
    expect(normalizeEmail('  Henrik@Nordlys.NO ')).toBe('henrik@nordlys.no');
    for (const bad of ['', 'henrik', 'henrik@', '@nordlys.no', 'hen rik@nordlys.no', 'h@nordlys', 'h"x@nordlys.no', 'h@-x.no', 42, null]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });

  it('makes random URL-safe codes of 144 bits', () => {
    const codes = new Set(Array.from({ length: 1000 }, newCode));
    expect(codes.size).toBe(1000);
    for (const c of codes) expect(isCode(c)).toBe(true);
    expect(Buffer.from(newCode(), 'base64url').length).toBe(18);
    expect(isCode('../../etc/passwd')).toBe(false);
    expect(newPassword()).not.toBe(newPassword());
  });
});

describe('secret', () => {
  const key = keyFrom('x'.repeat(64));

  it('round-trips with AES-GCM and a fresh IV', () => {
    const a = seal(key, 'temp-password');
    expect(a).not.toBe(seal(key, 'temp-password'));
    expect(a).not.toContain('temp-password');
    expect(unseal(key, a)).toBe('temp-password');
  });

  it('rejects a wrong key or tampering', () => {
    const sealed = seal(key, 'temp-password');
    expect(() => unseal(keyFrom('y'.repeat(64)), sealed)).toThrow();
    const [iv, tag, ct] = sealed.split('.');
    const flipped = Buffer.from(ct!, 'base64url');
    flipped[0]! ^= 1;
    expect(() => unseal(key, [iv, tag, flipped.toString('base64url')].join('.'))).toThrow();
  });

  it('refuses a short secret', () => {
    expect(() => keyFrom('short')).toThrow();
  });
});

describe('permission rules (D-25, D-36)', () => {
  const sofia = '@sofia:p', ingrid = '@ingrid:p', jonas = '@jonas:p', henrik = '@henrik:p', stranger = '@x:p', kari = '@kari:p';
  const member = (id: string, name?: string): StateEvent => ({ type: 'm.room.member', state_key: id, content: { membership: 'join', displayname: name } });
  const pl: StateEvent = { type: 'm.room.power_levels', state_key: '', content: { users: { [sofia]: 100, [ingrid]: 50 } } };
  const workspace = spaceInfo([{ type: 'm.room.name', state_key: '', content: { name: 'Pasodrum' } }, pl, member(sofia, 'Sofia Olsen'), member(ingrid), member(jonas, 'Jonas Berg'),
    { type: 'm.room.member', state_key: stranger, content: { membership: 'invite' } }]);
  const client = spaceInfo([{ type: 'work.pasodrum.space', state_key: '', content: { kind: 'client' } },
    { ...pl, content: { users: { [sofia]: 100, [ingrid]: 50, [kari]: 10 } } }, member(sofia), member(ingrid), member(henrik), member(kari)]);

  it('reads the space', () => {
    expect(workspace.name).toBe('Pasodrum');
    expect(workspace.kind).toBe('workspace');
    expect(client.kind).toBe('client');
    expect(workspace.joined.get(sofia)).toBe('Sofia Olsen');
    expect(workspace.joined.get(ingrid)).toBe('ingrid');
    expect(workspace.joined.has(stranger)).toBe(false);
    expect(workspace.powerOf(jonas)).toBe(0);
  });

  it('trusts only the aliased workspace and client spaces marked by a workspace Admin (D-06)', () => {
    const marked = (by: string) => spaceInfo([{ type: 'work.pasodrum.space', state_key: '', sender: by, content: { kind: 'client' } }, member(by)]);
    expect(isGenuine('!ws', workspace, '!ws', null)).toBe(true);
    expect(isGenuine('!fake', workspace, '!ws', null)).toBe(false);
    expect(isGenuine('!ws', workspace, null, null)).toBe(false);
    expect(isGenuine('!c', marked(ingrid), '!ws', workspace)).toBe(true);
    expect(isGenuine('!c', marked(jonas), '!ws', workspace)).toBe(false);
    expect(isGenuine('!c', marked(stranger), '!ws', workspace)).toBe(false);
    expect(isGenuine('!c', marked(ingrid), '!ws', null)).toBe(false);
    expect(isGenuine('!c', client, '!ws', workspace)).toBe(false);
  });

  it('treats room-version-12 creators as top rank', () => {
    const v12 = spaceInfo([{ type: 'm.room.create', state_key: '', sender: jonas, content: { room_version: '12', additional_creators: [henrik] } }, pl, member(jonas), member(henrik)]);
    expect(v12.powerOf(jonas)).toBe(Infinity);
    expect(v12.powerOf(henrik)).toBe(Infinity);
    expect(canInvite('staff', v12, jonas)).toBe(true);
    const v11 = spaceInfo([{ type: 'm.room.create', state_key: '', sender: jonas, content: { room_version: '11' } }, pl, member(jonas)]);
    expect(v11.powerOf(jonas)).toBe(0);
  });

  it('only Owner/Admin of the workspace add Staff and Externals', () => {
    for (const role of ['staff', 'external'] as const) {
      expect(canInvite(role, workspace, sofia)).toBe(true);
      expect(canInvite(role, workspace, ingrid)).toBe(true);
      expect(canInvite(role, workspace, jonas)).toBe(false);
      expect(canInvite(role, workspace, stranger)).toBe(false);
      expect(canInvite(role, client, sofia)).toBe(false);
    }
  });

  it('Staff and up on a client space add its clients; clients cannot', () => {
    expect(canInvite('client', client, ingrid)).toBe(true);
    expect(canInvite('client', client, kari)).toBe(true);
    expect(canInvite('client', client, henrik)).toBe(false);
    expect(canInvite('client', workspace, sofia)).toBe(false);
    expect(canInvite('client', client, jonas)).toBe(false);
  });

  it('reads the old role names', () => {
    expect(['member', 'guest', 'staff', 'external', 'client'].map(normalizeRole)).toEqual(['staff', 'external', 'staff', 'external', 'client']);
    for (const bad of ['owner', 'admin', '', 42, null]) expect(normalizeRole(bad)).toBeNull();
  });

  it('only an Owner of a client space deletes it; never the workspace (DES-05)', () => {
    expect(canDelete(client, sofia)).toBe(true);
    expect(canDelete(client, ingrid)).toBe(false);
    expect(canDelete(client, kari)).toBe(false);
    expect(canDelete(client, henrik)).toBe(false);
    expect(canDelete(client, stranger)).toBe(false);
    expect(canDelete(workspace, sofia)).toBe(false);
  });

  it('the inviter or an Admin of the space manages an invite', () => {
    expect(canManage(jonas, jonas, null)).toBe(true);
    expect(canManage(jonas, ingrid, workspace)).toBe(true);
    expect(canManage(sofia, jonas, workspace)).toBe(false);
    expect(canManage(sofia, ingrid, null)).toBe(false);
  });

  it('lists the inviter first, then by rank', () => {
    expect(teamOf(workspace, jonas).map((p) => p.id)).toEqual([jonas, sofia, ingrid]);
    expect(teamOf(workspace, jonas, 2)).toHaveLength(2);
  });

  it('derives invite state', () => {
    const base = { claimedTs: null, revokedTs: null, expiresTs: 2000 };
    expect(stateOf(base, 1000)).toBe('open');
    expect(stateOf(base, 2000)).toBe('expired');
    expect(stateOf({ ...base, revokedTs: 500 }, 1000)).toBe('revoked');
    expect(stateOf({ ...base, claimedTs: 500 }, 3000)).toBe('used');
  });

  it('rate-limits per key and window', () => {
    const allow = rateLimiter();
    expect([1, 2, 3].map(() => allow('a', 2, 1000, 0))).toEqual([true, true, false]);
    expect(allow('b', 2, 1000, 0)).toBe(true);
    expect(allow('a', 2, 1000, 1000)).toBe(true);
  });
});

describe('invite email', () => {
  const base = {
    inviter: 'Jonas Berg', spaceName: 'Nordlys Energi', spaceId: '!abc:p', spaceKind: 'client' as const,
    link: 'https://pasodrum.work/join/CODE', expiresTs: Date.UTC(2026, 11, 4, 12), host: 'pasodrum.work',
  };

  it('renders the English board', () => {
    const m = renderInvite({ ...base, locale: 'en' });
    expect(m.subject).toBe('Jonas Berg added you to Nordlys Energi');
    expect(m.html).toContain('lang="en"');
    expect(m.html).toContain('>Join Nordlys Energi</a>');
    expect(m.html).toContain('href="https://pasodrum.work/join/CODE"');
    expect(m.html).toContain('Works once, until 4 December.<br>pasodrum.work');
    expect(m.html).toContain(`background:${tileColor('!abc:p', 'client')}`);
    expect(m.html).toContain('>N</td>');
    expect(m.text).toBe('Jonas Berg added you to Nordlys Energi\n\nJoin Nordlys Energi:\nhttps://pasodrum.work/join/CODE\n\nWorks once, until 4 December.\npasodrum.work\n');
  });

  it('renders the Japanese board', () => {
    const m = renderInvite({ ...base, locale: 'ja' });
    expect(m.subject).toBe('Jonas Berg さんが Nordlys Energi にあなたを追加しました');
    expect(m.html).toContain('lang="ja"');
    expect(m.html).toContain('>Nordlys Energi に参加</a>');
    expect(m.text).toContain('1 回だけ、12月4日まで使えます。');
  });

  it('escapes names and uses the workspace colour', () => {
    const m = renderInvite({ ...base, locale: 'en', inviter: '<b>Eve</b>', spaceName: 'A&B', spaceKind: 'workspace' });
    expect(m.html).not.toContain('<b>Eve</b>');
    expect(m.html).toContain('&#60;b&#62;Eve&#60;/b&#62;');
    expect(m.html).toContain('background:#0E7C66;color:#FFFFFF');
  });

  it('parses the From address', () => {
    expect(parseAddress('Pasodrum work <invites@noreply.prpl.se>')).toEqual({ name: 'Pasodrum work', email: 'invites@noreply.prpl.se' });
    expect(parseAddress('invites@noreply.prpl.se')).toEqual({ email: 'invites@noreply.prpl.se' });
  });
});

describe('mail', () => {
  const mail = { to: 'a@example.com', subject: 's', html: '<p>h</p>', text: 't' };
  afterEach(() => vi.unstubAllGlobals());

  it('refuses to send when nothing is configured, without a request', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(mailer({ from: 'x@example.com' })(mail)).rejects.toThrow('not configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('carries Resend’s status and reason into the error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"message":"domain is not verified"}', { status: 403 })));
    await expect(mailer({ from: 'x@example.com', resendKey: 're_test' })(mail)).rejects.toThrow(/403.*domain is not verified/);
  });
});
