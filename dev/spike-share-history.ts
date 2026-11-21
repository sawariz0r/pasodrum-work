// SIDE-03 spike: MSC4268 "share history" (key bundle) end to end against the LOCAL dev server only.
// node dev/spike-share-history.ts [A|B|C|D ...]   (default: all). SDK + Rust crypto logs go to dev/data/spike-share-history.log.
// Fresh accounts each run, so the seeded ones never get an encryption identity.
import { appendFileSync, writeFileSync } from 'node:fs';
import * as sdk from '../apps/web/node_modules/matrix-js-sdk/lib/index.js';
import type { MatrixClient, MatrixEvent } from '../apps/web/node_modules/matrix-js-sdk/lib/index.js';
import {
  CryptoEvent, VerificationPhase, VerifierEvent,
  type CryptoApi, type ShowSasCallbacks, type VerificationRequest, type Verifier,
} from '../apps/web/node_modules/matrix-js-sdk/lib/crypto-api/index.js';
import { BASE, LOCAL, PASSWORD, envToken, ok, register, sleep } from './lib.ts';

if (!LOCAL) throw new Error('local dev server only');

const LOG = new URL('./data/spike-share-history.log', import.meta.url);
writeFileSync(LOG, '');
const sink = (...a: unknown[]) => appendFileSync(LOG, a.map((x) => (typeof x === 'string' ? x : x instanceof Error ? x.stack : JSON.stringify(x))).join(' ') + '\n');
console.log = console.info = console.debug = console.warn = console.error = console.trace = sink;
const say = (s: string) => { process.stdout.write(s + '\n'); sink('>>>>', s); };

/** The receiver/sender halves of MSC4268 are on CryptoBackend, not the public CryptoApi. */
type Backend = CryptoApi & {
  shareRoomHistoryWithUser(roomId: string, userId: string): Promise<void>;
  markRoomAsPendingKeyBundle(roomId: string, inviter: string): Promise<void>;
  maybeAcceptKeyBundle(roomId: string, inviter: string): Promise<boolean>;
};
type Dev = { label: string; local: string; user: string; client: MatrixClient; crypto: Backend; toDevice: string[] };

async function waitFor<T>(what: string, pick: () => T | Promise<T>, ms = 20_000): Promise<NonNullable<T>> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await pick();
    if (v) return v as NonNullable<T>;
    if (Date.now() > end) throw new Error(`timed out: ${what}`);
    await sleep(250);
  }
}

const uia = (local: string) => async (makeRequest: (auth: Record<string, unknown> | null) => Promise<unknown>) => {
  try { await makeRequest(null); } catch (e) {
    const session = (e as { data?: { session?: string } }).data?.session;
    if (!session) throw e;
    await makeRequest({ type: 'm.login.password', identifier: { type: 'm.id.user', user: local }, password: PASSWORD, session });
  }
};

async function device(local: string, label: string): Promise<Dev> {
  const l = await ok(null, 'POST', '/_matrix/client/v3/login', { type: 'm.login.password', identifier: { type: 'm.id.user', user: local }, password: PASSWORD, initial_device_display_name: label });
  let held: { id: string; key: Uint8Array<ArrayBuffer> } | null = null;
  const client = sdk.createClient({
    baseUrl: BASE, userId: l.user_id, deviceId: l.device_id, accessToken: l.access_token,
    cryptoCallbacks: {
      getSecretStorageKey: async ({ keys }) => (held && held.id in keys ? [held.id, held.key] : null),
      cacheSecretStorageKey: (id, _info, key) => void (held = { id, key }),
    },
  });
  await client.initRustCrypto({ useIndexedDB: false });
  const toDevice: string[] = [];
  client.on(sdk.ClientEvent.ToDeviceEvent, (e: MatrixEvent) => toDevice.push(e.getType()));
  client.startClient({ initialSyncLimit: 30 });
  await waitFor(`${label} sync`, () => client.isInitialSyncComplete());
  return { label, local, user: l.user_id, client, crypto: client.getCrypto() as Backend, toDevice };
}

const holdsKeys = async (d: Dev) => { const p = (await d.crypto.getCrossSigningStatus()).privateKeysCachedLocally; return p.masterKey && p.selfSigningKey && p.userSigningKey; };

