// SIDE-03: a team person gives an outside person back the history of their DM after a reset (MSC4268 key bundle).
// The bundle calls aren't on the public CryptoApi; they're used only here, with matrix-js-sdk pinned to 45.1.0.
import type { MatrixClient, MatrixEvent, Room } from 'matrix-js-sdk';

export const HISTORY_SHARED = 'work.pasodrum.history_shared';
/** Bundle accept attempts after a marker: the bundle can arrive after it, and to-device can drop. */
const RETRY_MS = [0, 2_000, 5_000, 15_000, 30_000, 60_000];

interface Bundles {
  shareRoomHistoryWithUser(roomId: string, userId: string): Promise<void>;
  maybeAcceptKeyBundle(roomId: string, inviter: string): Promise<boolean>;
  markRoomAsPendingKeyBundle(roomId: string, inviter: string): Promise<void>;
}
const bundlesOf = (client: MatrixClient) => client.getCrypto() as unknown as Bundles | undefined;

/** D-05: a notice every app shows, plus who it's for. */
export const markerContent = (to: string, toName: string) => ({
  msgtype: 'm.notice',
  body: `Shared the earlier messages in this conversation with ${toName}.`,
  [HISTORY_SHARED]: { user_id: to },
});
/** Who a marker gave the history to. */
export const markerFor = (content: Record<string, unknown>): string | undefined => {
  const to = (content[HISTORY_SHARED] as { user_id?: unknown } | undefined)?.user_id;
  return typeof to === 'string' ? to : undefined;
};

export interface ShareChecks {
  allowed: boolean;
  deviceConfirmed: () => Promise<boolean>;
  personConfirmed: () => Promise<boolean>;
  /** They have a device signed by their current identity: otherwise the SDK sends the keys to nobody. */
  recipientReady: () => Promise<boolean>;
}

/** Both trust checks are ours: the SDK shares with unconfirmed people, and from an unconfirmed device sends nothing without an error. */
export async function shareHistory(client: MatrixClient, roomId: string, userId: string, toName: string, checks: ShareChecks) {
  if (!checks.allowed) throw new Error('not-allowed');
  if (!(await checks.deviceConfirmed())) throw new Error('device-unconfirmed');
  if (!(await checks.personConfirmed())) throw new Error('not-confirmed');
  if (!(await checks.recipientReady())) throw new Error('not-ready');
  const bundles = bundlesOf(client);
  if (!bundles) throw new Error('failed');
  try {
    await bundles.shareRoomHistoryWithUser(roomId, userId);
    await client.sendMessage(roomId, markerContent(userId, toName) as never);
  } catch (e) {
    throw new Error('failed', { cause: e });
  }
}

/**
 * Receiving side: a marker addressed to me makes the app take the bundle its sender sent. If it hasn't arrived yet the room
 * is marked as waiting (the SDK then takes it on arrival, for 24 h) and we try again a few times. Each marker once per session.
 */
export function createBundleReceiver(client: MatrixClient, me: string, isMine: (room: Room, sender: string) => boolean, onRestored: (room: Room) => void) {
  const handled = new Set<string>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  /** Messages that failed before the keys came: try them again (the SDK retries only the ones it still tracks). */
  const redecrypt = async (room: Room) => {
    const crypto = client.getCrypto();
    if (!crypto) return;
    const failed = room.getLiveTimeline().getEvents().filter((e) => e.isDecryptionFailure());
    await Promise.all(failed.map((e) => e.attemptDecryption(crypto as never, { isRetry: true }).catch(() => {})));
    onRestored(room);
  };

  const accept = (room: Room, sender: string, attempt: number) => {
    if (stopped || attempt >= RETRY_MS.length) return;
    const t = setTimeout(async () => {
      timers.delete(t);
      const bundles = bundlesOf(client);
      if (stopped || !bundles) return;
      const ok = await bundles.maybeAcceptKeyBundle(room.roomId, sender).catch(() => false);
      if (ok) return void (await redecrypt(room));
      if (attempt === 0) await bundles.markRoomAsPendingKeyBundle(room.roomId, sender).catch(() => {});
      // The SDK may have taken it on arrival meanwhile: retry the failed messages anyway.
      if (attempt > 0) await redecrypt(room);
      accept(room, sender, attempt + 1);
    }, RETRY_MS[attempt]);
    timers.add(t);
  };

  return {
    /** Call for each decrypted event. */
    seen(ev: MatrixEvent, room: Room | null) {
      const id = ev.getId();
      const sender = ev.getSender();
      if (!room || !id || !sender || sender === me || handled.has(id) || ev.isRedacted()) return;
      if (markerFor(ev.getContent()) !== me || !isMine(room, sender)) return;
      handled.add(id);
      accept(room, sender, 0);
    },
    stop() {
      stopped = true;
      timers.forEach(clearTimeout);
    },
  };
}
