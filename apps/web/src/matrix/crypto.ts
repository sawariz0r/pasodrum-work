// M6 (D-31): this device's encryption state, device confirmation (SAS emoji), recovery key and server key backup.
// SIDE-03: the same emoji step with another person (user verification), before sharing history with them.
import { ClientEvent, ClientPrefix, MatrixError, Method, type AuthDict, type MatrixClient, type MatrixEvent } from 'matrix-js-sdk';
import {
  CryptoEvent, decodeRecoveryKey, VerificationPhase, VerificationRequestEvent, VerifierEvent,
  type CryptoApi, type CryptoCallbacks, type ShowSasCallbacks, type VerificationRequest, type Verifier,
} from 'matrix-js-sdk/lib/crypto-api';
import type { UIAuthCallback } from 'matrix-js-sdk/lib/interactive-auth';
import { platform } from '../platform';
import { createTabs, type Tabs } from './tabs';
import type { Confirmation, Person, SasEmoji, Security } from './types';

export const CRYPTO_DB = 'pasodrum-crypto';
/** RulesM6: no answer within 2 minutes = timeout. */
export const CONFIRM_TIMEOUT = 120_000;
const noop = () => {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Deleting IndexedDB waits for every open connection (another tab): don't let that hang sign-out. */
export const withTimeout = (p: Promise<unknown>, ms = 3_000) => Promise.race([p.catch(noop), sleep(ms)]);

// Matrix SAS emoji table (spec order), by name: the index is what the UI turns into EN/JP names.
const SAS_NAMES = (
  'dog cat lion horse unicorn pig elephant rabbit panda rooster penguin turtle fish octopus butterfly flower tree cactus mushroom globe ' +
  'moon cloud fire banana apple strawberry corn pizza cake heart smiley robot hat glasses spanner santa thumbsup umbrella hourglass clock ' +
  'gift lightbulb book pencil paperclip scissors lock key hammer telephone flag train bicycle aeroplane rocket trophy ball guitar trumpet bell ' +
  'anchor headphones folder pin'
).split(' ');
export const sasEmoji = (list: [string, string][]): SasEmoji[] =>
  list.map(([emoji, name]) => ({ emoji, index: SAS_NAMES.indexOf(name.toLowerCase().replace(/[^a-z]/g, '')) }));

/** Whitespace and dashes don't matter, full-width input (Japanese IME) is folded. Case does: the key is base58. */
export const normalizeRecoveryKey = (key: string) => key.normalize('NFKC').replace(/[\s-]+/g, '');
export function parseRecoveryKey(key: string): Uint8Array<ArrayBuffer> | null {
  try {
    return decodeRecoveryKey(normalizeRecoveryKey(key));
  } catch {
    return null;
  }
}

/** The secret storage key for this session (memory only): set by useRecoveryKey / newRecoveryKey, read by the crypto stack. */
export interface KeyHolder {
  current: { id: string; key: Uint8Array<ArrayBuffer> } | null;
}
export const cryptoCallbacks = (keys: KeyHolder): CryptoCallbacks => ({
  getSecretStorageKey: async ({ keys: wanted }) => {
    const held = keys.current;
    return held && held.id in wanted ? [held.id, held.key] : null;
  },
  cacheSecretStorageKey: (id, _info, key) => void (keys.current = { id, key }),
});

/** Rust crypto refuses a store that belongs to another account or device; only then is wiping it right. */
export const isStoreMismatch = (e: unknown) => /account in the store doesn't match/i.test(String((e as Error | undefined)?.message ?? e));

/** Keys this device holds that the server backup doesn't have yet. */
export type BackupCounts = { total: number; backedUp: number };
export function signOutRiskOf(f: { confirmed: boolean; others: number; hasEncrypted: boolean; backupWorks: boolean; counts?: BackupCounts }): 'none' | 'last-device' | 'no-backup' {
  if (!f.confirmed || !f.hasEncrypted) return 'none';
  const pending = f.counts ? f.counts.total - f.counts.backedUp : 0;
  if (!f.backupWorks || pending > 0) return 'no-backup';
  return f.others === 0 ? 'last-device' : 'none';
}

/** D-31 + review: the save step shows whenever this device could make a key and the account lacks any part of the setup. */
export function needsRecoveryKeyOf(f: { confirmed: boolean; identity: boolean; holdsKeys: boolean; defaultKey: boolean; usableBackup: boolean; unfinished: boolean }) {
  const canMake = !f.identity || f.holdsKeys;
  return f.confirmed && canMake && (f.unfinished || !f.defaultKey || !f.identity || !f.usableBackup);
}

const uiaSession = (e: unknown) => (e instanceof MatrixError && e.httpStatus === 401 && Array.isArray(e.data.flows) ? String(e.data.session ?? '') : undefined);
const FINISHED = new Set<Confirmation['phase']>(['done', 'declined', 'timeout', 'mismatch']);

export interface SecurityController {
  state(): Security;
  /** Rust crypto (IndexedDB when there is one); false when it can't load. Call before startClient. */
  init(): Promise<boolean>;
  refresh(): void;
  /** For devices(): cross-signed by the account (this device: as the snapshot says). */
  confirmed(deviceIds: string[]): Promise<Set<string>>;
  requestConfirmation(): void;
  acceptConfirmation(): void;
  declineConfirmation(): void;
  confirmEmoji(match: boolean): void;
  dismissConfirmation(): void;
  useRecoveryKey(key: string): Promise<void>;
  newRecoveryKey(password?: string): Promise<string>;
  resetEncryption(password: string): Promise<string>;
  signOutRisk(hasEncrypted: boolean): Promise<'none' | 'last-device' | 'no-backup'>;
  /** SIDE-03: emoji with another person, over our DM `roomId`; needs a confirmed device. */
  requestPersonConfirmation(otherId: string, roomId: string): void;
  /** SIDE-03: their current identity is verified by mine (fresh key query first, so a reset counts). */
  personConfirmed(otherId: string): Promise<boolean>;
  /** SIDE-03: they have at least one device signed by their current identity (where the history can go). */
  hasSignedDevice(otherId: string): Promise<boolean>;
  /** SIDE-03: this device is cross-signed by the account's identity (the SDK shares history only then, silently). */
  deviceVerified(): Promise<boolean>;
  /** D-33, device 'elsewhere': ask the tab holding this device to stop; this tab starts once it has. */
  useHere(): void;
  /** Stops for good: timers, the in-memory recovery key, and the store lock. */
  stop(): void;
}

export function createSecurity(
  client: MatrixClient,
  keys: KeyHolder,
  userId: string,
  deviceId: string,
  onChange: () => void,
  personOf: (id: string) => Person = (id) => ({ id, name: id }),
): SecurityController {
  let state: Security = { device: 'starting', otherConfirmedDevices: 0, needsRecoveryKey: false };
  let crypto: CryptoApi | undefined;
  let req: VerificationRequest | undefined;
  let role: Confirmation['role'] = 'new';
  let sas: ShowSasCallbacks | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelledHere = false;
  let stopped = false;
  let release = noop;
  let tabs: Tabs | null = null;
  /** A newRecoveryKey / resetEncryption that changed something and didn't finish: the save step must come back. */
  let unfinished = false;
  let backupChecked = false;
  const watched = new WeakSet<Verifier>();
  /** Person role: 'done' waits until my signature on their identity has landed (personConfirmed is true then). */
  const vouching = new WeakSet<VerificationRequest>();
  const vouched = new WeakSet<VerificationRequest>();

  const set = (next: Security) => {
    if (stopped || JSON.stringify(next) === JSON.stringify(state)) return;
    state = next;
    onChange();
  };
  const setConfirmation = (c: Confirmation | undefined) => {
    const next: Security = { device: state.device, otherConfirmedDevices: state.otherConfirmedDevices, needsRecoveryKey: state.needsRecoveryKey };
    set(c ? { ...next, confirmation: c } : next);
  };
  const patchConfirmation = (patch: Partial<Confirmation>) => state.confirmation && setConfirmation({ ...state.confirmation, ...patch });

  const deviceName = async (id: string | undefined) => {
    if (!id || !crypto) return undefined;
    const d = (await crypto.getUserDeviceInfo([userId]).catch(() => undefined))?.get(userId)?.get(id);
    return d?.displayName || id;
  };

  // State
  /** This device: trusted through the account's identity. Others: signed by the account (an unconfirmed device can't trust them yet). */
  const verified = async (id: string) => {
    const s = await crypto?.getDeviceVerificationStatus(userId, id);
    return !!(id === deviceId ? s?.crossSigningVerified : s?.signedByOwner);
  };
  // Downloads my keys once; afterwards the crypto store keeps them current. (Downloading on every refresh loops:
  // my own user never counts as tracked, and each download fires DevicesUpdated.)
  let downloaded = false;
  /** A server backup this device can both write to and read (its key is here). */
  const usableBackup = async () => !!(await crypto!.getActiveSessionBackupVersion()) && !!(await crypto!.getSessionBackupPrivateKey());
  /** From the crypto machine (not in the public API): keys held vs keys in the backup. */
  const roomKeyCounts = async (): Promise<BackupCounts | undefined> => {
    const machine = (crypto as unknown as { olmMachine?: { roomKeyCounts(): Promise<BackupCounts> } } | undefined)?.olmMachine;
    const counts = await machine?.roomKeyCounts().catch(() => undefined);
    return counts && { total: counts.total, backedUp: counts.backedUp };
  };
  async function compute() {
    if (!crypto) return;
    // Until the startup backup check is done, "no backup" can't be told from "not checked yet".
    if (!backupChecked) {
      await crypto.checkKeyBackupAndEnable();
      backupChecked = true;
    }
    const download = !downloaded;
    const [identity, mine, defaultKey, xs, devices, backup] = await Promise.all([
      crypto.userHasCrossSigningKeys(userId, download),
      verified(deviceId),
      client.secretStorage.getDefaultKeyId(),
      crypto.getCrossSigningStatus(),
      crypto.getUserDeviceInfo([userId], download),
      usableBackup(),
    ]);
    downloaded = true;
    let others = 0;
    for (const [id, d] of devices.get(userId) ?? []) if (id !== deviceId && !d.dehydrated && (await verified(id))) others++;
    // No identity yet: this is the account's first device; it confirms itself by making the recovery key.
    const confirmed = !identity || mine;
    const p = xs.privateKeysCachedLocally;
    set({
      ...state,
      device: confirmed ? 'confirmed' : 'unconfirmed',
      otherConfirmedDevices: others,
      needsRecoveryKey: needsRecoveryKeyOf({
        confirmed, identity, holdsKeys: p.masterKey && p.selfSigningKey && p.userSigningKey, defaultKey: !!defaultKey, usableBackup: backup, unfinished,
      }),
    });
  }
  let running: Promise<void> | null = null;
  let again = false;
  let backoff = 1_000;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const refresh = () => {
    if (!crypto || stopped) return;
    if (running) return void (again = true);
    clearTimeout(retry);
    running = compute()
      .then(
        () => void (backoff = 1_000),
        () => {
          retry = setTimeout(refresh, backoff);
          backoff = Math.min(backoff * 2, 30_000);
        },
      )
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          refresh();
        }
      });
  };
  const settled = async () => {
    refresh();
    while (running) await running;
  };
  /**
   * Our own new signature reaches the local store only with a fresh key query, and Continuwuity doesn't flag my own
   * keys as changed after I sign: mark them stale so the next sync (woken by the account data we write) re-queries.
   */
  const requery = () => (crypto as (CryptoApi & { markAllTrackedUsersAsDirty?: () => Promise<void> }) | undefined)?.markAllTrackedUsersAsDirty?.().catch(noop);
  const untilVerified = async (ms = 10_000) => {
    const end = Date.now() + ms;
    while (!(await verified(deviceId)) && Date.now() < end) await sleep(300);
    await settled();
  };

  // Confirmation
  const clear = () => {
    clearTimeout(timer);
    req = undefined;
    sas = undefined;
    cancelledHere = false;
  };
  const cancel = () => {
    const r = req;
    if (!r) return;
    cancelledHere = true;
    void r.cancel({ code: 'm.user', reason: 'Cancelled' }).catch(noop);
  };
  const personVerified = async (id: string) => !!(await crypto?.getUserVerificationStatus(id).catch(() => undefined))?.isVerified();
  const finish = (r: VerificationRequest, phase: Confirmation['phase']) => {
    if (req !== r || !state.confirmation || FINISHED.has(state.confirmation.phase)) return;
    if (phase === 'done' && role === 'person' && !vouched.has(r)) {
      if (vouching.has(r)) return;
      vouching.add(r);
      void (async () => {
        for (const end = Date.now() + 10_000; Date.now() < end && !(await personVerified(r.otherUserId)); ) await sleep(300);
      })().finally(() => {
        vouched.add(r);
        finish(r, 'done');
      });
      return;
    }
    clearTimeout(timer);
    sas = undefined;
    patchConfirmation({ phase });
    if (phase === 'done') void settled();
  };
  const watch = (r: VerificationRequest, v: Verifier) => {
    if (watched.has(v)) return;
    watched.add(v);
    const show = (s: ShowSasCallbacks) => {
      if (req !== r) return;
      sas = s;
      patchConfirmation({ phase: 'compare', emoji: sasEmoji(s.sas.emoji ?? []) });
    };
    v.on(VerifierEvent.ShowSas, show);
    const ready = v.getShowSasCallbacks();
    if (ready) show(ready);
    v.verify().then(() => finish(r, 'done'), noop);
  };
  const onCancelled = (r: VerificationRequest) => {
    if (req !== r) return;
    const code = r.cancellationCode;
    const c = state.confirmation;
    if (cancelledHere || !c || FINISHED.has(c.phase)) return;
    if (code === 'm.mismatched_sas' || code === 'm.key_mismatch' || code === 'm.mismatched_commitment') return finish(r, 'mismatch');
    if (asking(r, role)) return finish(r, code === 'm.timeout' ? 'timeout' : 'declined');
    // Approver: the new device gave up, or another of my devices answered. Person who asked me: they gave up.
    clear();
    setConfirmation(undefined);
  };
  /** This side asked (and sees declined/timeout); the other side's card just goes away. */
  const asking = (r: VerificationRequest, as: Confirmation['role']) => as === 'new' || (as === 'person' && r.initiatedByMe);
  const track = (r: VerificationRequest, as: Confirmation['role']) => {
    clear();
    req = r;
    role = as;
    timer = setTimeout(() => {
      if (req !== r || !state.confirmation || FINISHED.has(state.confirmation.phase)) return;
      cancelledHere = true;
      void r.cancel({ code: 'm.timeout', reason: 'Timed out' }).catch(noop);
      if (!asking(r, as)) {
        clear();
        return setConfirmation(undefined);
      }
      clearTimeout(timer);
      sas = undefined;
      patchConfirmation({ phase: 'timeout' });
    }, CONFIRM_TIMEOUT);
    let starting = false;
    const changed = () => {
      if (req !== r) return void r.off(VerificationRequestEvent.Change, changed);
      if (r.phase === VerificationPhase.Ready && as === 'new' && !r.verifier && !starting) {
        starting = true;
        void (async () => {
          // Only a device the account signed can vouch for this one; another unconfirmed device's answer starts over.
          if (!r.otherDeviceId || !(await verified(r.otherDeviceId))) {
            if (req !== r) return;
            cancelledHere = true;
            void r.cancel({ code: 'm.user', reason: 'Not a confirmed device' }).catch(noop);
            return void (restarts++ < 3 ? ask() : finish(r, 'declined'));
          }
          const otherDevice = await deviceName(r.otherDeviceId);
          if (req !== r) return;
          if (otherDevice) patchConfirmation({ otherDevice });
          // The device that asked starts the emoji step (as Element does).
          r.startVerification('m.sas.v1').then((v) => watch(r, v), noop);
        })();
      }
      // Person: whoever asked starts the emoji step once the other side has said yes.
      if (r.phase === VerificationPhase.Ready && as === 'person' && r.initiatedByMe && !r.verifier && !starting) {
        starting = true;
        r.startVerification('m.sas.v1').then((v) => watch(r, v), noop);
      }
      if (r.verifier) watch(r, r.verifier);
      if (r.phase === VerificationPhase.Done) finish(r, 'done');
      if (r.phase === VerificationPhase.Cancelled) onCancelled(r);
    };
    r.on(VerificationRequestEvent.Change, changed);
    changed();
  };

  const incoming = async (r: VerificationRequest) => {
    if (r.initiatedByMe || r.phase !== VerificationPhase.Requested) return;
    const c = state.confirmation;
    // SIDE-03: another person asks to compare emoji (only a confirmed device can sign their identity).
    if (!r.isSelfVerification && r.otherUserId !== userId) {
      if (state.device !== 'confirmed' || (c && !FINISHED.has(c.phase))) return;
      track(r, 'person');
      return setConfirmation({ role: 'person', person: personOf(r.otherUserId), phase: 'asked' });
    }
    if (!r.isSelfVerification || r.otherUserId !== userId) return;
    // Approving means signing the new device: only a device holding the account's keys can. My own devices come
    // first: an open person confirmation gives way.
    const busy = (x = state.confirmation) => !!x && x.role !== 'person' && !FINISHED.has(x.phase);
    if (state.device !== 'confirmed' || !(await verified(deviceId)) || !(await holdsKeys()) || busy(c)) return;
    const otherDevice = await deviceName(r.otherDeviceId);
    if (r.phase !== VerificationPhase.Requested || busy()) return;
    if (state.confirmation?.role === 'person' && !FINISHED.has(state.confirmation.phase)) cancel();
    track(r, 'approver');
    setConfirmation({ role: 'approver', ...(otherDevice ? { otherDevice } : {}), phase: 'asked' });
  };

  // Keys
  const passwordAuth = (password: string, session: string): AuthDict => ({ type: 'm.login.password', identifier: { type: 'm.id.user', user: userId }, password, ...(session ? { session } : {}) });
  /**
   * With the password, sends it at once (Continuwuity takes it without a UIA session): one round trip keeps the gap
   * for the race newIdentity handles small. Without it, tries bare and asks for it when the server wants it.
   */
  const uia = (password?: string): UIAuthCallback<void> => async (makeRequest) => {
    const wrong = (e: unknown) => e instanceof MatrixError && e.httpStatus === 401 && e.errcode === 'M_FORBIDDEN';
    if (!password) {
      try {
        return await makeRequest(null);
      } catch (e) {
        throw uiaSession(e) !== undefined ? new Error('password-required') : e;
      }
    }
    try {
      return await makeRequest(passwordAuth(password, ''));
    } catch (e) {
      if (wrong(e)) throw new Error('wrong-password');
      const session = uiaSession(e);
      if (!session) throw e;
      try {
        return await makeRequest(passwordAuth(password, session));
      } catch (err) {
        throw wrong(err) || uiaSession(err) !== undefined ? new Error('wrong-password') : err;
      }
    }
  };
  const holdsKeys = async () => {
    const p = (await crypto!.getCrossSigningStatus()).privateKeysCachedLocally;
    return p.masterKey && p.selfSigningKey && p.userSigningKey;
  };
  /** A new recovery key and secret storage; backup: 'new' starts a new backup, 'keep' moves the readable one's key over. */
  const newSecretStorage = async (backup: 'new' | 'keep') => {
    const key = await crypto!.createRecoveryKeyFromPassphrase();
    await crypto!.bootstrapSecretStorage({ createSecretStorageKey: async () => key, setupNewSecretStorage: true, setupNewKeyBackup: backup === 'new' });
    return key.encodedPrivateKey!;
  };
  /**
   * New identity keys go into secret storage before they're published (the SDK does that when storage exists). A key
   * query already in flight then can return the old identity and make the crypto store drop the new private keys;
   * when it does, read them back from storage once the new identity has arrived.
   */
  const newIdentity = async (password: string | undefined, replace: boolean) => {
    await crypto!.bootstrapCrossSigning({ setupNewCrossSigning: replace, authUploadDeviceSigningKeys: uia(password) });
    await requery();
    for (let i = 0; i < 20 && !(await holdsKeys()); i++) {
      await sleep(500);
      await crypto!.bootstrapCrossSigning({ authUploadDeviceSigningKeys: uia() }).catch(noop);
    }
  };
  let busy: Promise<unknown> = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const next = busy.catch(noop).then(run);
    busy = next;
    return next;
  };
  const needCrypto = () => {
    if (!crypto) throw new Error('other');
    return crypto;
  };

  let restarts = 0;
  const ask = () => {
    if (!crypto) return;
    const asked = state.confirmation;
    crypto.requestOwnUserVerification().then(
      (r) => {
        if (state.confirmation !== asked) return void r.cancel().catch(noop);
        track(r, 'new');
      },
      () => state.confirmation === asked && patchConfirmation({ phase: 'timeout' }),
    );
  };

  const setDevice = (device: Security['device']) => set({ ...state, device });

  /** Resolves once no reset / new recovery key is running (one may be queued behind another). */
  const settledSerial = async () => {
    for (let b = busy; ; b = busy) {
      await b.catch(noop);
      if (b === busy) return;
    }
  };

  /** D-33: waits for this browser's crypto store; another tab holding it means 'elsewhere' until it yields. */
  const acquire = async () => {
    // Per account: tabs signed in to another account never ask this one (they share the store lock, D-33).
    tabs = createTabs(platform, CRYPTO_DB, `${CRYPTO_DB}-tabs:${userId}`, settledSerial);
    const unlock = await tabs.acquire(() => setDevice('elsewhere'));
    if (stopped) {
      unlock();
      return false;
    }
    release = unlock;
    if (state.device === 'elsewhere') setDevice('starting');
    return true;
  };

  /** One running crypto per store: a second tab waits (D-33). */
  const start = async () => {
    const useIndexedDB = typeof indexedDB !== 'undefined';
    if (useIndexedDB && !(await acquire())) return false;
    for (let wait = 2_000; !stopped; wait = Math.min(wait * 2, 30_000)) {
      try {
        await client.initRustCrypto({ useIndexedDB, cryptoDatabasePrefix: CRYPTO_DB });
        break;
      } catch (e) {
        // Only a store that belongs to another account or device is wiped; anything else (WASM didn't load,
        // IndexedDB hiccup) leaves it alone and tries again.
        if (isStoreMismatch(e)) await withTimeout(client.clearStores({ cryptoDatabasePrefix: CRYPTO_DB }));
        else await sleep(wait);
      }
    }
    crypto = client.getCrypto();
    if (!crypto || stopped) return false;
    void platform.persistStorage().catch(noop);
    client.on(CryptoEvent.VerificationRequestReceived, (r) => void incoming(r));
    client.on(CryptoEvent.UserTrustStatusChanged, (id) => refreshOn([id]));
    client.on(CryptoEvent.DevicesUpdated, refreshOn);
    client.on(CryptoEvent.KeysChanged, refresh);
    client.on(CryptoEvent.KeyBackupStatus, refresh);
    client.on(CryptoEvent.KeyBackupDecryptionKeyCached, refresh);
    client.on(ClientEvent.AccountData, onAccountData);
    return true;
  };

  const refreshOn = (ids: string[]) => ids.includes(userId) && refresh();
  const onAccountData = (ev: MatrixEvent) => (ev.getType().startsWith('m.secret_storage') || ev.getType().startsWith('m.cross_signing')) && refresh();

  return {
    state: () => state,
    init: start,
    refresh,
    async confirmed(ids) {
      const out = new Set<string>();
      for (const id of ids) if (id === deviceId ? state.device === 'confirmed' : await verified(id)) out.add(id);
      return out;
    },
    requestConfirmation() {
      if (!crypto || state.device !== 'unconfirmed') return;
      cancel();
      clear();
      role = 'new';
      restarts = 0;
      setConfirmation({ role: 'new', phase: 'waiting' });
      ask();
    },
    acceptConfirmation() {
      const answering = role === 'approver' || (role === 'person' && !req?.initiatedByMe);
      if (answering && req?.phase === VerificationPhase.Requested && !req.accepting) void req.accept().catch(noop);
    },
    declineConfirmation() {
      cancel();
      clear();
      setConfirmation(undefined);
    },
    confirmEmoji(match) {
      const s = sas;
      const r = req;
      if (!s || !r || state.confirmation?.phase !== 'compare') return;
      if (match) {
        patchConfirmation({ phase: 'matched' });
        s.confirm().catch(noop);
      } else {
        cancelledHere = true;
        s.mismatch();
        finish(r, 'mismatch');
      }
    },
    dismissConfirmation() {
      const c = state.confirmation;
      if (c && !FINISHED.has(c.phase)) cancel();
      clear();
      setConfirmation(undefined);
    },
    useRecoveryKey: (key) =>
      serial(async () => {
        const c = needCrypto();
        const raw = parseRecoveryKey(key);
        const current = raw && (await client.secretStorage.getKey());
        if (!raw || !current || !(await client.secretStorage.checkKey(raw, current[1]))) throw new Error('wrong-key');
        keys.current = { id: current[0], key: raw };
        await c.userHasCrossSigningKeys(userId, true);
        await c.bootstrapCrossSigning({ authUploadDeviceSigningKeys: uia() });
        if (!(await verified(deviceId))) await c.crossSignDevice(deviceId).catch(noop);
        await requery();
        await c.loadSessionBackupPrivateKeyFromSecretStorage().catch(noop);
        await c.checkKeyBackupAndEnable().catch(noop);
        await untilVerified();
        if (state.confirmation?.role === 'new') {
          cancel();
          clear();
          setConfirmation(undefined);
        }
        // Older messages: whatever the backup has, in the background; each message fades in as its key lands.
        void c.restoreKeyBackup().catch(noop);
      }),
    newRecoveryKey: (password) =>
      serial(async () => {
        const c = needCrypto();
        // After the startup backup check, so "this device can't read it" means exactly that.
        await c.checkKeyBackupAndEnable().catch(noop);
        backupChecked = true;
        const existing = await c.userHasCrossSigningKeys(userId, true);
        // Without this device holding the keys, making one would replace the account's identity: that is resetEncryption.
        if (existing && !(await holdsKeys())) throw new Error('other');
        // Never delete a backup this device can't read: the existing recovery key (useRecoveryKey) opens it first.
        const onServer = await c.getKeyBackupInfo();
        const readable = await usableBackup();
        if (onServer && !readable) throw new Error('backup-unreadable');
        unfinished = true;
        const key = await newSecretStorage(readable ? 'keep' : 'new');
        if (!existing) await newIdentity(password, false);
        await c.checkKeyBackupAndEnable().catch(noop);
        if (!(await usableBackup())) throw new Error('other');
        unfinished = false;
        await untilVerified(3_000);
        return key;
      }).finally(refresh),
    resetEncryption: (password) =>
      serial(async () => {
        const c = needCrypto();
        // Check the password before anything changes: deleting no devices is guarded by it and does nothing.
        await uia(password)((auth) => client.http.authedRequest<void>(Method.Post, '/delete_devices', undefined, { devices: [], ...(auth ? { auth } : {}) }, { prefix: ClientPrefix.V3 }));
        unfinished = true;
        const key = await newSecretStorage('keep');
        await newIdentity(password, true);
        // A new backup (the old ones are deleted), signed by the new identity; its key goes into the new storage.
        // If this fails the error goes up and `unfinished` keeps the save step coming back.
        await c.resetKeyBackup();
        await c.checkKeyBackupAndEnable();
        unfinished = false;
        cancel();
        clear();
        setConfirmation(undefined);
        await untilVerified();
        return key;
      }).finally(refresh),
    async signOutRisk(hasEncrypted) {
      if (!crypto) return 'none';
      await settled();
      const backupWorks = (await usableBackup()) && !!(await client.secretStorage.getDefaultKeyId());
      // Give the backup a moment to catch up with keys from the last few seconds.
      let counts = await roomKeyCounts();
      for (let i = 0; backupWorks && counts && counts.backedUp < counts.total && i < 10; i++) {
        await sleep(300);
        counts = await roomKeyCounts();
      }
      return signOutRiskOf({ confirmed: state.device === 'confirmed', others: state.otherConfirmedDevices, hasEncrypted, backupWorks, ...(counts ? { counts } : {}) });
    },
    requestPersonConfirmation(otherId, roomId) {
      if (!crypto || state.device !== 'confirmed' || otherId === userId) return;
      cancel();
      clear();
      role = 'person';
      setConfirmation({ role: 'person', person: personOf(otherId), phase: 'waiting' });
      const asked = state.confirmation;
      const c = crypto;
      void (async () => {
        // An unfinished request of mine in this DM would make the crypto stack cancel both.
        await c.findVerificationRequestDMInProgress(roomId, otherId)?.cancel().catch(noop);
        const r = await c.requestVerificationDM(otherId, roomId);
        if (state.confirmation !== asked) return void r.cancel().catch(noop);
        track(r, 'person');
      })().catch(() => state.confirmation === asked && patchConfirmation({ phase: 'timeout' }));
    },
    async personConfirmed(otherId) {
      if (!crypto) return false;
      await crypto.getUserDeviceInfo([otherId], true).catch(noop);
      return personVerified(otherId);
    },
    async hasSignedDevice(otherId) {
      if (!crypto) return false;
      const devices = (await crypto.getUserDeviceInfo([otherId], true).catch(() => undefined))?.get(otherId);
      for (const id of devices?.keys() ?? []) if ((await crypto.getDeviceVerificationStatus(otherId, id))?.signedByOwner) return true;
      return false;
    },
    deviceVerified: async () => state.device === 'confirmed' && (await verified(deviceId)),
    useHere() {
      if (state.device === 'elsewhere') tabs?.useHere();
    },
    stop() {
      stopped = true;
      tabs?.close();
      tabs = null;
      clearTimeout(timer);
      clearTimeout(retry);
      keys.current = null;
      release();
      release = noop;
    },
  };
}
