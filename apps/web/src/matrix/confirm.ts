// D-38 confirm by email: the invite service under /api/invites/confirm. Link-page calls need no session; the rest use
// the caller's Matrix token and are used by the store only.
import type { EmailConfirm, HelpReason, Person, Security } from './types';

export interface ConfirmLink {
  state: 'open' | 'gone';
  device?: string;
  requestedTs?: number;
  tz?: string;
  contact?: string;
  contactId?: string;
}

export class ConfirmError extends Error {
  constructor(
    readonly code: string,
    readonly status = 0,
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

async function call<T = Record<string, unknown>>(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${location.origin}/api/invites/confirm${path}`, {
      method,
      headers: { ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}), ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ConfirmError('unreachable');
  }
  if (res.status === 204) return {} as T;
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new ConfirmError(res.ok || res.status >= 502 ? 'unreachable' : 'other', res.status);
  }
  if (!res.ok) throw new ConfirmError(str(data.error) ?? (res.status >= 502 ? 'unreachable' : 'other'), res.status, data);
  return data as T;
}

const codeOf = (e: unknown, allowed: string[]) => new Error(e instanceof ConfirmError && allowed.includes(e.code) ? e.code : 'other');
const path = (code: string) => `/${encodeURIComponent(code)}`;

/** Link page: what the link is for. Never confirms anything. */
export async function previewConfirm(code: string): Promise<ConfirmLink> {
  let raw: Record<string, unknown>;
  try {
    raw = await call('GET', path(code));
  } catch (e) {
    if (e instanceof ConfirmError && e.code === 'gone') return { state: 'gone' };
    throw new Error('unreachable');
  }
  const contact = str(raw.contact);
  const contactId = str(raw.contactId);
  const who = { ...(contact ? { contact } : {}), ...(contactId ? { contactId } : {}) };
  if (raw.state !== 'open') return { state: 'gone', ...who };
  const device = str(raw.device);
  const requestedTs = num(raw.requestedTs);
  const tz = str(raw.tz);
  return { state: 'open', ...(device ? { device } : {}), ...(requestedTs ? { requestedTs } : {}), ...(tz ? { tz } : {}), ...who };
}

/** Link page: "Yes, it's me". */
export async function confirmDevice(code: string): Promise<void> {
  try {
    await call('POST', path(code));
  } catch (e) {
    if (e instanceof ConfirmError && e.status === 410) throw new Error('gone');
    throw codeOf(e, ['gone', 'unreachable']);
  }
}

/** Link page: tell my contact (stuck, or link-broken when the link is gone). */
export async function askForHelpByLink(code: string): Promise<void> {
  try {
    await call('POST', `${path(code)}/help`, { body: { tz: timeZone() } });
  } catch (e) {
    throw codeOf(e, ['no-contact', 'unreachable']);
  }
}

export function timeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// Signed-in calls (store only).
export interface ConfirmMe {
  email: string;
  keyId: string | null;
  contact: { id: string; name: string } | null;
}

export async function confirmMe(token: string, spaceId?: string): Promise<ConfirmMe> {
  const raw = await call('GET', `/me${spaceId ? `?spaceId=${encodeURIComponent(spaceId)}` : ''}`, { token });
  const c = raw.contact as { id?: unknown; name?: unknown } | null | undefined;
  const id = str(c?.id);
  return { email: str(raw.email) ?? '', keyId: str(raw.keyId) ?? null, contact: id ? { id, name: str(c?.name) ?? id } : null };
}

export const handOverKey = (token: string, key: string, keyId: string) => call('POST', '/key', { token, body: { key, keyId } }).then(() => undefined);

export async function startConfirm(token: string, body: { locale: 'en' | 'ja'; tz?: string; spaceId?: string }) {
  const raw = await call('POST', '/start', { token, body });
  return { email: str(raw.email) ?? '', canResendAt: num(raw.canResendAt), expiresTs: num(raw.expiresTs) ?? Date.now() + 15 * 60_000 };
}

export async function confirmStatus(token: string): Promise<'none' | 'pending' | 'confirmed'> {
  const raw = await call('GET', '/status', { token });
  return raw.state === 'pending' || raw.state === 'confirmed' ? raw.state : 'none';
}

export async function collectKey(token: string): Promise<string> {
  const raw = await call('POST', '/collect', { token });
  const key = str(raw.key);
  if (!key) throw new ConfirmError('other');
  return key;
}

export async function sendHelp(token: string, body: { reason: HelpReason; tz?: string; spaceId?: string }) {
  const raw = await call('POST', '/help', { token, body });
  const c = raw.contact as { id?: unknown; name?: unknown } | undefined;
  const id = str(c?.id);
  return id ? { id, name: str(c?.name) ?? id } : null;
}

/** What the controller needs from the store and the security controller. */
export interface EmailConfirmDeps {
  token: string;
  /** Matches Security['confirmByEmail']: undefined until known. */
  eligible(): boolean | undefined;
  device(): Security['device'];
  needsRecoveryKey(): boolean;
  defaultKeyId(): Promise<string | null>;
  newRecoveryKey(): Promise<string>;
  useRecoveryKey(key: string): Promise<void>;
  person(id: string, name: string): Person;
  spaceId(): string | undefined;
  locale(): 'en' | 'ja';
  onChange(): void;
}

export interface EmailConfirmController {
  state(): { emailConfirm: EmailConfirm; helpContact?: Person };
  /** Re-checks whether the service holds this account's current key (and the start-up resume); cheap when nothing changed. `force` skips a pending backoff. */
  kick(force?: boolean): void;
  request(): Promise<void>;
  help(reason: HelpReason): Promise<void>;
  /** After resetEncryption: the new key goes to the service; on failure the reconcile loop rotates later. */
  handOver(key: string): Promise<void>;
  /** The service holds the key this account uses now. */
  held(): Promise<boolean>;
  stop(): void;
}

const POLL = 3_000;
/** A key another device just made: its hand-over may still be on the way. */
const SETTLE = 15_000;
const TTL = 15 * 60_000;
const START_ERRORS = ['rate-limited', 'no-key', 'unreachable'] as const;

/**
 * D-38 for clients and Externals: the silent recovery key lives with the invite service. A confirmed device keeps the
 * service's copy current (first key, M6 migration, failed uploads, races between devices: keyId differs → rotate and hand
 * over); an unconfirmed one asks for the email link, polls, collects the key once and confirms with it.
 */
export function createEmailConfirm(d: EmailConfirmDeps): EmailConfirmController {
  let emailConfirm: EmailConfirm = { phase: 'idle', email: '' };
  let helpContact: Person | undefined;
  let view: { emailConfirm: EmailConfirm; helpContact?: Person } = { emailConfirm };
  let heldKeyId: string | null | undefined;
  let seenKeyId: string | null | undefined;
  let changedAt = 0;
  let staff = false;
  let checkedTeam = false;
  let stopped = false;
  let resumed = false;
  let running = false;
  let again = false;
  let backoff = 5_000;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let poll: ReturnType<typeof setTimeout> | undefined;
  let pollGen = 0;

  const publish = () => {
    view = { emailConfirm, ...(helpContact ? { helpContact } : {}) };
    d.onChange();
  };
  const setPhase = (next: Omit<EmailConfirm, 'email'>) => {
    emailConfirm = { ...next, email: emailConfirm.email };
    publish();
  };
  const setContact = (c: { id: string; name: string } | null) => {
    const next = c ? d.person(c.id, c.name) : undefined;
    if (JSON.stringify(next) === JSON.stringify(helpContact)) return;
    helpContact = next;
    publish();
  };

  const loadMe = async () => {
    const me = await confirmMe(d.token, d.spaceId());
    heldKeyId = me.keyId;
    if (me.email && me.email !== emailConfirm.email) {
      emailConfirm = { ...emailConfirm, email: me.email };
      publish();
    }
    setContact(me.contact);
    return me;
  };

  const reconcile = async () => {
    const eligible = d.eligible();
    if (staff) return;
    // Someone who became Staff: one call per session, so the service drops a key it still holds for them (403 'staff').
    if (eligible === false && !checkedTeam) {
      await confirmMe(d.token, d.spaceId());
      checkedTeam = true;
    }
    if (eligible !== true) return;
    const device = d.device();
    if (device === 'unconfirmed' && !resumed) {
      resumed = true;
      void resume();
    }
    if (heldKeyId === undefined) await loadMe();
    if (device !== 'confirmed') return;
    const current = await d.defaultKeyId();
    if (seenKeyId !== undefined && current !== seenKeyId) changedAt = Date.now();
    seenKeyId = current;
    if (!d.needsRecoveryKey() && heldKeyId && heldKeyId === current) return;
    if (Date.now() - changedAt < SETTLE) throw new Error('settling');
    // One fresh look per decision: another device may have rotated and handed over meanwhile.
    const me = await loadMe();
    if (!d.needsRecoveryKey() && me.keyId && me.keyId === (await d.defaultKeyId())) return;
    // Throws 'backup-unreadable' (keys not here yet) or 'other': nothing changed, try again later.
    const key = await d.newRecoveryKey();
    const keyId = await d.defaultKeyId();
    if (!keyId) throw new Error('other');
    seenKeyId = keyId;
    await handOverKey(d.token, key, keyId);
    heldKeyId = keyId;
  };

  const kick = (force = false) => {
    if (stopped || staff || (retry && !force)) return;
    if (running) return void (again = true);
    running = true;
    clearTimeout(retry);
    retry = undefined;
    reconcile()
      .then(
        () => void (backoff = 5_000),
        (e: unknown) => {
          if (e instanceof ConfirmError && e.code === 'staff') return void (staff = true);
          retry = setTimeout(() => {
            retry = undefined;
            kick();
          }, backoff);
          backoff = Math.min(backoff * 2, 300_000);
        },
      )
      .finally(() => {
        running = false;
        if (again) {
          again = false;
          kick();
        }
      });
  };

  const stopPolling = () => {
    pollGen++;
    clearTimeout(poll);
  };
  const waitForTap = (expiresTs: number) => {
    stopPolling();
    const gen = pollGen;
    const later = () => void (gen === pollGen && !stopped && (poll = setTimeout(tick, POLL)));
    const tick = async () => {
      if (gen !== pollGen || stopped) return;
      if (d.device() === 'confirmed') return setPhase({ phase: 'idle' });
      if (Date.now() > expiresTs) return setPhase({ phase: 'idle', ...(emailConfirm.canResendAt ? { canResendAt: emailConfirm.canResendAt } : {}) });
      let state: 'none' | 'pending' | 'confirmed';
      try {
        state = await confirmStatus(d.token);
      } catch {
        return later();
      }
      if (gen !== pollGen) return;
      if (state === 'pending') return later();
      if (state === 'none') return setPhase({ phase: 'idle' });
      let key: string;
      try {
        key = await collectKey(d.token);
      } catch (e) {
        if (e instanceof ConfirmError && (e.status === 409 || e.status === 410)) return setPhase({ phase: 'idle' });
        return later();
      }
      try {
        await d.useRecoveryKey(key);
      } catch (e) {
        return setPhase({ phase: 'failed', error: (e as Error).message === 'wrong-key' ? 'wrong-key' : 'other' });
      }
      stopPolling();
      setPhase({ phase: 'confirmed' });
    };
    later();
  };

  /** After a reload: a link already sent to this device is still waited for. */
  const resume = async () => {
    const state = await confirmStatus(d.token).catch(() => 'none' as const);
    if (state === 'none' || emailConfirm.phase !== 'idle' || d.device() !== 'unconfirmed') return;
    setPhase({ phase: 'sent' });
    waitForTap(Date.now() + TTL);
  };

  return {
    state: () => view,
    kick,
    async request() {
      if (d.eligible() !== true) throw new Error('other');
      stopPolling();
      setPhase({ phase: 'sending' });
      let sent: Awaited<ReturnType<typeof startConfirm>>;
      try {
        const tz = timeZone();
        const spaceId = d.spaceId();
        sent = await startConfirm(d.token, { locale: d.locale(), ...(tz ? { tz } : {}), ...(spaceId ? { spaceId } : {}) });
      } catch (e) {
        const code = e instanceof ConfirmError ? (START_ERRORS as readonly string[]).find((c) => c === e.code) : undefined;
        const error = (code ?? 'other') as NonNullable<EmailConfirm['error']>;
        const canResendAt = e instanceof ConfirmError ? num(e.data.canResendAt) : undefined;
        setPhase({ phase: 'failed', error, ...(canResendAt ? { canResendAt } : {}) });
        throw new Error(error);
      }
      if (sent.email) emailConfirm = { ...emailConfirm, email: sent.email };
      setPhase({ phase: 'sent', ...(sent.canResendAt ? { canResendAt: sent.canResendAt } : {}) });
      waitForTap(sent.expiresTs);
    },
    async help(reason) {
      try {
        const tz = timeZone();
        const spaceId = d.spaceId();
        const contact = await sendHelp(d.token, { reason, ...(tz ? { tz } : {}), ...(spaceId ? { spaceId } : {}) });
        if (contact) setContact(contact);
      } catch (e) {
        throw codeOf(e, ['no-contact', 'unreachable']);
      }
    },
    async handOver(key) {
      const keyId = await d.defaultKeyId();
      if (!keyId) throw new Error('other');
      seenKeyId = keyId;
      await handOverKey(d.token, key, keyId);
      heldKeyId = keyId;
    },
    async held() {
      if (d.device() !== 'confirmed') return false;
      const me = await loadMe();
      return !!me.keyId && me.keyId === (await d.defaultKeyId());
    },
    stop() {
      stopped = true;
      stopPolling();
      clearTimeout(retry);
    },
  };
}
