// @vitest-environment happy-dom
import { MatrixEvent } from 'matrix-js-sdk';
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './html';
import { linksOf } from './map';

const VICTIM = '@victim:pasodrum.work';
const ATTACKER = '@attacker:pasodrum.work';
const ROOM = '!general:pasodrum.work';
const SERVER = 'pasodrum.work';
/**
 * Closing brackets after `http://a`. 60_000 still fits in a signed PDU at the
 * maximum auth/prev counts Continuwuity 26.9.4 accepts (65535 bytes).
 */
const CLOSERS = 60_000;
/** A single linear scan of this payload is a few milliseconds. */
const BUDGET_MS = 1_000;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const token = (seed: number, len: number) => {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[(seed + i * 17) % ALPHABET.length]!;
  return out;
};

/** Canonical JSON (sorted keys, no whitespace), the form `pdu_fits` measures. */
const canonical = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`).join(',')}}`;
};

/**
 * A signed message PDU with the largest auth_events and prev_events lists the
 * server still accepts (10 and 20). Byte length is what the 65535 check uses.
 */
const pduBytes = (content: Record<string, unknown>) => {
  const eventId = (n: number) => `$${token(n, 43)}`;
  const pdu = {
    auth_events: Array.from({ length: 10 }, (_, i) => eventId(100 + i)),
    content,
    depth: 42,
    event_id: eventId(1),
    hashes: { sha256: `${token(2, 43)}=` },
    origin_server_ts: 1_764_200_000_000,
    prev_events: Array.from({ length: 20 }, (_, i) => eventId(200 + i)),
    room_id: ROOM,
    sender: ATTACKER,
    signatures: { [SERVER]: { [`ed25519:${token(4, 43)}`]: `${token(5, 86)}==` } },
    type: 'm.room.message',
  };
  return new TextEncoder().encode(canonical(pdu)).length;
};

const syncedContent = (content: Record<string, unknown>) =>
  new MatrixEvent({
    type: 'm.room.message',
    sender: ATTACKER,
    event_id: `$${token(9, 43)}`,
    room_id: ROOM,
    origin_server_ts: 1_764_200_000_000,
    content,
  }).getContent();

const formattedContent = (closer: ')' | ']') => ({
  msgtype: 'm.text',
  body: 'see',
  format: 'org.matrix.custom.html',
  formatted_body: `<p>http://a${closer.repeat(CLOSERS)} ${VICTIM}</p>`,
  'm.mentions': { user_ids: [VICTIM] },
});

const plainContent = (closer: ')' | ']') => ({
  msgtype: 'm.text',
  body: `http://a${closer.repeat(CLOSERS)} ${VICTIM}`,
  'm.mentions': { user_ids: [VICTIM] },
});

/** activityOf's mention gate: m.mentions or the victim id inside formatted_body. */
const activityMentionsVictim = (content: Record<string, unknown>) => {
  const mentioned = (content['m.mentions'] as { user_ids?: unknown } | undefined)?.user_ids;
  return (Array.isArray(mentioned) && mentioned.includes(VICTIM)) || (typeof content.formatted_body === 'string' && content.formatted_body.includes(VICTIM));
};

const elapsed = (run: () => void) => {
  const started = performance.now();
  run();
  return performance.now() - started;
};

describe('trailing-bracket URL trim stays within a linear budget', () => {
  it.each([')', ']'] as const)(
    'sanitizes a formatted mention whose URL ends in 60000 %s characters',
    (closer) => {
      const content = syncedContent(formattedContent(closer));
      expect(content.format).toBe('org.matrix.custom.html');
      expect(typeof content.formatted_body).toBe('string');
      expect(activityMentionsVictim(content)).toBe(true);
      expect(pduBytes(content)).toBeLessThanOrEqual(65_535);
      expect(elapsed(() => sanitizeHtml(content.formatted_body as string))).toBeLessThan(BUDGET_MS);
    },
    30_000,
  );

  it.each([')', ']'] as const)(
    'extracts links from a plain body whose URL ends in 60000 %s characters',
    (closer) => {
      const content = syncedContent(plainContent(closer));
      expect(typeof content.body).toBe('string');
      expect(content.format).toBeUndefined();
      const mentioned = (content['m.mentions'] as { user_ids?: unknown } | undefined)?.user_ids;
      expect(Array.isArray(mentioned) && mentioned.includes(VICTIM)).toBe(true);
      expect(pduBytes(content)).toBeLessThanOrEqual(65_535);
      expect(elapsed(() => linksOf(content.body as string, null, false))).toBeLessThan(BUDGET_MS);
    },
    30_000,
  );
});
