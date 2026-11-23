// The Assistant's wire contract (docs/specs/assistant.md §2.3, §4.2, §5.1). Types and constants only.
// This file exists twice and the copies must stay identical: services/invite/src/assistant/wire.ts and
// apps/web/src/matrix/assistantWire.ts (a script in `pnpm check` compares them).

export const WIRE_VERSION = 1;

/** A typed id for a source or a place. The model never sees one; it sees handles. */
export type Ref =
  | { k: 'place'; room: string }
  | { k: 'thread'; room: string; root: string }
  | { k: 'message'; room: string; event: string }
  | { k: 'project'; project: string }
  | { k: 'issue'; project: string; issue: string }
  | { k: 'page'; page: string }
  | { k: 'person'; user: string }
  | { k: 'space'; space: string };

export type Depth = 'quick' | 'thorough';
export type Lang = 'en' | 'ja';

/** What a screen reports, as sent: references only, never text. The chip's label and the suggested asks stay in the browser. */
export interface AskContext {
  kind: string;
  layer: 'page' | 'panel';
  refs: Ref[];
  selection?: Ref;
  /** The newest message on screen (an event id); reading stops there. */
  newest?: string;
  /** The screen is an encrypted conversation: no refs. */
  closed?: 'sealed';
}

/** One earlier turn of today's conversation. Untrusted on the server. A turn that used sealed text is never sent. */
export interface HistoryTurn {
  ask: string;
  say: string;
  sources: Ref[];
}

/** Slice 4: messages from an encrypted conversation, handed over after the person's yes. */
export interface SealedAttachment {
  room: string;
  messages: { event: string; text: string }[];
}

/** The part, proposal and view kinds this app can draw. */
export interface Can {
  parts: string[];
  proposals: string[];
  views: string[];
}

export type ClientMessage =
  | { t: 'auth'; token: string; v: number }
  | {
      t: 'hello';
      ask: string;
      lang: Lang;
      /** Whole minutes from UTC, -720 to 840. */
      tz: number;
      depth: Depth;
      closer?: boolean;
      context: AskContext | null;
      history: HistoryTurn[];
      can: Can;
      sealed?: SealedAttachment[];
    }
  | { t: 'found'; id: number; hits: Ref[] }
  | { t: 'places'; id: number; places: Ref[] }
  | { t: 'stop' };

export type AskError = 'day-limit' | 'month-limit' | 'not-allowed' | 'unavailable' | 'failed';
export type Availability = 'ok' | 'low' | 'day' | 'month';

export type ServerMessage =
  | { t: 'status'; stage: 'looking' | 'closer'; places: Ref[] }
  | { t: 'find'; id: number; query: string; in: Ref[] | null }
  | { t: 'list'; id: number }
  | { t: 'answer'; answer: Answer }
  | { t: 'error'; reason: AskError };

/** One place that was read, for the "Looked in" line and its list. `plain` is written by the server from what it read. */
export interface Looked {
  target: Ref;
  plain: string;
  /** Messages, issues or pages read there. */
  count?: number;
  /** How many of them came from an encrypted conversation. */
  sealed?: number;
}

export type Part =
  | { t: 'source'; target: Ref; plain: string; sealed?: true }
  | { t: 'heading'; target: Ref; plain: string }
  | { t: 'open'; target: Ref; plain: string }
  | { t: 'text'; kind: 'summary'; for?: Ref; lines: string[] }
  | { t: 'proposal'; kind: string; fields: Record<string, unknown>; plain: string };

export interface Answer {
  outcome: 'answered' | 'nothing' | 'cant';
  depth: Depth;
  say: string;
  parts: Part[];
  looked: Looked[];
  /** This turn is left out of later history (spec §3.5). */
  usedSealed: boolean;
  thorough: Availability;
}

/** GET /api/assistant/status */
export interface Status {
  ask: 'ok' | 'day' | 'month';
  thorough: Availability;
}

export const CLOSE = { unauthorized: 4401, notAllowed: 4403, tooMany: 4429 } as const;

/** Sizes both sides enforce (the server is the judge). */
export const LIMITS = {
  ask: 2000,
  queryMin: 2,
  queryMax: 80,
  hits: 20,
  places: 300,
  contextRefs: 8,
  inRefs: 20,
  historyTurns: 6,
  historyChars: 6000,
  historyRefs: 30,
  authBytes: 4096,
  messageBytes: 256 * 1024,
  authMs: 10_000,
  sealedMessages: 40,
  sealedChars: 24_000,
  sealedPerRoom: 10,
  say: 320,
  line: 200,
  lines: 8,
  title: 200,
  description: 4000,
  parts: 12,
  itemChars: 1000,
  tzMin: -720,
  tzMax: 840,
} as const;

/** Caps per ask (spec §3.7); starting values, tuned by the quality set. */
export const CAPS = {
  quick: { modelCalls: 6, toolCalls: 10, finds: 4, sourceChars: 24_000, outputTokens: 6000, costMicros: 300_000, callMs: 30_000, askMs: 60_000, setAsideMicros: 100_000 },
  thorough: { modelCalls: 8, toolCalls: 16, finds: 6, sourceChars: 60_000, outputTokens: 30_000, costMicros: 2_000_000, callMs: 120_000, askMs: 300_000, setAsideMicros: 1_000_000 },
} as const;

export const FIND_MS = 4000;
