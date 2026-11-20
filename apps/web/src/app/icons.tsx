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
export const ExternalIcon = icon(<path d="M7 17 17 7M8 7h9v9" />, { size: 9, strokeWidth: 3 });