/** New identity (fresh account or reset) + secret storage + backup, like the app's newRecoveryKey/resetEncryption. */
async function newIdentity(d: Dev, reset: boolean) {
  if (reset) await d.crypto.resetEncryption(uia(d.local));
  else await d.crypto.bootstrapCrossSigning({ setupNewCrossSigning: true, authUploadDeviceSigningKeys: uia(d.local) });
  const key = await d.crypto.createRecoveryKeyFromPassphrase();
  await d.crypto.bootstrapSecretStorage({ createSecretStorageKey: async () => key, setupNewSecretStorage: true, setupNewKeyBackup: !reset });
  await waitFor(`${d.label} identity`, async () => (await holdsKeys(d)) || (await d.crypto.bootstrapCrossSigning({ authUploadDeviceSigningKeys: uia(d.local) }).catch(() => {}), false));
  await waitFor(`${d.label} cross-signing ready`, () => d.crypto.isCrossSigningReady());
  const own = await d.crypto.getDeviceVerificationStatus(d.user, d.client.getDeviceId()!);
  if (!own?.signedByOwner) throw new Error(`${d.label}: own device not signed`);
}

async function stop(d: Dev, logout: boolean) {
  d.client.stopClient();
  if (logout) await d.client.logout(true).catch(() => {});
}

type Row = { id: string; sender: string; body: string | null; fail: boolean };
function rows(d: Dev, roomId: string): Row[] {
  const room = d.client.getRoom(roomId);
  return (room?.getLiveTimeline().getEvents() ?? [])
    .filter((e) => e.getWireType() === 'm.room.encrypted' && !e.isBeingDecrypted())
    .map((e) => ({ id: e.getId()!, sender: e.getSender()!, body: e.isDecryptionFailure() ? null : (e.getContent().body as string | undefined) ?? null, fail: e.isDecryptionFailure() }));
}
const readable = (d: Dev, roomId: string, bodies: string[]) => bodies.filter((b) => rows(d, roomId).some((r) => r.body === b));

