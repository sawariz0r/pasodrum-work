// Icons for the join page (InviteLanding, JoinUsed, JoinWrongAccount). Same drawing rules as app/icons.tsx.
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

export const EnvelopeIcon = icon(
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </>,
  { size: 16, strokeWidth: 1.9 },
);
export const EyeIcon = icon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
  { size: 18, strokeWidth: 1.9 },
);
export const ArrowRightIcon = icon(<path d="M5 12h14M13 6l6 6-6 6" />, { size: 16, strokeWidth: 2.2 });
export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />, { size: 12, strokeWidth: 2.6 });
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>,
  { size: 15, strokeWidth: 2 },
);
export const CheckIcon = icon(<path d="M20 6 9 17l-5-5" />, { size: 15, strokeWidth: 2.4 });
