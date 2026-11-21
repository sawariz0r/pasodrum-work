// SIDE-01 policy (CEO): team only, and never where clients or guests are.
import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '../../matrix';
import { teamConversation } from './Translate';

const ext = { id: '@c:x', name: 'Client', external: true };
const snap = (role: string, extra: Partial<WorkspaceSnapshot> = {}) =>
  ({
    spaces: [{ id: '!ws', name: 'Pasodrum', kind: 'workspace' }, { id: '!cl', name: 'Nordlys', kind: 'client' }],
    channels: {
      '!ws': [{ id: '!gen', spaceId: '!ws' }, { id: '!design', spaceId: '!ws', outside: [ext] }],
      '!cl': [{ id: '!proj', spaceId: '!cl' }],
    },
    dms: [{ id: '!dm-team', people: [{ id: '@t:x', name: 'Team' }] }, { id: '!dm-client', people: [ext] }],
    myRoles: { '!ws': role, '!cl': role },
    ...extra,
  }) as unknown as WorkspaceSnapshot;

describe('teamConversation', () => {
  it('allows team channels and team DMs for owners, admins and members', () => {
    for (const role of ['owner', 'admin', 'member']) {
      expect(teamConversation(snap(role), '!gen')).toBe(true);
      expect(teamConversation(snap(role), '!dm-team')).toBe(true);
    }
  });

  it('refuses client spaces, channels with outside people and DMs with them', () => {
    expect(teamConversation(snap('owner'), '!proj')).toBe(false);
    expect(teamConversation(snap('owner'), '!design')).toBe(false);
    expect(teamConversation(snap('owner'), '!dm-client')).toBe(false);
  });

  it('trusts only the workspace I am on the team of, once its member list is known', () => {
    const unjoined = { id: '!other', name: 'Other', kind: 'workspace' };
    const s = snap('owner', { spaces: [unjoined, ...snap('owner').spaces] as never, myRoles: { '!other': 'guest', '!ws': 'owner' } as never });
    s.channels['!other'] = [{ id: '!guestroom', spaceId: '!other' }] as never;
    expect(teamConversation(s, '!guestroom')).toBe(false);
    expect(teamConversation(s, '!gen')).toBe(true);
    s.channels['!ws'] = [{ id: '!gen', spaceId: '!ws', outsidePending: true }] as never;
    expect(teamConversation(s, '!gen')).toBe(false);
  });

  it('refuses clients and guests everywhere', () => {
    expect(teamConversation(snap('client', { myRoles: { '!cl': 'client' } }), '!proj')).toBe(false);
    expect(teamConversation(snap('guest', { myRoles: {} }), '!gen')).toBe(false);
  });
});
