import { loginCandidates } from './map';
import { SignInError, type Session, type SignInFailure } from './types';

const KEY = 'pasodrum.session';
const trimSlash = (url: string) => url.replace(/\/+$/, '');

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Turns what a person typed ("pasodrum.work", "https://…") into a base URL via .well-known. Throws SignInError('unreachable'). */
export async function resolveServer(input: string): Promise<string> {
  const raw = input.trim();
  let origin: string;
  try {
    const local = /^(localhost|127\.0\.0\.1|[^/]+\.localhost)(:\d+)?(\/|$)/.test(raw);
    origin = trimSlash(new URL(/^https?:\/\//.test(raw) ? raw : `${local ? 'http' : 'https'}://${raw}`).href);
  } catch {
    throw new SignInError('unreachable');
  }
  const wellKnown = await getJson(`${new URL(origin).origin}/.well-known/matrix/client`).catch(() => null);
  const advertised = (wellKnown as { 'm.homeserver'?: { base_url?: unknown } } | null)?.['m.homeserver']?.base_url;
  const base = typeof advertised === 'string' ? trimSlash(advertised) : origin;
  await getJson(`${base}/_matrix/client/versions`).catch(() => {
    throw new SignInError('unreachable');
  });
  return base;
}

/** identifier: work email or username. Throws SignInError. */
export async function signIn(baseUrl: string, identifier: string, password: string): Promise<Session> {
  let failure: SignInFailure = 'wrong-password';
  for (const candidate of loginCandidates(identifier)) {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/_matrix/client/v3/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'm.login.password', identifier: candidate, password, initial_device_display_name: 'Pasodrum work' }),
      });
    } catch {
      throw new SignInError('unreachable');
    }
    if (res.ok) {
      const body = (await res.json()) as { user_id: string; device_id: string; access_token: string };
      const session: Session = { baseUrl, userId: body.user_id, deviceId: body.device_id, accessToken: body.access_token };
      saveSession(session);
      return session;
    }
    if (res.status >= 500) throw new SignInError('unreachable');
    if (![400, 403, 404].includes(res.status)) failure = 'other';
  }
  throw new SignInError(failure);
}

export function loadSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Session> | null;
    return s && s.baseUrl && s.userId && s.deviceId && s.accessToken ? (s as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // No storage (private mode): the session lasts until reload.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
