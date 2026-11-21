// Icons for Another app and the phone hand-off. Same drawing rules as app/icons.tsx.
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

export const PhoneIcon = icon(
  <>
    <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
    <path d="M11 18.5h2" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const LaptopIcon = icon(
  <>
    <rect x="4" y="5" width="16" height="11" rx="2" />
    <path d="M2 20h20" />
  </>,
  { size: 26, strokeWidth: 1.9 },
);
export const OpenOutIcon = icon(
  <>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </>,
  { size: 16, strokeWidth: 2.2 },
);
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
  { size: 15, strokeWidth: 2 },
);
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />, {
  size: 16,
  strokeWidth: 2.6,
});
