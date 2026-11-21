import type { CSSProperties } from 'react';
import type { Dm, Person } from '../../matrix';
import { avatarColor, initialsOf, isCjk } from '../../ui';
import { LogoMark } from '../icons';
import { ExternalCornerIcon } from '../shell/icons';
import { useMediaUrl } from '../timeline/Media';
import s from './People.module.css';

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

/** Amber corner for people outside the company workspace (D-23). */
export function ExternalCorner({ className }: { className?: string }) {
  return (
    <span className={[s.corner, className].filter(Boolean).join(' ')} aria-hidden="true">
      <ExternalCornerIcon />
    </span>
  );
}

/** One person, or two overlapping tiles for a group. */
export function DmFace({ dm, meId, size = 38, showExternal }: { dm: Dm; meId: string; size?: 38 | 20; showExternal: boolean }) {
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
      {showExternal && p.external && <ExternalCorner />}
    </span>
  );
}

export function others(dm: Dm, meId: string): Person[] {
  const rest = dm.people.filter((p) => p.id !== meId);
  return rest.length ? rest : dm.people;
}