const SHIELD = ['UNKNOWN', 'UNVERIFIED_IDENTITY', 'UNSIGNED_DEVICE', 'UNKNOWN_DEVICE', 'AUTHENTICITY_NOT_GUARANTEED', 'MISMATCHED_SENDER_KEY', 'SENT_IN_CLEAR', 'VERIFICATION_VIOLATION', 'MISMATCHED_SENDER'];
async function shields(d: Dev, roomId: string, bodies: string[]) {
  const out = new Map<string, number>();
  for (const e of d.client.getRoom(roomId)?.getLiveTimeline().getEvents() ?? []) {
    if (!bodies.includes(e.getContent().body as string)) continue;
    const info = await d.crypto.getEncryptionInfoForEvent(e);
    const k = `${['none', 'grey', 'red'][info?.shieldColour ?? 0]}/${SHIELD[info?.shieldReason ?? -1] ?? '-'} forwardedBy=${e.getKeyForwardingUser() ?? '-'}`;
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return [...out].map(([k, n]) => `${n}× ${k}`).join(', ');
}

async function manualRetry(d: Dev, roomId: string) {
  for (const e of d.client.getRoom(roomId)?.getLiveTimeline().getEvents() ?? []) {
    if (e.isDecryptionFailure()) await e.attemptDecryption(d.crypto as never, { isRetry: true });
  }
}

/** Staff verifies the client's current identity with SAS in the DM; both sides auto-confirm the emoji. */
async function verify(staff: Dev, client: Dev, roomId: string) {
  // The old (seconds-old, in this test) request from the DM still counts as ongoing on a new device; Rust then cancels both.
  const stale = client.crypto.findVerificationRequestDMInProgress(roomId, staff.user);
  if (stale) { say(`  cancelling a stale request on the client (phase ${stale.phase})`); await stale.cancel().catch(() => {}); }
  const seen: VerificationRequest[] = [];
  const onReq = (r: VerificationRequest) => void seen.push(r);
  client.client.on(CryptoEvent.VerificationRequestReceived, onReq);
  const req = await staff.crypto.requestVerificationDM(client.user, roomId);
  // A new device also replays old requests from the DM timeline; take ours.
  const theirs = await waitFor('their request', () => seen.find((r) => r.transactionId === req.transactionId));
  client.client.off(CryptoEvent.VerificationRequestReceived, onReq);
  await theirs.accept();
  await waitFor('verification ready', () => req.phase === VerificationPhase.Ready);
  const confirm = (v: Verifier) => v.on(VerifierEvent.ShowSas, (s: ShowSasCallbacks) => void s.confirm());
  const mine = await req.startVerification('m.sas.v1');
  confirm(mine);
  const other = await waitFor('their verifier', () => theirs.verifier);
  confirm(other);
  await Promise.all([mine.verify(), other.verify()]);
  const t = Date.now();
  await waitFor('staff sees client verified', async () => (await staff.crypto.getUserVerificationStatus(client.user)).isVerified(), 15_000)
    .then(() => say(`  verification visible to staff after ${Date.now() - t} ms`), () => say('  verification NOT visible to staff after 15 s'));
}

async function status(staff: Dev, client: Dev) {
  const s = await staff.crypto.getUserVerificationStatus(client.user);
  return `verified=${s.isVerified()} xsVerified=${s.isCrossSigningVerified()} wasXsVerified=${s.wasCrossSigningVerified()} needsApproval=${s.needsUserApproval}`;
}

let n = 0;
async function accounts(tag: string) {
  const token = envToken();
  const stamp = `${Date.now().toString(36)}${n++}`;
  const staff = `spk${tag.toLowerCase()}staff${stamp}`, client = `spk${tag.toLowerCase()}client${stamp}`;
  await register(staff, token);
  await register(client, token);
  return { staff, client };
}

/** Steps 1–2: DM with history on both sides, then the client loses everything and resets. */
async function setup(tag: string, opts: { verifyOld?: boolean; staffNoIdentity?: boolean } = {}) {
  const names = await accounts(tag);
  const staff = await device(names.staff, `${tag} staff`);
  const c1 = await device(names.client, `${tag} client old`);
  if (!opts.staffNoIdentity) await newIdentity(staff, false);
  await newIdentity(c1, false);
  const { room_id: roomId } = await staff.client.createRoom({
    preset: sdk.Preset.PrivateChat, is_direct: true, invite: [c1.user],
    initial_state: [{ type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } }],
  });
  await waitFor('invite', () => c1.client.getRoom(roomId)?.getMyMembership() === 'invite');
  await c1.client.joinRoom(roomId);
  await waitFor('staff sees join', () => staff.client.getRoom(roomId)?.getMember(c1.user)?.membership === 'join');
  const history: string[] = [];
  for (let i = 0; i < 3; i++) {
    for (const [from, to, who] of [[staff, c1, 'staff'], [c1, staff, 'client']] as const) {
      const body = `${tag} ${who} #${i}`;
      await from.client.sendTextMessage(roomId, body);
      await waitFor(`${to.label} reads "${body}"`, () => readable(to, roomId, [body]).length === 1);
      history.push(body);
    }
  }
  if (opts.verifyOld) {
    await verify(staff, c1, roomId);
    say(`  ${tag}: staff verified the OLD client identity: ${await status(staff, c1)}`);
  }
  await stop(c1, true);
  const c2 = await device(names.client, `${tag} client new`);
  await newIdentity(c2, true);
  await waitFor('c2 sees room', () => c2.client.getRoom(roomId));
  await sleep(1500);
  const before = readable(c2, roomId, history).length;
  say(`  ${tag}: client reset (new device + new identity); old messages readable: ${before}/${history.length}`);
  return { staff, client: c2, roomId, history, names };
}

async function share(staff: Dev, client: Dev, roomId: string) {
  const t = Date.now();
  let err = '';
  await staff.crypto.shareRoomHistoryWithUser(roomId, client.user).catch((e: unknown) => { err = String(e); });
  say(`  share: ${err || 'resolved'} in ${Date.now() - t} ms`);
}

/** After a share: did the bundle to-device arrive, and can the client import + decrypt it. */
async function receive(client: Dev, staff: Dev, roomId: string, history: string[], mode: 'pending' | 'explicit') {
  const bundle = () => client.toDevice.some((t) => /room_key_bundle/.test(t));
  const arrived = await waitFor('bundle to-device', bundle, 10_000).catch(() => false);
  say(`  client got m.room_key_bundle to-device: ${arrived ? 'yes' : 'no'} (to-device seen: ${[...new Set(client.toDevice)].join(', ') || 'none'})`);
  if (mode === 'explicit') {
    await sleep(2000);
    say(`  before accept (no pending mark): readable ${readable(client, roomId, history).length}/${history.length}`);
    const accepted = await client.crypto.maybeAcceptKeyBundle(roomId, staff.user).catch((e: unknown) => `threw ${String(e)}`);
    say(`  maybeAcceptKeyBundle → ${accepted}`);
  }
  let ok = await waitFor('history readable', () => readable(client, roomId, history).length === history.length, 8_000).catch(() => false);
  if (!ok) {
    await manualRetry(client, roomId);
    ok = readable(client, roomId, history).length === history.length;
    say(`  after manual retry: readable ${readable(client, roomId, history).length}/${history.length}`);
  } else say(`  readable ${history.length}/${history.length} (auto re-decrypt)`);
  if (readable(client, roomId, history).length) say(`  shields: ${await shields(client, roomId, history)}`);
  return ok;
}

