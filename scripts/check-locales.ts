import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = join(import.meta.dirname, '..');
const web = join(root, 'apps/web/src');
const languages = ['en', 'ja'];

// Matrix words people must never see (AGENTS.md invariant 1, D-11). Checked in English copy.
const forbidden: [RegExp, string][] = [
  [/\brooms?\b/i, 'room → channel'],
  [/\bhomeservers?\b/i, 'homeserver'],
  [/\bmatrix\b/i, 'Matrix'],
  [/\binvit(e|es|ed|ing|ation|ations)\b/i, 'invite → add people'],
  [/\bfederat/i, 'federation'],
  [/(?<!client )\bspaces?\b/i, 'space → workspace / client space'],
  [/\bencrypt|\bunencrypt/i, 'no encryption claims'],
];

type Dict = { [key: string]: string | Dict };

const pluralSuffix = /_(zero|one|two|few|many|other)$/;

function flatten(dict: Dict, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(dict)) {
    const key = prefix + k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key + '.')) out.set(kk, vv);
  }
  return out;
}

function byBaseKey(flat: Map<string, string>) {
  const out = new Map<string, Set<string>>();
  for (const [key, value] of flat) {
    const base = key.replace(pluralSuffix, '');
    const vars = out.get(base) ?? new Set<string>();
    for (const m of value.matchAll(/\{\{\s*([\w.]+)/g)) vars.add(m[1]!);
    out.set(base, vars);
  }
  return out;
}

const dirs = [join(web, 'locales'), join(web, 'app/workspace/locales')];
const featuresDir = join(web, 'features');
for (const f of readdirSync(featuresDir, { withFileTypes: true })) {
  const dir = join(featuresDir, f.name, 'locales');
  if (f.isDirectory() && existsSync(dir)) dirs.push(dir);
}

const errors: string[] = [];

for (const dir of dirs) {
  const where = relative(root, dir);
  const sets = new Map<string, Map<string, Set<string>>>();
  for (const lng of languages) {
    const file = join(dir, `${lng}.json`);
    if (!existsSync(file)) { errors.push(`${where}: missing ${lng}.json`); continue; }
    const flat = flatten(JSON.parse(readFileSync(file, 'utf8')) as Dict);
    sets.set(lng, byBaseKey(flat));
    if (lng === 'en') {
      for (const [key, value] of flat) {
        for (const [re, why] of forbidden) {
          if (re.test(value)) errors.push(`${where}/en.json ${key}: "${value}" (${why})`);
        }
      }
    }
  }
  const [en, ja] = [sets.get('en'), sets.get('ja')];
  if (!en || !ja) continue;
  for (const [a, b, name] of [[en, ja, 'ja'], [ja, en, 'en']] as const) {
    for (const key of a.keys()) if (!b.has(key)) errors.push(`${where}/${name}.json: missing ${key}`);
  }
  for (const [key, vars] of en) {
    const other = ja.get(key);
    if (other && [...vars].sort().join() !== [...other].sort().join()) {
      errors.push(`${where}: ${key} interpolates {${[...vars]}} in en but {${[...other]}} in ja`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`locales ok (${dirs.length} folder${dirs.length === 1 ? '' : 's'})`);
