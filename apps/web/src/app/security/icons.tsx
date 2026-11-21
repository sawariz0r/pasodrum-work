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

export const KeyIcon = icon(
  <>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.7 12.3 9.8-9.8M17 6l3 3M14.5 8.5l2.5 2.5" />
  </>,
  { size: 18, strokeWidth: 1.9 },
);
export const DevicesIcon = icon(
  <>
    <rect x="2" y="4" width="14" height="10" rx="2" />
    <path d="M1 18h11" />
    <rect x="17" y="8" width="6" height="12" rx="1.5" />
  </>,
  { size: 18, strokeWidth: 1.9 },
);
export const LaptopCheckIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 20h20M9 10.5l2 2 4-4" />
  </>,
  { size: 30, strokeWidth: 1.8 },
);
export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />, { size: 16, strokeWidth: 2.2 });
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
  { size: 15, strokeWidth: 2 },
);
export const EyeOffIcon = icon(
  <>
    <path d="M9.9 4.2A9.8 9.8 0 0 1 12 4c6.5 0 10 8 10 8a17.7 17.7 0 0 1-2.2 3.2M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.4-1.6" />
    <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" />
  </>,
  { size: 17, strokeWidth: 2 },
);
export const RefreshIcon = icon(
  <>
    <path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" />
    <path d="M21 3v5h-5" />
  </>,
  { size: 17, strokeWidth: 2 },
);
export const BubbleDashIcon = icon(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" strokeDasharray="2.6 2.6" />, {
  size: 15,
  strokeWidth: 1.9,
});
export const TabIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 4v5" />
  </>,
  { size: 30, strokeWidth: 1.8 },
);
/** SIDE-03: earlier messages shared back (profile card, the timeline row and mark). */
export const HistoryIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </>,
  { size: 16, strokeWidth: 2 },
);
export const PersonCheckIcon = icon(
  <>
    <circle cx="9" cy="8" r="4" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <path d="m16 11 2 2 4-4" />
  </>,
  { size: 16, strokeWidth: 2 },
);
export const PersonIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
  { size: 27, strokeWidth: 1.9 },
);
