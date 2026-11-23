import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function icon(paths: ReactNode, defaults: { size: number; strokeWidth: number }) {
  return function Icon({ size = defaults.size, strokeWidth = defaults.strokeWidth, ...rest }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
        {paths}
      </svg>
    );
  };
}

export const SparkIcon = icon(
  <>
    <path d="M11 4.5 12.6 9a1.6 1.6 0 0 0 1 1l4.4 1.6-4.4 1.6a1.6 1.6 0 0 0-1 1L11 19l-1.6-4.8a1.6 1.6 0 0 0-1-1L4 11.6 8.4 10a1.6 1.6 0 0 0 1-1Z" />
    <path d="M19 3v4M17 5h4" />
  </>,
  { size: 17, strokeWidth: 1.8 },
);
export const StartOverIcon = icon(
  <>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </>,
  { size: 17, strokeWidth: 2 },
);
export const CloseIcon = icon(<path d="M18 6 6 18M6 6l12 12" />, { size: 18, strokeWidth: 2 });
export const BackIcon = icon(<path d="M19 12H5M11 18l-6-6 6-6" />, { size: 18, strokeWidth: 2 });
export const HashIcon = icon(<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />, { size: 14, strokeWidth: 2.1 });
export const MessageIcon = icon(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />, { size: 14, strokeWidth: 2 });
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>,
  { size: 13, strokeWidth: 2.1 },
);
export const CloserIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
    <path d="M11 8v6M8 11h6" />
  </>,
  { size: 15, strokeWidth: 2.1 },
);
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" />, { size: 13, strokeWidth: 2.2 });
export const ChevronUpIcon = icon(<path d="m18 15-6-6-6 6" />, { size: 13, strokeWidth: 2.2 });
export const SendIcon = icon(<path d="M12 19V5M5 12l7-7 7 7" />, { size: 16, strokeWidth: 2.2 });
export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />, { size: 15, strokeWidth: 2.4 });

export function StopIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" rx="2" fill="currentColor" />
    </svg>
  );
}
