// Feature-module contract (D-04). Features call defineFeature and are listed once in features/index.ts.
import type { ComponentType, ReactNode } from 'react';
import type { Message } from '../matrix';

export interface RailItem {
  id: string;
  to: string;
  icon: ReactNode;
  /** A hook so the feature can read its own strings. */
  useLabel: () => string;
}

export interface ChannelTabType {
  /** Matches the `type` of a tab stored on the channel. */
  type: string;
  icon: ReactNode;
  useLabel: () => string;
  View: ComponentType<{ channelId: string }>;
}

/** What a feature draws instead of a message's text (SIDE-01, first use: translate). */
export interface BodyOverride {
  html?: string;
  text?: string;
  lang?: string;
}

/** A hover-bar button, and optionally a wrapper around the text of plain and formatted messages. */
export interface MessageAction {
  id: string;
  /** A hook: the button for this message, or null when it doesn't apply. */
  useButton: (message: Message, own: boolean) => { icon: ReactNode; label: string; pressed?: boolean; run: () => void } | null;
  /** `render()` draws the text as sent; `render(override)` draws the feature's version in the same place. */
  Body?: ComponentType<{ message: Message; render: (override?: BodyOverride) => ReactNode }>;
}

export interface Feature {
  id: string;
  rail?: RailItem[];
  channelTabs?: ChannelTabType[];
  messageActions?: MessageAction[];
}

export function defineFeature<F extends Feature>(feature: F): F {
  return feature;
}

export interface Registry {
  rail: RailItem[];
  channelTabs: ReadonlyMap<string, ChannelTabType>;
  messageActions: MessageAction[];
}

export function buildRegistry(features: readonly Feature[]): Registry {
  const channelTabs = new Map<string, ChannelTabType>();
  for (const f of features) for (const tab of f.channelTabs ?? []) channelTabs.set(tab.type, tab);
  return { rail: features.flatMap((f) => f.rail ?? []), channelTabs, messageActions: features.flatMap((f) => f.messageActions ?? []) };
}

/** A tab saved on a channel. Saved tabs arrive with M7; until then every channel has none. */
export interface StoredTab {
  id: string;
  type: string;
}

export const noStoredTabs: readonly StoredTab[] = [];

/** Stored ∩ registered: a tab whose feature was removed is skipped, never an error. Messages is implicit. */
export function visibleTabs(stored: readonly StoredTab[], registry: Registry) {
  const seen = new Set<string>();
  const out: { id: string; tab: ChannelTabType }[] = [];
  for (const s of stored) {
    const tab = registry.channelTabs.get(s.type);
    if (!tab || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, tab });
  }
  return out;
}
