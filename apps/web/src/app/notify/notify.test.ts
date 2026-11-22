// @vitest-environment happy-dom
import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ActivityItem, Channel, Dm, Message, Space } from '../../matrix';
import { initI18n } from '../i18n';
import { badgeCount, notices, openConversation } from './notify';

beforeAll(() => {
  initI18n();
});

const me = { id: '@me:x', name: 'Sam Okafor' };
const jonas = { id: '@jonas:x', name: 'Jonas Berg' };
const spaces: Space[] = [
  { id: '!ws', name: 'Pasodrum', kind: 'workspace' },
  { id: '!nordlys', name: 'Nordlys Energi', kind: 'client' },
];
const since = 1000;

const msg = (id: string, channelId: string, sender = jonas, ts = 2000): Message => ({ id, channelId, sender, body: `text ${id}`, ts, status: 'sent' });
const channel = (id: string, spaceId: string, mentions = 1): Channel => ({ id, spaceId, name: id.slice(1), private: false, unread: 1, mentions, memberCount: 3 });
const dm = (id: string, last?: Message, unread = 1): Dm => ({ id, people: [me, jonas], unread, mentions: 0, lastTs: last?.ts ?? 0, last, spaceIds: ['!ws'] });
const mention = (m: Message, extra: Partial<ActivityItem> = {}): ActivityItem => ({ id: m.id, kind: 'mention', channelId: m.channelId, message: m, unread: true, ...extra });

const snap = (x: { channels?: Channel[]; dms?: Dm[]; activity?: ActivityItem[] } = {}) => ({
  me,
  spaces,
  channels: { '!ws': (x.channels ?? []).filter((c) => c.spaceId === '!ws'), '!nordlys': (x.channels ?? []).filter((c) => c.spaceId === '!nordlys') },
  dms: x.dms ?? [],
  activity: x.activity ?? [],
});

const run = (prev: ReturnType<typeof snap>, next: ReturnType<typeof snap>, open?: string) => notices(prev, next, { since, open, t: i18next.t });

describe('badgeCount', () => {
  it('adds channel mentions and DM unreads, not plain channel unreads', () => {
    expect(badgeCount(snap({ channels: [channel('#a', '!ws', 2), channel('#b', '!ws', 0)], dms: [dm('!d1', undefined, 3)] }))).toBe(5);
  });
});

describe('notices', () => {
  it('a new DM message notifies with the sender, the text and a route to the message', () => {
    const m = msg('$1', '!d1');
    expect(run(snap({ dms: [dm('!d1')] }), snap({ dms: [dm('!d1', m)] }))).toEqual([{ tag: '!d1', title: 'Jonas Berg', body: 'text $1', route: '/dms/!d1?msg=%241' }]);
  });

  it('history from before start never notifies (the first sync)', () => {
    const old = msg('$1', '!g', jonas, 500);
    const next = snap({ channels: [channel('#g', '!ws')], dms: [dm('!d1', msg('$2', '!d1', jonas, 500))], activity: [mention({ ...old, channelId: '#g' })] });
    expect(run(snap(), next)).toEqual([]);
  });

  it('my own message and an unchanged last message do not notify', () => {
    const mine = dm('!d1', msg('$1', '!d1', me));
    expect(run(snap({ dms: [dm('!d1')] }), snap({ dms: [mine] }))).toEqual([]);
    const same = snap({ dms: [dm('!d1', msg('$2', '!d1'))] });
    expect(run(same, { ...same, dms: [...same.dms] })).toEqual([]);
  });

  it('a DM notifies once its unread count or decryption catches up with the message', () => {
    const m = msg('$1', '!d1');
    const counted = snap({ dms: [dm('!d1', m)] });
    expect(run(snap({ dms: [dm('!d1', m, 0)] }), counted)).toHaveLength(1);
    expect(run(snap({ dms: [dm('!d1', { ...m, kind: 'undecryptable', body: '' })] }), counted)).toHaveLength(1);
    expect(run(counted, snap({ dms: [dm('!d1', m, 2)] }))).toEqual([]);
  });

  it('the open conversation is quiet only while focused (open passed)', () => {
    const next = snap({ dms: [dm('!d1', msg('$1', '!d1'))] });
    expect(run(snap({ dms: [dm('!d1')] }), next, '!d1')).toEqual([]);
    expect(run(snap({ dms: [dm('!d1')] }), next, undefined)).toHaveLength(1);
  });

  it('a mention notifies; a plain unread, a muted channel and a reply do not', () => {
    const m = msg('$1', '#g');
    const prev = snap({ channels: [channel('#g', '!ws', 0)] });
    expect(run(prev, snap({ channels: [channel('#g', '!ws', 0)] }))).toEqual([]);
    expect(run(prev, snap({ channels: [channel('#g', '!ws', 0)], activity: [mention(m)] }))).toEqual([]);
    expect(run(prev, snap({ channels: [channel('#g', '!ws')], activity: [mention(m, { kind: 'reply' })] }))).toEqual([]);
    expect(run(prev, snap({ channels: [channel('#g', '!ws')], activity: [mention(m)] }))).toEqual([
      { tag: '#g', title: '#g', body: 'Jonas Berg: text $1', route: '/w/!ws/c/%23g?msg=%241' },
    ]);
  });

  it('a mention in a client space names the client space; in a thread it opens the thread', () => {
    const m = msg('$1', '#review');
    const [n] = run(snap(), snap({ channels: [channel('#review', '!nordlys')], activity: [mention(m, { threadRootId: '$root' })] }));
    expect(n?.title).toBe('#review · Nordlys Energi');
    expect(n?.route).toBe('/w/!nordlys/c/%23review?thread=%24root');
  });
});

describe('openConversation', () => {
  it('reads channel and DM ids from the path', () => {
    expect(openConversation('/w/!ws/c/%21g')).toBe('!g');
    expect(openConversation('/w/!ws/dm/!d1')).toBe('!d1');
    expect(openConversation('/dms/!d1')).toBe('!d1');
    expect(openConversation('/activity')).toBeUndefined();
  });
});
