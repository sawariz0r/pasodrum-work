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

export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="13" width="3.6" height="7" rx="1.8" fill="#FFFFFF" />
      <rect x="10.2" y="8.5" width="3.6" height="11.5" rx="1.8" fill="#FFFFFF" />
      <rect x="16.4" y="4" width="3.6" height="16" rx="1.8" fill="#FFFFFF" />
    </svg>
  );
}

export const HashIcon = icon(<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />, { size: 16, strokeWidth: 1.9 });
export const LockIcon = icon(
  <>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const ChatIcon = icon(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />, { size: 15, strokeWidth: 2 });
export const MoonIcon = icon(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />, { size: 18, strokeWidth: 1.9 });
export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
  { size: 18, strokeWidth: 1.9 },
);
export const GlobeIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const SignOutIcon = icon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const SidebarIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>,
  { size: 18, strokeWidth: 1.9 },
);
export const UnlinkIcon = icon(
  <>
    <path d="M9 17H7A5 5 0 0 1 7 7" />
    <path d="M15 7h2a5 5 0 0 1 4 8" />
    <path d="M8 12h4" />
    <path d="m2 2 20 20" />
  </>,
  { size: 30, strokeWidth: 1.8 },
);
export const CloudOffIcon = icon(
  <>
    <path d="m2 2 20 20" />
    <path d="M5.8 8.6A6 6 0 0 0 7 20h10" />
    <path d="M10.2 4.3A6 6 0 0 1 17.5 9H18a4 4 0 0 1 3 6.7" />
  </>,
  { size: 18, strokeWidth: 2 },
);
export const ChevronRightIcon = icon(<path d="m9 6 6 6-6 6" />, { size: 13, strokeWidth: 2.4 });
/** The outside mark: someone from another company (client or guest). */
export const ExternalIcon = icon(<path d="M3 21h18M6 21V4h12v17M10 21v-4h4v4M10 8h.01M14 8h.01M10 12h.01M14 12h.01" />, { size: 9, strokeWidth: 2.6 });

export const SmileIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </>,
  { size: 16, strokeWidth: 2 },
);
export const ReplyIcon = icon(
  <>
    <path d="M9 14 4 9l5-5" />
    <path d="M20 20v-6a5 5 0 0 0-5-5H4" />
  </>,
  { size: 16, strokeWidth: 2 },
);
export const MoreIcon = icon(<path d="M5 12h.01M12 12h.01M19 12h.01" />, { size: 16, strokeWidth: 3 });
export const EditIcon = icon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const LinkIcon = icon(
  <>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const TrashIcon = icon(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="m19 6-1 14H6L5 6" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const BoxIcon = icon(
  <>
    <path d="M21 8 12 3 3 8v8l9 5 9-5Z" />
    <path d="m3 8 9 5 9-5M12 13v8" />
  </>,
  { size: 15, strokeWidth: 1.9 },
);
export const DownloadIcon = icon(<path d="M12 3v12M7 10l5 5 5-5M5 21h14" />, { size: 16, strokeWidth: 2 });
export const ChevronLeftIcon = icon(<path d="m15 18-6-6 6-6" />, { size: 22, strokeWidth: 2.2 });
export const ChevronNextIcon = icon(<path d="m9 18 6-6-6-6" />, { size: 22, strokeWidth: 2.2 });
export const ArrowDownIcon = icon(<path d="M12 5v14M6 13l6 6 6-6" />, { size: 16, strokeWidth: 2.2 });
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />, { size: 16, strokeWidth: 2.4 });
export const UserPlusIcon = icon(
  <>
    <path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  { size: 15, strokeWidth: 2 },
);

export function PlayIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}
