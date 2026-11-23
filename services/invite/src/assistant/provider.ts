// The provider adapter (spec §2.5): one step of the Responses API over fetch, no SDK. Stateless (`store: false`), so the
// caller replays every output item. Throws fixed reasons only; the provider's own text never leaves this file.

export type ProviderItem = Record<string, unknown>;
export type Tool = { type: 'function'; name: string; description: string; parameters: Record<string, unknown>; strict: true };
export type Usage = { input: number; cached: number; written: number; output: number; reasoning: number };
export type StepArgs = {
  model: string;
  effort: string;
  items: ProviderItem[];
  tools: Tool[];
  signal: AbortSignal;
  /** The keyed per-person tag (`safety_identifier`). */
  tag: string;
  maxOutput: number;
  /** At a cap: the model must call `answer` now. */
  answerOnly: boolean;
};
export type StepResult = { items: ProviderItem[]; usage: Usage | null };
export type Step = (args: StepArgs) => Promise<StepResult>;
export type StepFailure = 'aborted' | 'spending' | 'busy' | 'refused' | 'cut-off' | 'failed';

export class ProviderError extends Error {
  reason: StepFailure;
  usage: Usage | null;
  /** The provider answered with an error before generating anything, so nothing was billed. */
  unbilled: boolean;
  constructor(reason: StepFailure, usage: Usage | null = null, unbilled = false) {
    super(reason);
    this.reason = reason;
    this.usage = usage;
    this.unbilled = unbilled;
  }
}

const ENDPOINT = 'https://api.openai.com/v1/responses';
const MAX_WAIT_MS = 5000;
const MIN_OUTPUT = 16;
// A billing or spending 429 never comes back by retrying.
const SPENDING = new Set(['project_spend_limit_exceeded', 'organization_spend_limit_exceeded', 'organization_usage_limit_exceeded', 'credit_balance_exhausted', 'insufficient_quota', 'billing_hard_limit_reached']);
// Explicit caching, one breakpoint: on the developer message, after the tool list and the instructions, so nothing from
// a source is ever written to the provider's cache. Field name per the caching guide; to confirm in spike 1.
const BREAKPOINT = { prompt_cache_breakpoint: { ttl: '30m' } };

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

export const developer = (text: string): ProviderItem => ({ type: 'message', role: 'developer', content: [{ type: 'input_text', text, ...BREAKPOINT }] });
export const userData = (text: string): ProviderItem => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });

export function parseUsage(u: unknown): Usage | null {
  if (!isObj(u)) return null;
  const inDetails = isObj(u.input_tokens_details) ? u.input_tokens_details : {};
  const outDetails = isObj(u.output_tokens_details) ? u.output_tokens_details : {};
  return { input: num(u.input_tokens), cached: num(inDetails.cached_tokens), written: num(inDetails.cache_write_tokens), output: num(u.output_tokens), reasoning: num(outDetails.reasoning_tokens) };
}

function retryAfterMs(h: string | null): number {
  const s = Number(h);
  const ms = Number.isFinite(s) ? s * 1000 : h ? Date.parse(h) - Date.now() : 1000;
  return Math.max(0, Math.min(MAX_WAIT_MS, Number.isFinite(ms) ? ms : 1000));
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new ProviderError('aborted'));
    const t = setTimeout(() => (signal.removeEventListener('abort', stop), resolve()), ms);
    const stop = () => (clearTimeout(t), reject(new ProviderError('aborted')));
    signal.addEventListener('abort', stop, { once: true });
  });

const refused = (output: unknown[]) =>
  output.some((i) => isObj(i) && i.type === 'message' && Array.isArray(i.content) && i.content.some((c) => isObj(c) && c.type === 'refusal'));

export function requestBody({ model, effort, items, tools, tag, maxOutput, answerOnly }: StepArgs) {
  return {
    model,
    input: items,
    tools,
    tool_choice: answerOnly ? { type: 'function', name: 'answer' } : 'required',
    reasoning: { effort },
    max_output_tokens: Math.max(MIN_OUTPUT, Math.floor(maxOutput)),
    store: false,
    safety_identifier: tag,
    prompt_cache_options: { mode: 'explicit' },
  };
}

export function createStep(apiKey: string, send: typeof fetch = fetch): Step {
  async function once(body: string, signal: AbortSignal): Promise<Response> {
    try {
      return await send(ENDPOINT, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body, signal, redirect: 'error' });
    } catch {
      throw new ProviderError(signal.aborted ? 'aborted' : 'failed');
    }
  }

  return async (args) => {
    const body = JSON.stringify(requestBody(args));
    let res = await once(body, args.signal);
    for (let attempt = 0; ; attempt++) {
      if (res.ok) break;
      let code: unknown;
      try {
        const err = ((await res.json()) as Json).error;
        code = isObj(err) ? err.code : undefined;
      } catch {
        code = undefined;
      }
      if (res.status === 429 && typeof code === 'string' && SPENDING.has(code)) throw new ProviderError('spending', null, true);
      if ((res.status !== 429 && res.status !== 503) || attempt > 0) throw new ProviderError(res.status === 429 || res.status === 503 ? 'busy' : 'failed', null, true);
      await wait(retryAfterMs(res.headers.get('retry-after')), args.signal);
      res = await once(body, args.signal);
    }
    let reply: Json;
    try {
      const parsed: unknown = await res.json();
      if (!isObj(parsed)) throw new Error('shape');
      reply = parsed;
    } catch {
      throw new ProviderError(args.signal.aborted ? 'aborted' : 'failed');
    }
    const usage = parseUsage(reply.usage);
    const output = Array.isArray(reply.output) ? reply.output.filter(isObj) : [];
    if (reply.status === 'incomplete') throw new ProviderError('cut-off', usage);
    if (reply.status !== 'completed') throw new ProviderError('failed', usage);
    if (refused(output)) throw new ProviderError('refused', usage);
    return { items: output, usage };
  };
}
