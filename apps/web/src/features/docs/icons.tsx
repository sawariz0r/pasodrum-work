import type { ReactNode } from 'react';

function icon(paths: ReactNode, size: number, strokeWidth: number) {
  return function Icon({ size: s = size }: { size?: number }) {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {paths}
      </svg>
    );
  };
}

const page = (
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
    <path d="M14 3v6h6M8 13h8M8 17h5" />
  </>
);

export const PageIcon = icon(page, 15, 1.9);
export const BigPageIcon = icon(page, 30, 1.8);
export const ChevronDown = icon(<path d="m6 9 6 6 6-6" />, 13, 2.2);
export const ChevronRight = icon(<path d="m9 6 6 6-6 6" />, 13, 2.2);
export const Plus = icon(<path d="M12 5v14M5 12h14" />, 16, 2);
export const PlusBold = icon(<path d="M12 5v14M5 12h14" />, 16, 2.2);
export const Pencil = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
  16,
  1.9,
);
export const Search = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  15,
  1.9,
);
export const LinkIcon = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </>,
  17,
  1.9,
);
export const More = icon(
  <>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </>,
  17,
  1.9,
);
export const Grip = icon(
  <>
    <circle cx="9" cy="6" r="1.1" />
    <circle cx="15" cy="6" r="1.1" />
    <circle cx="9" cy="12" r="1.1" />
    <circle cx="15" cy="12" r="1.1" />
    <circle cx="9" cy="18" r="1.1" />
    <circle cx="15" cy="18" r="1.1" />
  </>,
  16,
  2,
);
export const ArrowRight = icon(<path d="M5 12h14M13 6l6 6-6 6" />, 16, 2);
export const Trash = icon(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />, 16, 2);
export const SpaceRoot = icon(<rect x="4" y="4" width="16" height="16" rx="4" />, 15, 1.9);
export const Check = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, 16, 2.4);

export const BlockIcons = {
  text: icon(<path d="M5 6h14M12 6v13" />, 16, 1.9),
  h1: icon(<path d="M4 6v12M12 6v12M4 12h8M17 10l3-2v10" />, 16, 1.9),
  h2: icon(<path d="M3 6v12M11 6v12M3 12h8M15 10a2.5 2.5 0 1 1 5 0c0 2-5 4-5 8h5" />, 16, 1.9),
  bullets: icon(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />, 16, 1.9),
  numbered: icon(<path d="M10 6h11M10 12h11M10 18h11M4 4h1v4M3.5 14.5a1.3 1.3 0 1 1 2.2 1L3.5 18H6" />, 16, 1.9),
  checklist: icon(
    <>
      <rect x="3" y="4" width="7" height="7" rx="1.6" />
      <path d="m4.5 17 2 2 3.5-3.5M14 7.5h7M14 17.5h7" />
    </>,
    16,
    1.9,
  ),
  quote: icon(<path d="M5 4v16M10 8h10M10 12h10M10 16h6" />, 16, 1.9),
  callout: icon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>,
    16,
    1.9,
  ),
  code: icon(<path d="m8 8-4 4 4 4M16 8l4 4-4 4" />, 16, 1.9),
  table: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16" />
    </>,
    16,
    1.9,
  ),
  image: icon(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-9 9" />
    </>,
    16,
    1.9,
  ),
  pageLink: icon(page, 16, 1.9),
  divider: icon(<path d="M3 12h18" />, 16, 1.9),
};
