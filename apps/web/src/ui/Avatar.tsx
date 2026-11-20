import type { CSSProperties } from 'react';
import { initialsOf, isCjk } from './initialsOf';
import s from './Avatar.module.css';

const PALETTE = ['#C2410C', '#1D4ED8', '#7E22CE', '#0E7C66', '#B91C1C', '#A16207', '#0F766E', '#475569'];

export function avatarColor(key: string): string {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export type AvatarProps = {
  name: string;
  color: string;
  src?: string;
  size?: 20 | 22 | 32 | 36;
  presence?: 'active' | 'away';
  className?: string;
};

export function Avatar({ name, color, src, size = 36, presence, className }: AvatarProps) {
  const initials = initialsOf(name);
  const cls = [s.avatar, s[`s${size}`], isCjk(initials) && s.cjk, className].filter(Boolean).join(' ');
  return (
    <span className={cls} style={{ '--avatar-bg': color } as CSSProperties} aria-hidden="true">
      {src ? <img className={s.img} src={src} alt="" /> : initials}
      {presence && <span className={`${s.dot} ${s[presence]}`} />}
    </span>
  );
}
