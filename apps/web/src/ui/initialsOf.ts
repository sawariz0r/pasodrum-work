const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;

export function isCjk(text: string): boolean {
  return CJK.test(text);
}

export function initialsOf(name: string): string {
  const n = name.trim();
  if (!n) return '';
  if (isCjk(n)) return Array.from(n)[0] ?? '';
  const words = n.split(/\s+/);
  const first = Array.from(words[0] ?? '')[0] ?? '';
  const last = words.length > 1 ? (Array.from(words[words.length - 1] ?? '')[0] ?? '') : '';
  return (first + last).toUpperCase();
}
