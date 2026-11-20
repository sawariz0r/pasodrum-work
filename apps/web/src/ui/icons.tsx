import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, strokeWidth = 2, children, ...rest }: IconProps) {
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
      {children}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Svg size={18} {...props}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <Svg size={14} strokeWidth={2.4} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5M12 16h.01" />
    </Svg>
  );
}

export function OfflineIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m2 2 20 20" />
      <path d="M8.5 16.5a5 5 0 0 1 7 0" />
      <path d="M2 8.8a15 15 0 0 1 4.2-2.6" />
      <path d="M10.7 5c4-.4 8.1.9 11.3 3.8" />
      <path d="M16.9 11.3a10 10 0 0 1 2.2 1.7" />
      <path d="M5 13a10 10 0 0 1 5.2-2.8" />
      <path d="M12 20h.01" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg strokeWidth={2.4} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}
