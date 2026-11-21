// Order keys for pages and issues (fractional indexing). Loaded on demand by the move and create commands.
import { generateKeyBetween } from 'fractional-indexing';
import { byOrder } from './docsBoardsTypes';

type Ordered = { id: string; order: string };

/**
 * A key between two neighbours' keys (either may be missing: the start or the end). Two neighbours with the same key
 * (concurrent moves) get a key just after them, bounded by `next`, the first key after them that differs.
 */
export function keyBetween(before?: string, after?: string, next?: string): string {
  if (before !== undefined && after !== undefined && before >= after) return generateKeyBetween(before, next !== undefined && next > before ? next : null);
  return generateKeyBetween(before ?? null, after ?? null);
}

export function sortIssues<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort(byOrder);
}

/** The key for putting an item among its future siblings (itself excluded); neither neighbour = last. */
export function orderAmong(siblings: readonly Ordered[], to: { before?: string; after?: string }): string {
  const list = sortIssues(siblings);
  let i = to.before !== undefined ? list.findIndex((x) => x.id === to.before) : -1;
  let j = to.after !== undefined ? list.findIndex((x) => x.id === to.after) : -1;
  if (i < 0 && j < 0) i = list.length - 1;
  if (i < 0 && j >= 0) i = j - 1;
  if (j < 0) j = i + 1;
  const before = list[i]?.order;
  const after = list[j]?.order;
  const next = before === undefined ? undefined : list.slice(i + 1).find((x) => x.order > before)?.order;
  return keyBetween(before, after, next);
}

/** Whether making `newParent` the parent of `pageId` puts the page inside its own subtree. */
export function wouldCycle(parents: Readonly<Record<string, string | undefined>>, pageId: string, newParent?: string): boolean {
  const seen = new Set<string>();
  for (let at = newParent; at !== undefined && !seen.has(at); at = parents[at]) {
    if (at === pageId) return true;
    seen.add(at);
  }
  return false;
}
