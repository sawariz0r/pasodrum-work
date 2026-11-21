// The match marked in ⌘K and search rows, folded the same way search matches (NFKC + case, matrix fold): a full-width
// or half-width query marks the text as written.
import { fold } from '../../matrix';

export type Part = { text: string; hit: boolean };

/** A base character with the marks that follow it (combining marks, half-width ﾞ ﾟ), so NFKC sees them together. */
const joins = (ch: string) => /\p{M}/u.test(ch) || ch === 'ﾞ' || ch === 'ﾟ';

export function highlight(text: string, query: string): Part[] {
  const needle = fold(query.trim());
  if (!needle) return [{ text, hit: false }];
  // folded[k] came from text[from[k]] … text[to[k]].
  let folded = '';
  const from: number[] = [];
  const to: number[] = [];
  const chars = Array.from(text);
  for (let i = 0, at = 0; i < chars.length; ) {
    let cluster = chars[i++]!;
    while (i < chars.length && joins(chars[i]!)) cluster += chars[i++];
    const f = fold(cluster);
    for (let k = 0; k < f.length; k++) {
      from.push(at);
      to.push(at + cluster.length);
    }
    folded += f;
    at += cluster.length;
  }
  const parts: Part[] = [];
  let done = 0;
  for (let j = folded.indexOf(needle); j >= 0; j = folded.indexOf(needle, j + needle.length)) {
    const start = from[j]!;
    const end = to[j + needle.length - 1]!;
    if (start < done) continue;
    if (start > done) parts.push({ text: text.slice(done, start), hit: false });
    parts.push({ text: text.slice(start, end), hit: true });
    done = end;
  }
  if (done < text.length) parts.push({ text: text.slice(done), hit: false });
  return parts;
}
