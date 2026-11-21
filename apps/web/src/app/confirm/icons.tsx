// Icons for the confirm link page (EmailConfirmLink). Same drawing rules as app/icons.tsx.
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

export const LaptopTickIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 20h20M9 10.5l2 2 4-4" />
  </>,
  { size: 30, strokeWidth: 1.8 },
);

export const LaptopIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 20h20" />
  </>,
  { size: 20, strokeWidth: 1.9 },
);

export const TickIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, { size: 32, strokeWidth: 2.6 });

export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
  { size: 30, strokeWidth: 1.8 },
);
