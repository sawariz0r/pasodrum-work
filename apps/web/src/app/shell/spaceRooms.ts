import { useWorkspace, type Channel } from '../../matrix';
import type { StoredDraft } from '../drafts';

const none: Channel[] = [];

/** Drafts for this space's channels and DMs; drafts for places you've left drop out. */
export function useSpaceDrafts(spaceId: string, drafts: StoredDraft[]): StoredDraft[] {
  const channels = useWorkspace((x) => x.channels[spaceId] ?? none);
  const dms = useWorkspace((x) => x.dms);
  return drafts.filter((d) => channels.some((c) => c.id === d.channelId) || dms.some((m) => m.id === d.channelId && m.spaceIds.includes(spaceId)));
}
