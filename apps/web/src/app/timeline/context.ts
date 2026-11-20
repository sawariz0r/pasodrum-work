import { createContext, useContext } from 'react';
import type { Message } from '../../matrix';

/** What a row can ask of its timeline. Stable for the life of the channel view. */
export interface TimelineActions {
  channelId: string;
  meId: string;
  openViewer(messageId: string): void;
  askDelete(messages: Message[]): void;
  linkCopied(): void;
  jumpTo(messageId: string): void;
  /** Long messages stay expanded until you leave the channel. */
  isExpanded(messageId: string): boolean;
  expand(messageId: string): void;
}

export const TimelineContext = createContext<TimelineActions | null>(null);

export function useTimeline(): TimelineActions {
  const value = useContext(TimelineContext);
  if (!value) throw new Error('useTimeline outside Timeline');
  return value;
}
