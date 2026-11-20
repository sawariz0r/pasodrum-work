import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Svg({ size, strokeWidth, children, ...rest }: IconProps & { children: React.ReactNode }) {
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

export function ThreadIcon({ size = 16, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <Svg size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
    </Svg>
  );
}

export function BackIcon({ size = 18, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <Svg size={size} strokeWidth={strokeWidth} {...rest}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  );
}
