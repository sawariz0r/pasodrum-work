import { SoonPage } from '../../app/shell/SoonPage';
import { useT } from './strings';

export function DocsIcon({ size = 19, strokeWidth = 1.9 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </svg>
  );
}

export function useDocsLabel() {
  return useT()('docs');
}

export function DocsPage() {
  return <SoonPage icon={<DocsIcon size={30} strokeWidth={1.8} />} title={useDocsLabel()} />;
}
