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
  /** Matches the `type` of a tab stored on the channel; a built-in tab's id in `?tab=`. */
  type: string;
  icon: ReactNode;
  useLabel: () => string;
  /** `jumpTo` opens Messages at that message and flashes it. */
  View: ComponentType<{ channelId: string; jumpTo: (messageId: string) => void }>;
  /** In every channel and DM after Messages, in registry order; never stored (D-33). */
  builtIn?: boolean;
}

/** A signed-in page of its own, drawn beside the rail (M7, first use: Docs and Boards "Soon"). */
export interface FeatureRoute {
  path: string;
  element: ReactNode;
  /** The left column beside the rail (D-37, first use: the Docs tree and the Boards project list). */
  column?: ReactNode;
}

/** Translation for other features' text (D-37; first use: Docs and Boards). Absent when no feature provides it. */
export interface TextTranslation {
  /** null when this person may not translate in this space (not team, or a client space). */
  useTranslator(spaceId: string): {
    target: 'en' | 'ja';
    /** Looks like the other language and fits the service's limits. */
    offers(text: string, html?: string): boolean;
    /** `id` keys the cache, e.g. pageId + ':' + blockIndex. */
    translate(source: { id: string; body: string; html?: string }): Promise<{ html?: string; text?: string }>;
    icon: ReactNode;
    labels: { translate: string; showOriginal: string; failed: string; retry: string };
  } | null;
}

/** Drawn under a message's text (M7, first use: link cards). Returns null when it doesn't apply. */
export interface MessagePart {
  id: string;
  Part: ComponentType<{ message: Message }>;
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
  routes?: FeatureRoute[];
  channelTabs?: ChannelTabType[];
  messageActions?: MessageAction[];
  messageParts?: MessagePart[];
  translation?: TextTranslation;
}

export function defineFeature<F extends Feature>(feature: F): F {
  return feature;
}

export interface Registry {
  rail: RailItem[];
  routes: FeatureRoute[];
  channelTabs: ReadonlyMap<string, ChannelTabType>;
  messageActions: MessageAction[];
  messageParts: MessagePart[];
  /** The first feature's translation, if any feature provides one. */
  translation?: TextTranslation;
}

export function buildRegistry(features: readonly Feature[]): Registry {
  const channelTabs = new Map<string, ChannelTabType>();
  for (const f of features) for (const tab of f.channelTabs ?? []) channelTabs.set(tab.type, tab);
  return {
    rail: features.flatMap((f) => f.rail ?? []),
    routes: features.flatMap((f) => f.routes ?? []),
    channelTabs,
    messageActions: features.flatMap((f) => f.messageActions ?? []),
    messageParts: features.flatMap((f) => f.messageParts ?? []),
    translation: features.find((f) => f.translation)?.translation,
  };
}

/** A tab saved on a channel. Nothing is stored yet: the first addable tab brings `work.pasodrum.tab` (D-33). */
export interface StoredTab {
  id: string;
  type: string;
}

export const noStoredTabs: readonly StoredTab[] = [];

/** Built-in tabs, then stored ∩ registered: a tab whose feature was removed is skipped, never an error. Messages is implicit. */
export function visibleTabs(stored: readonly StoredTab[], registry: Registry) {
  const seen = new Set<string>();
  const out: { id: string; tab: ChannelTabType }[] = [];
  for (const tab of registry.channelTabs.values()) {
    if (!tab.builtIn) continue;
    seen.add(tab.type);
    out.push({ id: tab.type, tab });
  }
  for (const s of stored) {
    const tab = registry.channelTabs.get(s.type);
    if (!tab || tab.builtIn || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ id: s.id, tab });
  }
  return out;
}