const scenarios: Record<string, () => Promise<void>> = {
  /** Happy path: staff verifies the new identity, client marked pending before the share → auto-accept on arrival. */
  async A() {
    const { staff, client, roomId, history } = await setup('A');
    say(`  before verify: ${await status(staff, client)}`);
    await verify(staff, client, roomId);
    say(`  after verify: ${await status(staff, client)}`);
    await client.crypto.markRoomAsPendingKeyBundle(roomId, staff.user);
    await share(staff, client, roomId);
    await receive(client, staff, roomId, history, 'pending');
    // A later message from the client must still work for staff (shield of new messages).
    await client.client.sendTextMessage(roomId, 'A after restore');
    await waitFor('staff reads after-restore', () => readable(staff, roomId, ['A after restore']).length === 1);
    say(`  staff sees client's next message: ${await shields(staff, roomId, ['A after restore'])}`);
    const backedUp = async () => {
      const version = await client.crypto.getActiveSessionBackupVersion();
      const keys = version ? await ok(client.client.getAccessToken(), 'GET', `/_matrix/client/v3/room_keys/keys?version=${version}`) : {};
      return Object.keys(keys.rooms?.[roomId]?.sessions ?? {}).length;
    };
    await waitFor('backup has the restored keys', async () => (await backedUp()) >= 3, 30_000).catch(() => {});
    say(`  client's new backup holds ${await backedUp()} session(s) for the DM (2 restored + 1 new)`);
    await Promise.all([stop(staff, true), stop(client, true)]);
  },
  /** Staff never verified the client (old or new identity), shares anyway; explicit accept. */
  async B() {
    const { staff, client, roomId, history } = await setup('B');
    say(`  status: ${await status(staff, client)}`);
    await share(staff, client, roomId);
    await receive(client, staff, roomId, history, 'explicit');
    await Promise.all([stop(staff, true), stop(client, true)]);
  },
  /** Staff verified the OLD identity; client resets; staff shares without re-verifying (verification violation). */
  async C() {
    const { staff, client, roomId, history } = await setup('C', { verifyOld: true });
    say(`  status after reset: ${await status(staff, client)}`);
    await share(staff, client, roomId);
    await receive(client, staff, roomId, history, 'explicit');
    say('  C2: staff re-verifies the new identity, then shares again');
    await verify(staff, client, roomId);
    say(`  status: ${await status(staff, client)}`);
    await share(staff, client, roomId);
    await receive(client, staff, roomId, history, 'explicit');
    await Promise.all([stop(staff, true), stop(client, true)]);
  },
  /** Staff verifies the new identity, then the client resets AGAIN (third identity) before the share. */
  async D() {
    const { staff, client, roomId, history, names } = await setup('D');
    await verify(staff, client, roomId);
    say(`  after verify: ${await status(staff, client)}`);
    await stop(client, true);
    const c3 = await device(names.client, 'D client newest');
    await newIdentity(c3, true);
    await waitFor('c3 sees room', () => c3.client.getRoom(roomId));
    await sleep(1500);
    say(`  client reset again; status: ${await status(staff, c3)}`);
    await share(staff, c3, roomId);
    await receive(c3, staff, roomId, history, 'explicit');
    await Promise.all([stop(staff, true), stop(c3, true)]);
  },
  /** Staff's own device has no cross-signing identity (an unconfirmed device behaves the same way in the SDK). */
  async E() {
    const { staff, client, roomId, history } = await setup('E', { staffNoIdentity: true });
    await share(staff, client, roomId);
    await receive(client, staff, roomId, history, 'explicit');
    await Promise.all([stop(staff, true), stop(client, true)]);
  },
};

const pick = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios);
for (const k of pick) {
  say(`== ${k}`);
  try { await scenarios[k]!(); } catch (e) { say(`  FAILED: ${(e as Error).stack?.split('\n').slice(0, 3).join(' | ')}`); }
}
process.exit(0);
