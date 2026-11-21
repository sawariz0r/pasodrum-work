import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useWorkspace, type Channel, type Member, type PendingInvite, type Role, type Space, type WorkspaceSnapshot } from '../../matrix';
import { avatarColor } from '../../ui';
import { ExternalIcon, LogoMark } from '../icons';
import { channelPath } from '../places';
import { useMediaUrl } from '../timeline/Media';
import s from './Channels.module.css';

export function findChannel(x: WorkspaceSnapshot, id: string): Channel | undefined {
  for (const list of Object.values(x.channels)) {
    const hit = list.find((c) => c.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function useChannel(id: string): Channel | undefined {
  return useWorkspace((x) => findChannel(x, id));
}

export function useSpace(id: string | undefined): Space | undefined {
  return useWorkspace((x) => x.spaces.find((sp) => sp.id === id));
}

export function useRole(spaceId: string | undefined): Role | undefined {
  return useWorkspace((x) => (spaceId ? x.myRoles[spaceId] : undefined));
}

/** An account made from an email has the deterministic id `@name_domain:server` (D-07). */
export function isInviteFor(invite: PendingInvite, m: Member) {
  const local = m.person.id.slice(1).split(':')[0]?.toLowerCase();
  const email = invite.email.toLowerCase();
  return local === email.replace('@', '_') || m.person.name.toLowerCase() === email;
}

/** "Copy link": the channel's plain address. It grants nothing (D-25). */
export function channelLink(channel: Pick<Channel, 'id' | 'spaceId'>) {
  return `${location.origin}${channelPath(channel.spaceId, channel.id)}`;
}

export function copyText(text: string): Promise<void> {
  return navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'));
}

/** Copies, then reports `true` for two seconds (the label turns into "Link copied"). */
export function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (text: string) =>
    void copyText(text).then(
      () => {
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  return [copied, copy];
}

/** A client space's tile colour (D-28): its chosen colour, else one derived from its id. */
export function spaceColour(space: Space): string {
  return space.kind === 'workspace' ? '#0E7C66' : (space.colour ?? avatarColor(space.id));
}

/** Client space colours (CreateClientSpace, SpaceSettings), in swatch order. */
export const swatches = [
  ['slate', '#2F4A6D'],
  ['walnut', '#7A4B2A'],
  ['plum', '#5B3E8C'],
  ['pine', '#1F6F5C'],
  ['brick', '#9A3B3B'],
] as const;

/**
 * Client spaces being made here, by lowercased name → when: their rail tile pops in once (ClientSpaceCreated).
 * Marked before createClientSpace resolves, because the tile mounts as soon as the space is in the snapshot.
 */
const freshSpaces = new Map<string, number>();
const freshKey = (name: string) => name.trim().toLowerCase();

export function markFreshSpace(name: string) {
  freshSpaces.set(freshKey(name), Date.now());
}

export function forgetFreshSpace(name: string) {
  freshSpaces.delete(freshKey(name));
}

export function isFreshSpace(space: Space): boolean {
  const at = freshSpaces.get(freshKey(space.name));
  return space.kind === 'client' && at !== undefined && Date.now() - at < 60_000;
}

/** The company workspace's name ("Pasodrum"), for labels that name it. */
export function useWorkspaceName(): string {
  return useWorkspace((x) => x.spaces.find((sp) => sp.kind === 'workspace')?.name ?? '');
}

/** A space's tile: the logo for the workspace, a letter (and the amber corner) for a client space. */
export function SpaceMark({ space, large, corner }: { space: Space; large?: boolean; corner?: boolean }) {
  const avatar = useMediaUrl(space.avatarUrl, true);
  const isWorkspace = space.kind === 'workspace';
  const style = { '--tile-bg': spaceColour(space) } as CSSProperties;
  return (
    <span className={[s.mark, large && s.markLg].filter(Boolean).join(' ')} style={style} aria-hidden="true">
      {avatar ? <img src={avatar} alt="" /> : isWorkspace ? <LogoMark /> : (Array.from(space.name.trim())[0] ?? '').toUpperCase()}
      {!isWorkspace && corner && (
        <span className={s.markCorner}>
          <ExternalIcon />
        </span>
      )}
    </span>
  );
}
