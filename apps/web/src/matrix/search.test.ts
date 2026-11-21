import { describe, expect, it } from 'vitest';
import { fold, matches } from './search';
import type { Message } from './types';

const msg = (body: string, extra: Partial<Message> = {}): Message => ({
  id: '$1', channelId: '!c', sender: { id: '@a:x', name: 'A' }, body, ts: 0, status: 'sent', ...extra,
});
const hit = (body: string, query: string, extra?: Partial<Message>) => matches(msg(body, extra), fold(query));

describe('search matcher (D-13)', () => {
  it('finds Japanese substrings, which whole-word server search misses', () => {
    expect(hit('来週の打ち合わせの資料を送ります。', '打ち合わせ')).toBe(true);
    expect(hit('来週の打ち合わせの資料を送ります。', '資料を送')).toBe(true);
    expect(hit('来週の打ち合わせの資料を送ります。', '会議')).toBe(false);
  });

  it('folds full-width and half-width forms both ways', () => {
    expect(hit('ＴＥＳＴ build is up', 'test')).toBe(true);
    expect(hit('test build is up', 'ＴＥＳＴ')).toBe(true);
    expect(hit('ｶﾀｶﾅで書きました', 'カタカナ')).toBe(true);
    expect(hit('Release ２０２７', '2027')).toBe(true);
  });

  it('ignores case and matches inside words', () => {
    expect(hit('Nordlys Kickoff notes', 'kickoff')).toBe(true);
    expect(hit('the kickoff', 'KICK')).toBe(true);
  });

  it('skips deleted, system, undecryptable and unsent messages', () => {
    expect(hit('kickoff', 'kickoff', { kind: 'deleted' })).toBe(false);
    expect(hit('kickoff', 'kickoff', { kind: 'system' })).toBe(false);
    expect(hit('kickoff', 'kickoff', { kind: 'undecryptable' })).toBe(false);
    expect(hit('kickoff', 'kickoff', { status: 'sending' })).toBe(false);
    expect(hit('kickoff', 'kickoff', { kind: 'notice' })).toBe(true);
    expect(hit('kickoff', 'kickoff', { kind: 'image' })).toBe(true);
  });
});
