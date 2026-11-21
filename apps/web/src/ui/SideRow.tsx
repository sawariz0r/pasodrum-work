import type { ReactNode } from 'react';
import s from './SideRow.module.css';

export { default as sideRow } from './SideRow.module.css';

export type SideHeadingProps = {
  open: boolean;
  onToggle: () => void;
  lead?: ReactNode;
  label: string;
  action?: ReactNode;
};

/** A sidebar section heading: chevron, optional lead (a client tile), name, and an optional action on the right. */
export function SideHeading({ open, onToggle, lead, label, action }: SideHeadingProps) {
  return (
    <div className={s.sectionHead}>
      <button type="button" className={s.sectionToggle} aria-expanded={open} onClick={onToggle}>
        <svg
          className={s.sectionChevron}
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        {lead}
        <span className={s.sectionName}>{label}</span>
      </button>
      {action}
    </div>
  );
}
