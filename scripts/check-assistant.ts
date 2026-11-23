// The Assistant's fence (docs/specs/assistant.md §2.1): files in services/invite/src/assistant/ import nothing from
// outside the folder except ws, yjs and node:*, never read process.env, and call fetch only in provider.ts and reader.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = join(import.meta.dirname, '..');
const folder = join(root, 'services/invite/src/assistant');
const PACKAGES = new Set(['ws', 'yjs']);
const MAY_FETCH = new Set(['provider.ts', 'reader.ts']);

const files = readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((f) => /\.[cm]?[tj]sx?$/.test(f));
const problems: string[] = [];

for (const file of files) {
  const path = join(folder, file);
  const name = relative(root, path);
  const src = readFileSync(path, 'utf8');
  const specifiers = [
    ...src.matchAll(/\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"`]([^'"`]+)['"`]/g),
    ...src.matchAll(/\bimport\s*['"`]([^'"`]+)['"`]/g),
    ...src.matchAll(/\b(?:import|require)\s*\(\s*([^)]*)\)/g),
  ].map((m) => m[1]!.trim());
  for (const spec of specifiers) {
    const literal = /^['"`]([^'"`]+)['"`]$/.exec(spec)?.[1] ?? (/['"`(]/.test(spec) ? null : spec);
    if (literal === null) {
      problems.push(`${name}: dynamic import`);
      continue;
    }
    const bare = literal.split('/')[0]!;
    if (literal.startsWith('node:') || PACKAGES.has(literal) || PACKAGES.has(bare)) continue;
    const target = literal.startsWith('.') ? resolve(dirname(path), literal) : null;
    if (target && (target + sep).startsWith(folder + sep) && target !== folder) continue;
    problems.push(`${name}: imports "${literal}" from outside the folder`);
  }
  if (/\bprocess\s*(?:\.\s*env\b|\[)|\bprocess\s*\)\s*\.\s*env\b|\bglobalThis\s*(?:\.\s*process\b|\[)/.test(src)) problems.push(`${name}: reads process.env`);
  if (/\bfetch\b/.test(src) && !MAY_FETCH.has(file)) problems.push(`${name}: calls fetch (only provider.ts and reader.ts may)`);
}

if (problems.length) {
  console.error(`Assistant fence broken:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Assistant fence OK (${files.length} files).`);
