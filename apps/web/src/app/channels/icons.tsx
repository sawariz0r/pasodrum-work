// Icons for Batch D (channels, people, roles). Same drawing rules as app/icons.tsx.
import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function icon(paths: ReactNode, defaults: { size: number; strokeWidth: number }) {
  return function Icon({ size = defaults.size, strokeWidth = defaults.strokeWidth, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const UserPlusIcon = icon(
  <>
    <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </>,
  { size: 18, strokeWidth: 1.9 },
);
export const UsersIcon = icon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </>,
  { size: 14, strokeWidth: 2 },
);
export const InfoIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
  { size: 18, strokeWidth: 1.9 },
);
export const LinkIcon = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const LeaveIcon = icon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const XIcon = icon(<path d="M18 6 6 18M6 6l12 12" />, { size: 16, strokeWidth: 2.2 });
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />, { size: 14, strokeWidth: 2.6 });
export const ChevronIcon = icon(<path d="m6 9 6 6 6-6" />, { size: 15, strokeWidth: 2.2 });
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, { size: 16, strokeWidth: 2.2 });
export const PendingIcon = icon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4l2.5 1.5" />
  </>,
  { size: 15, strokeWidth: 2 },
);
export const AlertIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5M12 16h.01" />
  </>,
  { size: 15, strokeWidth: 2.2 },
);
export const PersonIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </>,
  { size: 15, strokeWidth: 2 },
);
export const ArrowIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />, { size: 13, strokeWidth: 2.4 });
