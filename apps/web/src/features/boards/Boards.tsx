import { useT } from './strings';

export function BoardsIcon({ size = 19, strokeWidth = 1.9 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 7v7M12 7v4M16 7v9" />
    </svg>
  );
}

export function useBoardsLabel() {
  return useT()('boards');
}
