// Screens report what they show (SIDE-14 spec §5.1): references and a label, never text. Nothing happens without an Assistant.
import { useMemo } from 'react';
import { useWorkspace, type Message, type Ref, type WorkspaceSnapshot } from '../matrix';
import type { ScreenContext } from './registry';
import { useRegistry } from './RegistryProvider';

export type { ScreenContext } from './registry';

export function useScreenContext(ctx: ScreenContext | null): void {
  const assistant = useRegistry().assistant;
  const key = ctx && JSON.stringify(ctx);
  // The same context by value keeps the same object, so the feature's hook can depend on it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stable = useMemo(() => ctx, [key]);
  // The registry is fixed for the app's life, so this runs on every render or never.
  assistant?.useScreen(stable);
}

const channelOf = (s: WorkspaceSnapshot, room: string) => Object.values(s.channels).flat().find((c) => c.id === room);
const sealedRoom = (s: WorkspaceSnapshot, room: string) => !!channelOf(s, room)?.encrypted || !!s.dms.find((d) => d.id === room)?.encrypted;
const newestSent = (list?: Message[]) => list?.findLast((m) => m.status === 'sent')?.id;

/**
 * A conversation (channel, DM), a thread in one, or one message in one (an Activity item). An encrypted conversation
 * reports `closed` and no refs.
 */
export function useConversationScreen(o: { kind: string; layer: 'page' | 'panel'; room: string; label: string; thread?: string; message?: string } | null) {
  const room = o?.room ?? '';
  const thread = o?.thread;
  const sealed = useWorkspace((s) => sealedRoom(s, room));
  const space = useWorkspace((s) => channelOf(s, room)?.spaceId);
  const newest = useWorkspace((s) => newestSent(thread ? s.threadTimelines[thread]?.messages : s.timelines[room]?.messages));
  let ctx: ScreenContext | null = null;
  if (o) {
    const ref: Ref = o.message ? { k: 'message', room, event: o.message } : thread ? { k: 'thread', room, root: thread } : { k: 'place', room };
    const base = { kind: o.kind, layer: o.layer, label: o.label, ...(space ? { space } : {}) };
    ctx = sealed ? { ...base, refs: [], closed: 'sealed' } : { ...base, refs: [ref], ...(newest && !o.message ? { newest } : {}) };
  }
  useScreenContext(ctx);
}
