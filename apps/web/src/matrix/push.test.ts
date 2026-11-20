import { describe, expect, it } from 'vitest';
import { defaultLevel, defaultOps, roomLevel, roomOps, type PushRules } from './push';

const server = (patch: { master?: boolean; message?: boolean } = {}): PushRules => ({
  global: {
    override: [{ rule_id: '.m.rule.master', enabled: patch.master ?? false, actions: [] }],
    room: [],
    underride: [{ rule_id: '.m.rule.message', enabled: patch.message ?? true, actions: ['notify'] }],
  },
});
const withRoom = (rules: PushRules, kind: 'override' | 'room', actions: unknown[]): PushRules => ({
  global: { ...rules.global, [kind]: [...(rules.global?.[kind] ?? []), { rule_id: '!r', enabled: true, actions }] },
});

describe('notify levels from push rules', () => {
  it('default: master on = none, message rule off = mentions, else all', () => {
    expect(defaultLevel(server())).toBe('all');
    expect(defaultLevel(server({ master: true }))).toBe('none');
    expect(defaultLevel(server({ message: false }))).toBe('mentions');
    expect(defaultLevel(undefined)).toBe('all');
  });

  it('a channel: override mutes, room rule picks all/mentions, otherwise the default', () => {
    expect(roomLevel(withRoom(server(), 'override', []), '!r')).toBe('none');
    expect(roomLevel(withRoom(server(), 'override', ['dont_notify']), '!r')).toBe('none');
    expect(roomLevel(withRoom(server(), 'room', ['notify']), '!r')).toBe('all');
    expect(roomLevel(withRoom(server(), 'room', []), '!r')).toBe('mentions');
    expect(roomLevel(server({ message: false }), '!r')).toBe('mentions');
    expect(roomLevel(withRoom(server({ message: false }), 'room', ['notify']), '!r')).toBe('all');
  });
});

describe('push rule changes', () => {
  it('none replaces a room rule with a mute override', () => {
    expect(roomOps(withRoom(server(), 'room', ['notify']), '!r', 'none')).toEqual([
      { op: 'delete', kind: 'room', ruleId: '!r' },
      { op: 'add', kind: 'override', ruleId: '!r', actions: [], conditions: [{ kind: 'event_match', key: 'room_id', pattern: '!r' }] },
    ]);
  });

  it('mentions/all drop a mute and set the room rule', () => {
    expect(roomOps(withRoom(server(), 'override', []), '!r', 'mentions')).toEqual([
      { op: 'delete', kind: 'override', ruleId: '!r' },
      { op: 'add', kind: 'room', ruleId: '!r', actions: [] },
    ]);
    expect(roomOps(server(), '!r', 'all')).toEqual([{ op: 'add', kind: 'room', ruleId: '!r', actions: ['notify'] }]);
  });

  it('default levels switch the server rules', () => {
    expect(defaultOps('none')).toEqual([{ op: 'enable', kind: 'override', ruleId: '.m.rule.master', enabled: true }]);
    expect(defaultOps('mentions').map((o) => o.op === 'enable' && [o.ruleId, o.enabled])).toEqual([
      ['.m.rule.master', false],
      ['.m.rule.message', false],
      ['.m.rule.encrypted', false],
    ]);
    expect(defaultOps('all').every((o) => o.op === 'enable' && o.enabled === (o.ruleId !== '.m.rule.master'))).toBe(true);
  });
});
