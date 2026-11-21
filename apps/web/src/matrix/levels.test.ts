import { describe, expect, it } from 'vitest';
import { archivedLevels, channelUsers, dmLevels, levelFor, powerLevels, withPins } from './levels';

describe('D-27 power levels', () => {
  it('workspace: Admins manage levels, Owner/Admin invite, anyone links channels; channels let anyone invite', () => {
    const space = powerLevels('workspace', 'space', { '@a:x': 50 });
    expect(space).toMatchObject({ users: { '@a:x': 50 }, invite: 50, events_default: 50, events: { 'm.room.power_levels': 50, 'm.space.child': 0 } });
    expect(powerLevels('workspace', 'channel', {})).toMatchObject({ invite: 0, events_default: 0, events: { 'm.room.power_levels': 50 } });
  });

  it('client space: its team (10) invites and links channels; clients at 0 can’t', () => {
    expect(powerLevels('client', 'space', {})).toMatchObject({ invite: 10, events: { 'm.space.child': 10, 'm.room.power_levels': 50 } });
    expect(powerLevels('client', 'channel', {})).toMatchObject({ invite: 10, events_default: 0 });
  });

  it('channels copy team and up from the space; creators become Owners; the channel creator is left out', () => {
    expect(channelUsers({ '@admin:x': 50, '@staff:x': 10, '@low:x': 5, '@me:x': 50, '@bad:x': 'x' }, ['@sofia:x'], '@me:x')).toEqual({ '@admin:x': 50, '@staff:x': 10, '@sofia:x': 100 });
  });

  it('anyone pins in channels and new DMs; archiving raises pins to Admin (M7, D-33)', () => {
    expect(powerLevels('workspace', 'channel', {}).events).toMatchObject({ 'm.room.pinned_events': 0 });
    expect(powerLevels('client', 'space', {}).events).not.toHaveProperty('m.room.pinned_events');
    expect(dmLevels().events).toMatchObject({ 'm.room.pinned_events': 0, 'm.room.power_levels': 100, 'm.room.encryption': 100 });
    expect(archivedLevels(powerLevels('client', 'channel', {}), 'client', true).events).toMatchObject({ 'm.room.pinned_events': 50 });
    expect(withPins({ events_default: 0, events: { 'm.room.power_levels': 50 } }).events).toEqual({ 'm.room.power_levels': 50, 'm.room.pinned_events': 0 });
    expect(withPins({ events_default: 50 }).events).toEqual({ 'm.room.pinned_events': 50 });
  });

  it('a role’s level per space kind', () => {
    expect([levelFor('owner', 'client', true), levelFor('admin', 'workspace', false), levelFor('member', 'client', true), levelFor('member', 'client', false), levelFor('member', 'workspace', true)]).toEqual([100, 50, 10, 0, 0]);
  });

  it('archive raises posting, reactions and redactions to Admin; unarchive restores D-27 (D-28)', () => {
    const live = powerLevels('client', 'channel', { '@a:x': 50 });
    const archived = archivedLevels(live, 'client', true);
    expect(archived).toMatchObject({ users: { '@a:x': 50 }, events_default: 50, invite: 10, events: { 'm.reaction': 50, 'm.room.redaction': 50, 'm.room.power_levels': 50 } });
    expect(archivedLevels(archived, 'client', false)).toEqual(live);
  });
});
