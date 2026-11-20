import type { Channel, Space } from '../matrix';
import { lastPlace } from './prefs';

export function channelPath(spaceId: string, channelId: string) {
  return `/w/${encodeURIComponent(spaceId)}/c/${encodeURIComponent(channelId)}`;
}

type Places = { spaces: Space[]; channels: Record<string, Channel[]> };

/** The last channel opened in this space, else its first channel. */
export function spaceHome({ channels }: Places, spaceId: string): Channel | undefined {
  const list = channels[spaceId] ?? [];
  const last = lastPlace().channels[spaceId];
  return list.find((c) => c.id === last) ?? list[0];
}

/** Where "/" goes: the last channel opened, else the first channel of the first space that has one. */
export function homeChannel(places: Places): Channel | undefined {
  const last = lastPlace().space;
  const ordered = [...places.spaces].sort((a, b) => Number(b.id === last) - Number(a.id === last));
  for (const s of ordered) {
    const c = spaceHome(places, s.id);
    if (c) return c;
  }
  return undefined;
}

/** The space whose sidebar shows when the URL names no known channel. */
export function fallbackSpace(spaces: Space[], spaceId?: string): Space | undefined {
  const last = lastPlace().space;
  return spaces.find((s) => s.id === spaceId) ?? spaces.find((s) => s.id === last) ?? spaces[0];
}
