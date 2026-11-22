import type { TFunction } from 'i18next';
import type { Dm, Message, WorkspaceSnapshot } from '../../matrix';
import { previewText } from '../pages/Preview';
import { channelPath, dmPath, threadPath } from '../places';

type Snap = Pick<WorkspaceSnapshot, 'me' | 'spaces' | 'channels' | 'dms' | 'activity'>;

export type Notice = { tag: string; title: string; body: string; route: string };

/** Unread mentions + DMs: the same things that notify (muted channels count no mentions). */
export function badgeCount(x: Pick<WorkspaceSnapshot, 'channels' | 'dms'>): number {
  let n = 0;
  for (const list of Object.values(x.channels)) for (const c of list) n += c.mentions;
  for (const d of x.dms) n += d.unread;
  return n;
}

/** The conversation on screen, from the path: `/w/<space>/c/<id>`, `/w/<space>/dm/<id>`, `/dms/<id>`. */
export function openConversation(pathname: string): string | undefined {
  const m = /^\/(?:w\/[^/]+\/(?:c|dm)|dms)\/([^/]+)/.exec(pathname);
  return m?.[1] ? decodeURIComponent(m[1]) : undefined;
}

/**
 * New DMs and mentions between two snapshots. `since`: older messages never notify (history arriving at start).
 * `open`: the conversation on screen while the window has focus; it never notifies.
 */
export function notices(prev: Snap, next: Snap, { since, open, t }: { since: number; open?: string; t: TFunction }): Notice[] {
  const out: Notice[] = [];
  const meId = next.me.id;

  // A DM notifies once per last message, when it first becomes unread and readable (counts and decryption can lag the message).
  const ready = (d: Dm | undefined): d is Dm & { last: Message } =>
    !!d?.last && d.unread > 0 && d.last.sender.id !== meId && d.last.kind !== 'undecryptable' && d.last.ts >= since;
  if (next.dms !== prev.dms) {
    for (const d of next.dms) {
      if (!ready(d) || d.id === open) continue;
      const last = d.last;
      const before = prev.dms.find((p) => p.id === d.id);
      if (ready(before) && before.last.id === last.id) continue;
      out.push({ tag: d.id, title: last.sender.name, body: previewText(last), route: `${dmPath(d.id)}?msg=${encodeURIComponent(last.id)}` });
    }
  }

  if (next.activity !== prev.activity) {
    const seen = new Set(prev.activity.map((a) => a.id));
    for (const a of next.activity) {
      if (a.kind !== 'mention' || !a.unread || a.issue || seen.has(a.id) || a.message.ts < since || a.channelId === open) continue;
      const channel = Object.values(next.channels)
        .flat()
        .find((c) => c.id === a.channelId);
      if (!channel || channel.mentions === 0) continue;
      const space = next.spaces.find((sp) => sp.id === channel.spaceId);
      out.push({
        tag: channel.id,
        title:
          space?.kind === 'client'
            ? t('notify.clientChannel', { channel: channel.name, where: space.name })
            : t('common.channelName', { name: channel.name }),
        body: t('notify.body', { name: a.message.sender.name, text: previewText(a.message) }),
        route: a.threadRootId
          ? threadPath(channel.spaceId, channel.id, a.threadRootId)
          : `${channelPath(channel.spaceId, channel.id)}?msg=${encodeURIComponent(a.message.id)}`,
      });
    }
  }

  return out;
}
