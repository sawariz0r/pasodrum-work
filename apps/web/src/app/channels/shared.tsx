import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useWorkspace, type Channel, type Role, type Space, type WorkspaceSnapshot } from '../../matrix';
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

/** A space's tile: the logo for the workspace, a letter (and the amber corner) for a client space. */
export function SpaceMark({ space, large, corner }: { space: Space; large?: boolean; corner?: boolean }) {
  const avatar = useMediaUrl(space.avatarUrl, true);
  const isWorkspace = space.kind === 'workspace';
  const style = { '--tile-bg': isWorkspace ? '#0E7C66' : avatarColor(space.id) } as CSSProperties;
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
