// Notification levels as push rules, Element-compatible: a per-channel override rule mutes, a room rule picks
// "all" (notify) or "mentions" (no notify; the mention rules still fire); the account default uses the server rules.
import type { NotifyLevel } from './types';

export interface PushRule {
  rule_id: string;
  enabled?: boolean;
  actions?: unknown[];
}
export interface PushRules {
  global?: { override?: PushRule[]; room?: PushRule[]; underride?: PushRule[] };
}
export type PushKind = 'override' | 'room' | 'underride';
export type PushOp =
  | { op: 'add'; kind: PushKind; ruleId: string; actions: string[]; conditions?: { kind: string; key: string; pattern: string }[] }
  | { op: 'delete'; kind: PushKind; ruleId: string }
  | { op: 'enable'; kind: PushKind; ruleId: string; enabled: boolean };

const MASTER = '.m.rule.master';
const MESSAGE = '.m.rule.message';
const ENCRYPTED = '.m.rule.encrypted';
const notifies = (r: PushRule) => !!r.actions?.includes('notify');
const find = (rules: PushRules | undefined, kind: PushKind, id: string) => rules?.global?.[kind]?.find((r) => r.rule_id === id);

export function defaultLevel(rules: PushRules | undefined): NotifyLevel {
  if (find(rules, 'override', MASTER)?.enabled) return 'none';
  const message = find(rules, 'underride', MESSAGE);
  return message && (message.enabled === false || !notifies(message)) ? 'mentions' : 'all';
}

export function roomLevel(rules: PushRules | undefined, roomId: string): NotifyLevel {
  const mute = find(rules, 'override', roomId);
  if (mute && mute.enabled !== false && !notifies(mute)) return 'none';
  const room = find(rules, 'room', roomId);
  if (room && room.enabled !== false) return notifies(room) ? 'all' : 'mentions';
  return defaultLevel(rules);
}

export function roomOps(rules: PushRules | undefined, roomId: string, level: NotifyLevel): PushOp[] {
  const ops: PushOp[] = [];
  if (level === 'none') {
    if (find(rules, 'room', roomId)) ops.push({ op: 'delete', kind: 'room', ruleId: roomId });
    ops.push({ op: 'add', kind: 'override', ruleId: roomId, actions: [], conditions: [{ kind: 'event_match', key: 'room_id', pattern: roomId }] });
    return ops;
  }
  if (find(rules, 'override', roomId)) ops.push({ op: 'delete', kind: 'override', ruleId: roomId });
  ops.push({ op: 'add', kind: 'room', ruleId: roomId, actions: level === 'all' ? ['notify'] : [] });
  return ops;
}

export function defaultOps(level: NotifyLevel): PushOp[] {
  if (level === 'none') return [{ op: 'enable', kind: 'override', ruleId: MASTER, enabled: true }];
  const on = level === 'all';
  return [
    { op: 'enable', kind: 'override', ruleId: MASTER, enabled: false },
    { op: 'enable', kind: 'underride', ruleId: MESSAGE, enabled: on },
    { op: 'enable', kind: 'underride', ruleId: ENCRYPTED, enabled: on },
  ];
}
