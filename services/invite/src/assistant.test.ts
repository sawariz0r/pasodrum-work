// The Assistant's provider adapter and answer checks (spec §2.5, §4.3), without the network.
import { describe, expect, it } from 'vitest';
import { answerTool, checkAnswer, clean, offeredFrom, type AnswerContext } from './assistant/answer.ts';
import type { Known } from './assistant/ledger.ts';
import { ProviderError, createStep, developer, type StepArgs } from './assistant/provider.ts';
import { costMicros, estimate } from './assistant/usage.ts';

const args = (over: Partial<StepArgs> = {}): StepArgs => ({
  model: 'm', effort: 'low', items: [developer('rules')], tools: [], signal: new AbortController().signal, tag: 'tag', maxOutput: 6000, answerOnly: false, ...over,
});
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const completed = { status: 'completed', output: [{ type: 'reasoning', id: 'rs_1', encrypted_content: 'x' }, { type: 'function_call', call_id: 'c1', name: 'answer', arguments: '{}' }], usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40, cache_write_tokens: 10 }, output_tokens: 30, output_tokens_details: { reasoning_tokens: 20 } } };

function fakeFetch(replies: Response[]) {
  const sent: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    const r = replies.shift();
    if (!r) throw new Error('no reply');
    return r;
  }) as unknown as typeof fetch;
  return { f, sent };
}

describe('provider', () => {
  it('sends store false, the tag, explicit caching and the breakpoint on the developer message; parses usage', async () => {
    const { f, sent } = fakeFetch([reply(200, completed)]);
    const r = await createStep('key', f)(args({ answerOnly: true }));
    const body = JSON.parse(String(sent[0]!.init.body));
    expect(sent[0]!.url).toBe('https://api.openai.com/v1/responses');
    expect(body).toMatchObject({ store: false, safety_identifier: 'tag', reasoning: { effort: 'low' }, prompt_cache_options: { mode: 'explicit' }, tool_choice: { type: 'function', name: 'answer' }, max_output_tokens: 6000 });
    expect(body.input[0]).toMatchObject({ role: 'developer', content: [{ type: 'input_text', text: 'rules', prompt_cache_breakpoint: { ttl: '30m' } }] });
    expect(r.usage).toEqual({ input: 100, cached: 40, written: 10, output: 30, reasoning: 20 });
    expect(r.items).toHaveLength(2);
  });

  it('retries once on a rate-limit 429 or a 503, never on a spending 429', async () => {
    const rate = fakeFetch([reply(429, { error: { code: 'rate_limit_exceeded', message: 'secret text' } }, { 'retry-after': '0' }), reply(200, completed)]);
    await createStep('key', rate.f)(args());
    expect(rate.sent).toHaveLength(2);

    const twice = fakeFetch([reply(503, {}, { 'retry-after': '0' }), reply(503, {}, { 'retry-after': '0' })]);
    await expect(createStep('key', twice.f)(args())).rejects.toMatchObject({ reason: 'busy', unbilled: true });
    expect(twice.sent).toHaveLength(2);

    const spend = fakeFetch([reply(429, { error: { code: 'project_spend_limit_exceeded', message: 'secret text' } })]);
    const e = await createStep('key', spend.f)(args()).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(e).toMatchObject({ reason: 'spending', message: 'spending' });
    expect(spend.sent).toHaveLength(1);
  });

  it('throws fixed reasons only: cut off, refused, failed, aborted', async () => {
    const run = (r: Response) => createStep('key', fakeFetch([r]).f)(args()).catch((x: ProviderError) => x);
    expect(await run(reply(200, { ...completed, status: 'incomplete' }))).toMatchObject({ reason: 'cut-off', usage: { input: 100 } });
    expect(await run(reply(200, { ...completed, output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'secret text' }] }] }))).toMatchObject({ reason: 'refused' });
    const failed = await run(reply(400, { error: { message: 'secret text' } }));
    expect(failed).toMatchObject({ reason: 'failed' });
    expect(JSON.stringify(failed) + String(failed)).not.toContain('secret');
    const c = new AbortController();
    c.abort();
    const aborted = await createStep('key', (async () => { throw new Error('secret text'); }) as unknown as typeof fetch)(args({ signal: c.signal })).catch((x: ProviderError) => x);
    expect(aborted).toMatchObject({ reason: 'aborted', message: 'aborted' });
  });
});

