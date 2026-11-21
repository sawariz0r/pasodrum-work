// D-38 confirm by email, end to end: pnpm dev:server && pnpm dev:seed && pnpm test:matrix -- emailConfirm
// The invite service under test is INVITE_URL (default: the stack's, behind BASE). A fresh client account each run.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { confirmMe } from './confirm';
import { claimInvite, confirmDevice, createWorkspaceStore, previewConfirm, signIn } from './index';
import { BASE, mx, open, PASSWORD, setupIntegration, stores, until } from './integration.helpers';

setupIntegration();
const INVITE_URL = process.env.INVITE_URL ?? `${BASE}/api/invites`;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
globalThis.location = { origin: new URL(INVITE_URL).origin } as Location;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mailWith(email: string, pattern: RegExp, notBefore: number): Promise<RegExpMatchArray> {
  for (let i = 0; i < 40; i++) {
    const list = (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`).then((r) => r.json())) as { messages?: { ID: string; Created: string }[] };
    for (const m of list.messages ?? []) {
      if (Date.parse(m.Created) < notBefore - 1000) continue;
      const full = (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`).then((r) => r.json())) as { Text?: string; HTML?: string };
      const hit = `${full.Text ?? ''}\n${full.HTML ?? ''}`.match(pattern);
      if (hit) return hit;
    }
    await sleep(250);
  }
  throw new Error(`no mail to ${email} matching ${pattern}`);
}

const backedUp = async (token: string) => {
  for (let i = 0; i < 40; i++) {
    const version = (await mx(token, 'GET', '/_matrix/client/v3/room_keys/version')).body.version as string | undefined;
    if (version) {
      const { body } = await mx(token, 'GET', `/_matrix/client/v3/room_keys/keys?version=${version}`);
      if (Object.keys(body.rooms ?? {}).length) return true;
    }
    await sleep(500);
  }
  return false;
};

async function device(identifier: string) {
  const session = await signIn(BASE, identifier, PASSWORD);
  const store = createWorkspaceStore(session);
  stores.push(store);
  await until(store, (s) => s.connection === 'online' && s.security.device !== 'starting' && s.security.confirmByEmail !== undefined, 30_000);
  return { session, store };
}

describe('D-38 confirm by email', () => {
  it('client: key handed over silently; a new device confirms through the emailed link and reads earlier messages', { timeout: 240_000 }, async () => {
    // A client space and a client added to it by email, as the app does (Ingrid: Admin; Sofia's seeded backup is junk).
    const ingrid = await open('ingrid');
    const stamp = randomBytes(3).toString('hex');
    const made = await ingrid.store.createClientSpace({ name: `EC ${stamp}`, colour: '#3f7d6e', channels: ['hello'], team: [], clientEmails: [] });
    const email = `ec${stamp}@example.com`;
    const res = await fetch(INVITE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ingrid.session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, role: 'client', spaceId: made.spaceId, channelIds: [made.channelId], locale: 'en' }),
    });
    expect(res.ok).toBe(true);
    const { code } = (await res.json()) as { code: string };
    const identifier = await claimInvite(code, 'Email Client', PASSWORD);

    // Device A: the account's first device makes its key silently and hands it to the service; no save step.
    const a = await device(identifier);
    expect(a.store.getSnapshot().security.confirmByEmail).toBe(true);
    await until(a.store, (s) => s.security.device === 'confirmed' && !s.security.needsRecoveryKey, 30_000);
    let held: string | null = null;
    for (let i = 0; i < 40 && !held; i++) {
      held = (await confirmMe(a.session.accessToken)).keyId;
      if (!held) await sleep(500);
    }
    expect(held).toBeTruthy();
    await until(a.store, (s) => s.security.emailConfirm?.email === email);

    const dmId = await a.store.openDm([ingrid.session.userId]);
    await until(a.store, (s) => s.dms.find((d) => d.id === dmId)?.encrypted);
    a.store.sendText(dmId, 'before the new device');
    a.store.openTimeline(dmId);
    await until(a.store, (s) => s.timelines[dmId]?.messages.find((m) => m.body === 'before the new device' && m.status === 'sent'));
    expect(await backedUp(a.session.accessToken)).toBe(true);
    // Last device with encrypted conversations, but the service holds the key: nothing to warn about.
    expect(await a.store.signOutRisk()).toBe('none');

    // Device B: unconfirmed; the email link confirms it only after the tap, and history comes back from the backup.
    const b = await device(identifier);
    await until(b.store, (s) => s.security.device === 'unconfirmed' && s.security.emailConfirm?.email === email);
    const asked = Date.now();
    await b.store.requestConfirmEmail();
    expect(b.store.getSnapshot().security.emailConfirm?.phase).toBe('sent');
    const link = (await mailWith(email, /\/confirm\/([A-Za-z0-9_-]{16,})/, asked))[1]!;

    const preview = await previewConfirm(link);
    expect(preview.state).toBe('open');
    await sleep(4_000);
    expect(b.store.getSnapshot().security).toMatchObject({ device: 'unconfirmed', emailConfirm: { phase: 'sent' } });

    await confirmDevice(link);
    await until(b.store, (s) => s.security.device === 'confirmed' && s.security.emailConfirm?.phase === 'confirmed', 30_000);
    await expect(confirmDevice(link)).rejects.toThrow('gone');
    b.store.openTimeline(dmId);
    const restored = await until(b.store, (s) => s.timelines[dmId]?.messages.find((m) => m.body === 'before the new device'), 30_000);
    expect(restored.kind).toBe('text');
  });
});
