// Team only, enforced by the server (spec §3.1). Runs first on every path and fails closed: any homeserver error refuses.
import type { Reader } from './reader.ts';

export type Refusal = 'unauthorized' | 'not-allowed' | 'unavailable';
export type Admitted = { userId: string; workspaceId: string; level: number };

const ADMIN_LEVEL = 50;
const EXTERNAL = 'work.pasodrum.external';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const contentOf = (e: { content?: unknown } | undefined): Json => (e && isObj(e.content) ? e.content : {});

export async function gate(reader: Reader, isClientAccount: (userId: string) => boolean): Promise<Admitted | Refusal> {
  try {
    const userId = await reader.whoami();
    if (!userId) return 'unauthorized';
    const [workspaceId, state] = await Promise.all([reader.workspace(), reader.workspaceState()]);
    if (!workspaceId || !state) return 'not-allowed';
    if (contentOf(state.one('m.room.member', userId)).membership !== 'join') return 'not-allowed';
    if (isClientAccount(userId)) return 'not-allowed';
    if (Object.keys(contentOf(state.one(EXTERNAL, userId.slice(1)))).length > 0) return 'not-allowed';
    return { userId, workspaceId, level: levelOf(state, userId) };
  } catch {
    return 'unavailable';
  }
}

/** Settings and usage: the gate, then level 50 or more in the workspace, read from its state with the caller's token. */
export async function gateAdmin(reader: Reader, isClientAccount: (userId: string) => boolean): Promise<Admitted | Refusal> {
  const g = await gate(reader, isClientAccount);
  return typeof g === 'string' || g.level >= ADMIN_LEVEL ? g : 'not-allowed';
}

type State = { one(type: string, key?: string): { sender?: unknown; content?: unknown } | undefined };

function levelOf(state: State, userId: string): number {
  const create = state.one('m.room.create');
  const c = contentOf(create);
  const version = c.room_version;
  // Room version 12+: creators outrank everyone and are not listed in `users`.
  if (typeof version === 'string' && (Number(version) >= 12 || version.includes('hydra'))) {
    const creators = [create?.sender, ...(Array.isArray(c.additional_creators) ? c.additional_creators : [])];
    if (creators.includes(userId)) return Infinity;
  }
  const pl = contentOf(state.one('m.room.power_levels'));
  const users = isObj(pl.users) ? pl.users : {};
  const level = users[userId] ?? pl.users_default ?? 0;
  return typeof level === 'number' ? level : 0;
}
