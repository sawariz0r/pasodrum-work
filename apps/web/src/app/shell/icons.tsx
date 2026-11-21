// Icons for M3 navigation, pages and people (Batch C). Same drawing rules as app/icons.tsx.
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

export const HomeIcon = icon(<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />, { size: 19, strokeWidth: 1.9 });
export const BubbleIcon = icon(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />, { size: 19, strokeWidth: 1.9 });
export const BellIcon = icon(
  <>
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </>,
  { size: 19, strokeWidth: 1.9 },
);
export const ThreadIcon = icon(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />, { size: 16, strokeWidth: 1.9 });
export const SendIcon = icon(<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />, { size: 16, strokeWidth: 1.9 });
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />, { size: 12, strokeWidth: 2.6 });
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />, { size: 12, strokeWidth: 2.6 });
export const ComposeIcon = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
  { size: 17, strokeWidth: 1.9 },
);
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
  { size: 15, strokeWidth: 2 },
);
export const MailIcon = icon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>,
  { size: 15, strokeWidth: 2 },
);
export const AtIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </>,
  { size: 10, strokeWidth: 2.8 },
);
export const ReplyKindIcon = icon(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M20 20v-6a5 5 0 0 0-5-5H4" />
  </>,
  { size: 10, strokeWidth: 2.8 },
);
export const AssignKindIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
  </>,
  { size: 10, strokeWidth: 2.8 },
);
export const TrashIcon = icon(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="m19 6-1 14H6L5 6" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  { size: 16, strokeWidth: 2 },
);
export const SmallCloseIcon = icon(<path d="M18 6 6 18M6 6l12 12" />, { size: 12, strokeWidth: 2.4 });
export const ExternalCornerIcon = icon(<path d="M7 17 17 7M8 7h9v9" />, { size: 8, strokeWidth: 3.4 });
export const BackIcon = icon(<path d="M19 12H5M11 6l-6 6 6 6" />, { size: 18, strokeWidth: 2 });
