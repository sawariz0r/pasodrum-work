// The invite service (D-26), same origin under /api/invites. Errors reject with InviteError; its message is the
// service's error code ('invalid-email', 'not-allowed', 'exists', 'used', 'expired', 'not-found', 'rate-limited',
// 'unreachable' or 'other').
import type { InvitePreview, PendingInvite } from './types';

export class InviteError extends Error {
  constructor(
    readonly code: string,
    readonly userId?: string,
  ) {
    super(code);
  }
}

const STATUS: Record<number, string> = { 400: 'invalid-email', 401: 'not-allowed', 403: 'not-allowed', 404: 'not-found', 409: 'exists', 410: 'expired', 429: 'rate-limited' };
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

async function call<T>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${location.origin}/api/invites${path}`, {
      method,
      headers: { ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new InviteError('unreachable');
  }
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // A proxy page instead of the service.
    throw new InviteError(res.ok ? 'unreachable' : (STATUS[res.status] ?? 'other'));
  }
  if (!res.ok) throw new InviteError(str(data.error) ?? STATUS[res.status] ?? 'other', str(data.userId));
  return data as T;
}

export async function previewInvite(code: string): Promise<InvitePreview> {
  const raw = await call<Record<string, unknown>>('GET', `/${encodeURIComponent(code)}`);
  if (typeof raw.email !== 'string' || typeof raw.spaceName !== 'string') throw new InviteError('unreachable');
  const team = Array.isArray(raw.team) ? (raw.team as { id?: unknown; name?: unknown }[]) : [];
  const inviter = str(raw.inviter);
  return {
    email: raw.email,
    spaceName: raw.spaceName,
    spaceKind: raw.spaceKind === 'client' ? 'client' : 'workspace',
    ...(inviter ? { inviter } : {}),
    team: team.filter((p) => typeof p.id === 'string').map((p) => ({ id: p.id as string, name: str(p.name) ?? (p.id as string) })),
    // A revoked link reads as used (nothing to do on the join page); anything unknown as expired.
    state: raw.state === 'open' ? 'open' : raw.state === 'used' || raw.state === 'revoked' ? 'used' : 'expired',
  };
}

/** Sets name + password for the invited account; resolves to the identifier to sign in with. */
export async function claimInvite(code: string, name: string, password: string): Promise<string> {
  const raw = await call<{ userId?: unknown; identifier?: unknown }>('POST', `/${encodeURIComponent(code)}/claim`, { body: { name, password } });
  const identifier = str(raw.identifier) ?? str(raw.userId);
  if (!identifier) throw new InviteError('other');
  return identifier;
}

// Signed-in calls (Bearer = the caller's Matrix token); used by the store, not exported from matrix/.
export interface NewInvite {
  email: string;
  name?: string;
  role: 'member' | 'guest' | 'client';
  spaceId: string;
  channelIds: string[];
  locale: 'en' | 'ja';
}

export const createInvite = (token: string, invite: NewInvite) => call<{ code: string; userId: string; link: string }>('POST', '', { token, body: invite });

export async function listInvites(token: string, roomId: string): Promise<PendingInvite[]> {
  const raw = await call<unknown>('GET', `?roomId=${encodeURIComponent(roomId)}`, { token });
  return (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])
    .filter((i) => typeof i.code === 'string' && typeof i.email === 'string')
    .map((i) => {
      const name = str(i.name);
      const link = str(i.link);
      return {
        code: i.code as string,
        email: i.email as string,
        ...(name ? { name } : {}),
        role: i.role === 'member' || i.role === 'client' ? i.role : 'guest',
        createdTs: typeof i.createdTs === 'number' ? i.createdTs : 0,
        ...(link ? { link } : {}),
      };
    });
}

export const resendInvite = (token: string, code: string) => call<unknown>('POST', `/${encodeURIComponent(code)}/resend`, { token }).then(() => undefined);
export const revokeInvite = (token: string, code: string) => call<unknown>('DELETE', `/${encodeURIComponent(code)}`, { token }).then(() => undefined);
