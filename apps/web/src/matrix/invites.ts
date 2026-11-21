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

const EMAIL = /^[a-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/** The invite service's own rule (services/invite/src/ids.ts), so a bad address is caught before anything is made. */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  return email.length <= 200 && EMAIL.test(email) ? email : null;
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
  /** D-36. staff/external: `spaceId` = the workspace (Owner/Admin); external: `channelIds` = every room granted. client: the client space (its team). */
  role: 'staff' | 'external' | 'client';
  spaceId: string;
  channelIds: string[];
  locale: 'en' | 'ja';
}

export const createInvite = (token: string, invite: NewInvite) => call<{ code: string; userId: string; link: string }>('POST', '', { token, body: invite });

/** Pending codes that include this room; `userId` is the account each claims. */
export async function listInvites(token: string, roomId: string): Promise<(PendingInvite & { userId?: string })[]> {
  const raw = await call<unknown>('GET', `?roomId=${encodeURIComponent(roomId)}`, { token });
  return (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [])
    .filter((i) => typeof i.code === 'string' && typeof i.email === 'string')
    .map((i) => {
      const name = str(i.name);
      const link = str(i.link);
      const userId = str(i.userId);
      return {
        code: i.code as string,
        email: i.email as string,
        ...(name ? { name } : {}),
        role: i.role === 'member' || i.role === 'staff' ? 'staff' : i.role === 'client' ? 'client' : 'external',
        createdTs: typeof i.createdTs === 'number' ? i.createdTs : 0,
        ...(link ? { link } : {}),
        ...(userId ? { userId } : {}),
      };
    });
}

export const resendInvite = (token: string, code: string) => call<unknown>('POST', `/${encodeURIComponent(code)}/resend`, { token }).then(() => undefined);
export const revokeInvite = (token: string, code: string) => call<unknown>('DELETE', `/${encodeURIComponent(code)}`, { token }).then(() => undefined);
/** Remove from space: every open code for this person in this space stops working. */
export const revokeInvitesFor = (token: string, spaceId: string, userId: string) =>
  call<unknown>('DELETE', `?spaceId=${encodeURIComponent(spaceId)}&userId=${encodeURIComponent(userId)}`, { token }).then(() => undefined);
/** D-36 remove an External: every open code for this person, in any space, stops working (Owners/Admins of the workspace). */
export const revokeAllFor = (token: string, userId: string) => call<unknown>('DELETE', `/person?userId=${encodeURIComponent(userId)}`, { token }).then(() => undefined);
