import type { Channel, Space } from '../matrix';
import { lastPlace, useLastSpace } from './prefs';

export function channelPath(spaceId: string, channelId: string) {
  return `/w/${encodeURIComponent(spaceId)}/c/${encodeURIComponent(channelId)}`;
}

type Places = { spaces: Space[]; channels: Record<string, Channel[]> };

/** The last channel opened in this space, else its first channel; never an archived one (E2). */
export function spaceHome({ channels }: Places, spaceId: string): Channel | undefined {
  const list = (channels[spaceId] ?? []).filter((c) => !c.archived);
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
export function fallbackSpace(spaces: Space[], spaceId?: string, last = lastPlace().space): Space | undefined {
  return spaces.find((s) => s.id === spaceId) ?? spaces.find((s) => s.id === last) ?? spaces[0];
}

/** fallbackSpace that re-renders when the lit tile changes. */
export function useFallbackSpace(spaces: Space[], spaceId?: string): Space | undefined {
  return fallbackSpace(spaces, spaceId, useLastSpace());
}

const enc = encodeURIComponent;

/** A channel with its thread panel open (M3-03 reads `?thread`). */
export function threadPath(spaceId: string, channelId: string, rootId: string) {
  return `${channelPath(spaceId, channelId)}?thread=${enc(rootId)}`;
}

/** A DM opened from a space's sidebar: the sidebar stays. */
export function spaceDmPath(spaceId: string, dmId: string) {
  return `/w/${enc(spaceId)}/dm/${enc(dmId)}`;
}

/** A DM on the DMs page: the DM list replaces the sidebar. */
export function dmPath(dmId: string) {
  return `/dms/${enc(dmId)}`;
}

export function threadsPath(spaceId: string) {
  return `/threads?space=${enc(spaceId)}`;
}

export function draftsPath(spaceId: string) {
  return `/drafts?space=${enc(spaceId)}`;
}
