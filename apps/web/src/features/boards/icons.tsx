import type { ReactNode } from 'react';

function line(paths: ReactNode, size: number, strokeWidth: number) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths}
    </svg>
  );
}

type P = { size?: number; strokeWidth?: number };

export const PlusIcon = ({ size = 16, strokeWidth = 2 }: P) => line(<path d="M12 5v14M5 12h14" />, size, strokeWidth);
export const PencilIcon = ({ size = 16, strokeWidth = 1.9 }: P) =>
  line(
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>,
    size,
    strokeWidth,
  );
export const PersonIcon = ({ size = 16, strokeWidth = 1.9 }: P) =>
  line(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>,
    size,
    strokeWidth,
  );
export const ChevronDownIcon = ({ size = 13, strokeWidth = 2.2 }: P) => line(<path d="m6 9 6 6 6-6" />, size, strokeWidth);
export const ChevronRightIcon = ({ size = 15, strokeWidth = 2 }: P) => line(<path d="m9 6 6 6-6 6" />, size, strokeWidth);
export const ChevronLeftIcon = ({ size = 15, strokeWidth = 2 }: P) => line(<path d="m15 6-6 6 6 6" />, size, strokeWidth);
export const BoardViewIcon = ({ size = 15, strokeWidth = 1.9 }: P) =>
  line(
    <>
      <rect x="3" y="4" width="5" height="16" rx="1.5" />
      <rect x="10" y="4" width="5" height="11" rx="1.5" />
      <rect x="17" y="4" width="4" height="7" rx="1.5" />
    </>,
    size,
    strokeWidth,
  );
export const ListViewIcon = ({ size = 15, strokeWidth = 1.9 }: P) => line(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />, size, strokeWidth);
export const MoreIcon = ({ size = 16, strokeWidth = 2 }: P) =>
  line(
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>,
    size,
    strokeWidth,
  );
export const CalendarIcon = ({ size = 13, strokeWidth = 2 }: P) =>
  line(
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>,
    size,
    strokeWidth,
  );
export const CommentIcon = ({ size = 13, strokeWidth = 2 }: P) => line(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />, size, strokeWidth);
export const LinkIcon = ({ size = 17, strokeWidth = 1.9 }: P) =>
  line(
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>,
    size,
    strokeWidth,
  );
export const CloseIcon = ({ size = 17, strokeWidth = 1.9 }: P) => line(<path d="M6 6l12 12M18 6 6 18" />, size, strokeWidth);
export const CheckIcon = ({ size = 16, strokeWidth = 2.4 }: P) => line(<path d="m5 12.5 4.5 4.5L19 7.5" />, size, strokeWidth);
export const BuildingIcon = ({ size = 9, strokeWidth = 2.6 }: P) => line(<path d="M3 21h18M6 21V4h12v17M10 21v-4h4v4M10 8h.01M14 8h.01M10 12h.01M14 12h.01" />, size, strokeWidth);
export const BoardsGlyph = ({ size = 30, strokeWidth = 1.8 }: P) =>
  line(
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 7v7M12 7v4M16 7v9" />
    </>,
    size,
    strokeWidth,
  );

/** The column glyphs (todo, doing, review, done, and any custom column). */
export function ColumnIcon({ id }: { id: string }) {
  let inner: ReactNode;
  if (id === 'todo') inner = <circle cx="7" cy="7" r="5.6" fill="none" stroke="#8A8893" strokeWidth="1.6" />;
  else if (id === 'doing')
    inner = (
      <>
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="#C27803" strokeWidth="1.6" />
        <path d="M7 3.4A3.6 3.6 0 0 1 7 10.6Z" fill="#C27803" />
      </>
    );
  else if (id === 'review')
    inner = (
      <>
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="#2563EB" strokeWidth="1.6" />
        <path d="M7 7V3.4A3.6 3.6 0 1 1 3.4 7Z" fill="#2563EB" />
      </>
    );
  else if (id === 'done')
    inner = (
      <>
        <circle cx="7" cy="7" r="6.4" fill="#0E7C66" />
        <path d="m4.3 7.2 1.9 1.9 3.6-3.8" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </>
    );
  else
    inner = (
      <>
        <circle cx="7" cy="7" r="5.6" fill="none" stroke="#7C3AED" strokeWidth="1.6" strokeDasharray="2.2 2" />
        <circle cx="7" cy="7" r="1.8" fill="#7C3AED" />
      </>
    );
  return (
    <span style={{ display: 'flex', flex: 'none' }}>
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        {inner}
      </svg>
    </span>
  );
}
