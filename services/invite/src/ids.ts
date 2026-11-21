import { randomBytes } from 'node:crypto';

const EMAIL = /^[a-z0-9._+-]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const email = input.trim().toLowerCase();
  return email.length <= 200 && EMAIL.test(email) ? email : null;
}

// D-07: henrik@nordlys.no → henrik_nordlys.no; an address on the server's own domain keeps its local part.
export function localpartFor(email: string, serverName: string): string {
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return domain === serverName.toLowerCase() ? local : `${local}_${domain}`;
}

export const localpartOf = (userId: string) => userId.slice(1, userId.indexOf(':'));

// localpartFor backwards: domains have no "_", so the last one splits local part and domain.
export function emailFor(localpart: string, serverName: string): string | null {
  const at = localpart.lastIndexOf('_');
  return (at > 0 && normalizeEmail(`${localpart.slice(0, at)}@${localpart.slice(at + 1)}`)) || normalizeEmail(`${localpart}@${serverName}`);
}

// 144 bits, URL-safe.
export const newCode = () => randomBytes(18).toString('base64url');
export const isCode = (s: string) => /^[A-Za-z0-9_-]{24}$/.test(s);
export const newPassword = () => randomBytes(32).toString('base64url');
