// Usage and the two limits (spec §6): one row per ask, set aside when the ask opens and raised as it spends. Counts only;
// a row never holds the ask, the answer, a search word or a tool argument.
import { createHmac, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { Usage } from './provider.ts';
import { CAPS, LIMITS, type Availability, type Depth, type Status } from './wire.ts';

export type Price = { in: number; cached: number; write: number; out: number };
export type Outcome = 'open' | 'answered' | 'nothing' | 'cant' | 'stopped' | 'failed';
export type Spend = { calls: number; counts: Usage; costMicros: number; ms: number };
export type Opened = { id: number } | 'day-limit' | 'month-limit';

const LOW_MICROS = 1_000_000;
// Output tokens a second, for a call that ends without a usage report (§6.2); spike 1 sets the real figure per model.
const TOKENS_PER_SECOND = 150;
const CHARS_PER_TOKEN = 3;

export const zero = (): Usage => ({ input: 0, cached: 0, written: 0, output: 0, reasoning: 0 });
export const add = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, cached: a.cached + b.cached, written: a.written + b.written, output: a.output + b.output, reasoning: a.reasoning + b.reasoning });

/** Dollars per million tokens times tokens is millionths of a dollar. `input` includes the cached and written tokens. */
export function costMicros(price: Price, u: Usage): number {
  const plain = Math.max(0, u.input - u.cached - u.written);
  return Math.ceil(plain * price.in + u.cached * price.cached + u.written * price.write + u.output * price.out);
}

/** A call cut off by Stop, a timeout or a lost connection: the input sent, plus output for the time it ran, up to the cap. */
export function estimate(inputChars: number, ms: number, outputLeft: number): Usage {
  const output = Math.max(0, Math.min(outputLeft, Math.ceil((ms / 1000) * TOKENS_PER_SECOND)));
  return { input: Math.ceil(inputChars / CHARS_PER_TOKEN), cached: 0, written: 0, output, reasoning: 0 };
}

export const validTz = (tz: unknown): tz is number => Number.isInteger(tz) && (tz as number) >= LIMITS.tzMin && (tz as number) <= LIMITS.tzMax;

export function openUsage(db: DatabaseSync, limits: { dayUsd: number; monthUsd: number }, now: () => number) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assistant_usage (
      id INTEGER PRIMARY KEY, at INTEGER NOT NULL, day TEXT NOT NULL, tz INTEGER NOT NULL, userId TEXT NOT NULL,
      feature TEXT NOT NULL, depth TEXT NOT NULL, model TEXT NOT NULL, effort TEXT NOT NULL, calls INTEGER NOT NULL,
      input INTEGER NOT NULL, cached INTEGER NOT NULL, written INTEGER NOT NULL, output INTEGER NOT NULL, reasoning INTEGER NOT NULL,
      costMicros INTEGER NOT NULL, ms INTEGER NOT NULL, outcome TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS assistant_usage_day ON assistant_usage (day, userId);
    CREATE INDEX IF NOT EXISTS assistant_usage_at ON assistant_usage (at);
    CREATE TABLE IF NOT EXISTS assistant_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updatedTs INTEGER NOT NULL, updatedBy TEXT NOT NULL);
  `);
  const getSetting = db.prepare('SELECT value FROM assistant_settings WHERE key = ?');
  const setting = (key: string) => (getSetting.get(key) as { value: string } | undefined)?.value;
  if (!setting('tag')) {
    db.prepare("INSERT OR IGNORE INTO assistant_settings (key, value, updatedTs, updatedBy) VALUES ('tag', ?, ?, 'service')").run(randomBytes(32).toString('hex'), now());
  }
  const tagKey = setting('tag')!;

  const daySpent = db.prepare('SELECT coalesce(sum(costMicros), 0) AS n FROM assistant_usage WHERE day = ? AND userId = ?');
  const monthSpent = db.prepare('SELECT coalesce(sum(costMicros), 0) AS n FROM assistant_usage WHERE at >= ?');
  const insert = db.prepare(`INSERT INTO assistant_usage (at, day, tz, userId, feature, depth, model, effort, calls, input, cached, written, output, reasoning, costMicros, ms, outcome)
    VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, 0, 'open')`);
  const raise = db.prepare('UPDATE assistant_usage SET calls = ?, input = ?, cached = ?, written = ?, output = ?, reasoning = ?, costMicros = max(costMicros, ?), ms = ? WHERE id = ?');
  const settle = db.prepare('UPDATE assistant_usage SET calls = ?, input = ?, cached = ?, written = ?, output = ?, reasoning = ?, costMicros = ?, ms = ?, outcome = ? WHERE id = ?');

  const limitMicros = (key: 'dayUsd' | 'monthUsd') => {
    const v = setting(key);
    const usd = v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : limits[key];
    return Math.round(usd * 1_000_000);
  };
  const dayOf = (tz: number) => new Date(now() + tz * 60_000).toISOString().slice(0, 10);
  const monthStart = () => {
    const d = new Date(now());
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  };
  const sum = (stmt: ReturnType<DatabaseSync['prepare']>, ...args: (string | number)[]) => Number((stmt.get(...args) as { n: number }).n);

  function left(userId: string, tz: number) {
    return { day: limitMicros('dayUsd') - sum(daySpent, dayOf(tz), userId), month: limitMicros('monthUsd') - sum(monthSpent, monthStart()) };
  }

  const values = (s: Spend) => [s.calls, s.counts.input, s.counts.cached, s.counts.written, s.counts.output, s.counts.reasoning, s.costMicros, s.ms] as const;

  return {
    tag: (userId: string) => createHmac('sha256', tagKey).update(userId).digest('hex'),

    /** Steps 1 to 3 of §6.4, synchronously, so two asks cannot both slip past. */
    open(o: { userId: string; tz: number; depth: Depth; model: string; effort: string }): Opened {
      const setAside = CAPS[o.depth].setAsideMicros;
      const l = left(o.userId, o.tz);
      if (setAside > l.day) return 'day-limit';
      if (setAside > l.month) return 'month-limit';
      const r = insert.run(now(), dayOf(o.tz), o.tz, o.userId, o.depth, o.model, o.effort, setAside);
      return { id: Number(r.lastInsertRowid) };
    },
    raise: (id: number, s: Spend) => void raise.run(...values(s), id),
    close: (id: number, s: Spend, outcome: Exclude<Outcome, 'open'>) => void settle.run(...values(s), outcome, id),

    /** GET /api/assistant/status: no amounts. */
    status(userId: string, tz: number): Status {
      const l = left(userId, tz);
      const quick = CAPS.quick.setAsideMicros;
      const ask = quick > l.day ? 'day' : quick > l.month ? 'month' : 'ok';
      const thorough: Availability = ask !== 'ok' ? ask : l.day < LOW_MICROS || l.month < LOW_MICROS ? 'low' : 'ok';
      return { ask, thorough };
    },
  };
}

export type UsageBook = ReturnType<typeof openUsage>;