describe('cost', () => {
  it('prices plain, cached, written and output tokens; estimates a cut-off call up to the cap', () => {
    expect(costMicros({ in: 2, cached: 0.1, write: 2.5, out: 10 }, { input: 1000, cached: 400, written: 100, output: 50, reasoning: 30 })).toBe(Math.ceil(500 * 2 + 400 * 0.1 + 100 * 2.5 + 50 * 10));
    expect(estimate(300, 2000, 100)).toEqual({ input: 100, cached: 0, written: 0, output: 100, reasoning: 0 });
  });
});

describe('answer', () => {
  const where = { in: 'workspace' } as const;
  const msg: Known = { handle: 'M1', kind: 'message', ref: { k: 'message', room: '!r', event: '$e' }, plain: 'Mia: due on the 14th', room: '!r', placeName: 'portal', where, seen: '{"text":"due on the 14th, 3 left"}' };
  const place: Known = { handle: 'P2', kind: 'place', ref: { k: 'place', room: '!r' }, plain: 'portal', room: '!r', placeName: 'portal', where, seen: '{"place":"portal"}' };
  const ctx = (over: Partial<AnswerContext> = {}): AnswerContext => ({
    known: (h) => (h === 'M1' ? msg : h === 'P2' ? place : undefined), offered: offeredFrom(['message', 'open', 'text.summary']), allowed: new Set(['2']), clientFacing: false, clientOk: false, ...over,
  });

  it('offers only what the app can draw', () => {
    type Schema = { properties: { parts: { maxItems?: number; items: { anyOf: { properties: { type: { enum: string[] } } }[] } } } };
    const parts = (can: string[]) => (answerTool(offeredFrom(can)).parameters as unknown as Schema).properties.parts;
    expect(parts(['message']).items.anyOf.map((v) => v.properties.type.enum[0])).toEqual(['source']);
    expect(parts(['issue']).maxItems).toBe(0);
  });

  it('drops unknown handles and kinds; plain comes from what was read', () => {
    const c = checkAnswer({ outcome: 'answered', say: 'Here.', parts: [{ type: 'source', handle: 'M1' }, { type: 'source', handle: 'M9' }, { type: 'proposal', kind: 'boards.issue' }, { type: 'open', handle: 'P2' }, { type: 'heading', handle: 'P2' }] }, ctx());
    expect(c.answer.parts).toEqual([{ t: 'source', target: msg.ref, plain: msg.plain }, { t: 'open', target: place.ref, plain: 'portal' }]);
  });

  it('removes links, emails and Matrix ids; strips direction and control characters; keeps markup as characters', () => {
    expect(checkAnswer({ outcome: 'answered', say: 'See https://evil.example now. It is fine.', parts: [] }, ctx()).answer.say).toBe('It is fine.');
    expect(checkAnswer({ outcome: 'answered', say: 'Mail a@b.example. Ask @ana:server.x. Or ｗｗｗ．evil．com.', parts: [] }, ctx()).answer.say).toBe('');
    expect(checkAnswer({ outcome: 'answered', say: '<b>Hi</b> **there**‮\u0007', parts: [] }, ctx()).answer.say).toBe('<b>Hi</b> **there**');
    expect(clean('x'.repeat(400), 320)).toHaveLength(320);
  });

  it('removes sentences with numbers nobody showed it, and reports them for the repair round', () => {
    const c = checkAnswer({ outcome: 'answered', say: 'It is due on the 14th. About 37 people agree. You asked about 2.', parts: [{ type: 'source', handle: 'M1' }] }, ctx());
    expect(c.answer.say).toBe('It is due on the 14th. You asked about 2.');
    expect(c.invented).toEqual(['37']);
    expect(checkAnswer({ outcome: 'answered', say: 'Due the 14th.', parts: [] }, ctx()).invented).toEqual(['14']);
  });

  it('keeps a client-facing summary only when every source lies in that client space', () => {
    const summary = { outcome: 'answered', say: 'Here.', parts: [{ type: 'text', kind: 'summary', for: null, lines: ['Notes'] }] };
    expect(checkAnswer(summary, ctx({ clientFacing: true, clientOk: false }))).toMatchObject({ clientDropped: true, answer: { parts: [] } });
    expect(checkAnswer(summary, ctx({ clientFacing: true, clientOk: true })).answer.parts).toEqual([{ t: 'text', kind: 'summary', lines: ['Notes'] }]);
    expect(checkAnswer(summary, ctx({ offered: offeredFrom(['message']) })).answer.parts).toEqual([]);
  });
});
