// Composer icons, drawn as on the canvas (ComposerFormat, ComposerReply, Upload*, DropOverlay).
import type { ReactNode } from 'react';

function Svg({ size = 15, sw = 2.2, children }: { size?: number; sw?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const BoldIcon = () => <Svg sw={2.4}><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7ZM7 12h7a3.5 3.5 0 0 1 0 7H7Z" /></Svg>;
export const ItalicIcon = () => <Svg><path d="M19 4h-9M14 20H5M15 4 9 20" /></Svg>;
export const StrikeIcon = () => (
  <Svg>
    <path d="M5 12h14" />
    <path d="M16 7.5A4 4 0 0 0 12 5c-2.5 0-4 1.3-4 3 0 1.1.6 2 2 2.7" />
    <path d="M8 16.5A4 4 0 0 0 12 19c2.5 0 4-1.3 4-3 0-.6-.1-1.1-.4-1.5" />
  </Svg>
);
export const LinkIcon = ({ size = 15, sw = 2.2 }: { size?: number; sw?: number }) => (
  <Svg size={size} sw={sw}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Svg>
);
export const OrderedListIcon = () => (
  <Svg sw={2}>
    <path d="M10 6h11M10 12h11M10 18h11" />
    <path d="M4 5h1v4" />
    <path d="M4 9h2" />
    <path d="M6 19H4c0-1 2-1.6 2-2.6S5 15 4 15.3" />
  </Svg>
);
export const BulletListIcon = () => <Svg><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></Svg>;
export const QuoteIcon = () => (
  <Svg>
    <path d="M4 5v14" />
    <path d="M9 7h11M9 12h11M9 17h7" />
  </Svg>
);
export const CodeIcon = () => <Svg><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></Svg>;
export const CodeBlockIcon = () => (
  <Svg sw={2}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="m10 10-2 2 2 2M14 10l2 2-2 2" />
  </Svg>
);
export const PlusIcon = () => <Svg size={16}><path d="M12 5v14M5 12h14" /></Svg>;
export const EmojiIcon = () => (
  <Svg size={17} sw={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
  </Svg>
);
export const MentionIcon = () => (
  <Svg size={17} sw={2}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />
  </Svg>
);
export const SendIcon = () => <Svg size={16}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" /></Svg>;
export const ReplyIcon = () => (
  <Svg sw={2}>
    <path d="M9 14 4 9l5-5" />
    <path d="M20 20v-6a5 5 0 0 0-5-5H4" />
  </Svg>
);
export const SmallCloseIcon = ({ size = 14, sw = 2.2 }: { size?: number; sw?: number }) => <Svg size={size} sw={sw}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const RetryIcon = () => (
  <Svg size={16}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);
export const UploadIcon = () => (
  <Svg size={30} sw={2}>
    <path d="M12 15V3M7 8l5-5 5 5" />
    <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
  </Svg>
);
export const SearchIcon = () => (
  <Svg sw={2}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);
export const TextIcon = () => <Svg sw={2}><path d="M5 7V5h14v2M12 5v14M9 19h6" /></Svg>;
