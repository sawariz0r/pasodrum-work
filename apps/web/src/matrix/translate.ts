// Our translation service (SIDE-01), same origin under /api/translate. The OpenAI key lives only on the server.
const ERRORS: Record<number, string> = { 429: 'rate-limited', 503: 'unavailable' };

export async function translateSegments(token: string, segments: string[], to: 'en' | 'ja'): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${location.origin}/api/translate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ segments, to }),
    });
  } catch {
    throw new Error('unavailable');
  }
  if (!res.ok) throw new Error(ERRORS[res.status] ?? 'failed');
  const data = (await res.json().catch(() => null)) as { segments?: unknown } | null;
  const out = data?.segments;
  if (!Array.isArray(out) || out.length !== segments.length || !out.every((x) => typeof x === 'string')) throw new Error('failed');
  return out as string[];
}
