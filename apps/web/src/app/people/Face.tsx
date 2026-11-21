import type { CSSProperties } from 'react';
import { useWorkspace, type Dm, type Person, type Space } from '../../matrix';
import { avatarColor, initialsOf, isCjk } from '../../ui';
import { spaceColour } from '../channels/shared';
import { LogoMark } from '../icons';
import { ExternalCornerIcon } from '../shell/icons';
import { useMediaUrl } from '../timeline/Media';
import { others, useShowExternal } from './names';
import s from './People.module.css';

export { others };

export type FaceSize = 20 | 26 | 30 | 32 | 34 | 36 | 38 | 72;

/** A person's square avatar at the Batch C sizes (DM list, header, profile card). */
export function Face({ person, size, className }: { person: Person; size: FaceSize; className?: string }) {
  const initials = initialsOf(person.name);
  const src = useMediaUrl(person.avatarUrl, true);
  return (
    <span
      className={[s.face, s[`f${size}`], isCjk(initials) && s.cjk, className].filter(Boolean).join(' ')}
      style={{ '--face-bg': avatarColor(person.id) } as CSSProperties}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" /> : initials}
    </span>
  );
}

/** D-38: the system sender "Pasodrum" is the logo tile, never initials. */
export function SystemFace({ size, className }: { size: FaceSize; className?: string }) {
  return (
    <span className={[s.face, s[`f${size}`], className].filter(Boolean).join(' ')} style={{ '--face-bg': '#0E7C66' } as CSSProperties} aria-hidden="true">
      <LogoMark size={Math.round(size * 0.56)} />
    </span>
  );
}

/** A client space's tile at mark size: its colour and first letter, or its logo. */
export function CompanyTile({ space, size, label }: { space: Space; size: 14 | 18; label?: string }) {
  const src = useMediaUrl(space.avatarUrl, true);
  return (
    <span
      className={`${s.tile} ${s[`tile${size}`]}`}
      style={{ '--tile-bg': spaceColour(space) } as CSSProperties}
      {...(label ? { role: 'img', 'aria-label': label, title: label } : { 'aria-hidden': true })}
    >
      {src ? <img src={src} alt="" /> : (Array.from(space.name.trim())[0] ?? '').toUpperCase()}
    </span>
  );
}

/** ↗ in a grey circle: an External. Round and grey, so it never reads as a company. */
export function ExternalMark({ size }: { size: 14 | 18 }) {
  return <ExternalCornerIcon size={size} className={s.external} />;
}

/** The External mark in an avatar's top-right corner; the parent is the positioned avatar box. */
export function ExternalCorner({ className }: { className?: string }) {
  return (
    <span className={[s.corner, className].filter(Boolean).join(' ')} aria-hidden="true">
      <ExternalMark size={14} />
    </span>
  );
}

/** The client space someone is a client in, when it's one of mine; otherwise an outside person counts as an External. */
export function useCompanyOf(person: Pick<Person, 'client'>): Space | undefined {
  return useWorkspace((x) => (person.client ? x.spaces.find((sp) => sp.id === person.client && sp.kind === 'client') : undefined));
}

/** Their company's tile, or ↗ for an External, on avatars of 30 px and up. Team and Externals only: clients never see it. */
export function PersonCorner({ person, className }: { person: Person; className?: string }) {
  const show = useShowExternal();
  const company = useCompanyOf(person);
  if (!show || !person.external) return null;
  if (!company) return <ExternalCorner className={className} />;
  return (
    <span className={[s.corner, s.cornerTile, className].filter(Boolean).join(' ')} aria-hidden="true">
      <CompanyTile space={company} size={14} />
    </span>
  );
}

/** One person, or two overlapping tiles for a group. */
export function DmFace({ dm, meId, size = 38 }: { dm: Dm; meId: string; size?: 38 | 20 }) {
  if (dm.system) return <SystemFace size={size} />;
  const list = others(dm, meId);
  if (size === 20) {
    if (list.length > 1) {
      return (
        <span className={`${s.face} ${s.f20} ${s.groupCount}`} aria-hidden="true">
          {list.length}
        </span>
      );
    }
    return list[0] ? <Face person={list[0]} size={20} /> : null;
  }
  if (list.length > 1) {
    return (
      <span className={s.pair} aria-hidden="true">
        <Face person={list[0]!} size={26} className={s.pairA} />
        <Face person={list[1]!} size={26} className={s.pairB} />
      </span>
    );
  }
  const p = list[0];
  if (!p) return null;
  return (
    <span className={s.single}>
      <Face person={p} size={38} />
      <PersonCorner person={p} />
    </span>
  );
}
