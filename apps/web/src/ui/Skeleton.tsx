import type { CSSProperties } from 'react';
import s from './Skeleton.module.css';

export type SkeletonProps = {
  width: number | string;
  height: number | string;
  radius?: number | string;
  onRail?: boolean;
  className?: string;
};

export function Skeleton({ width, height, radius, onRail = false, className }: SkeletonProps) {
  const style: CSSProperties = { width, height, borderRadius: radius };
  return <span aria-hidden="true" className={[s.skel, onRail && s.rail, className].filter(Boolean).join(' ')} style={style} />;
}
