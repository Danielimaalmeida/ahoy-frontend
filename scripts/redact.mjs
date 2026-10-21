#!/usr/bin/env node
// Copy the repo with proprietary terms replaced, for sharing with external models,
// and reverse the replacement on code that comes back.
//   node scripts/redact.mjs [--out DIR] [--force] [--check-only]
//   node scripts/redact.mjs --unredact [--in DIR] [--out DIR] [--force]
// Redact copies only tracked and untracked-but-not-ignored files, so .local/, .work/,
// node_modules/ and dist/ never leave. Neither mode ever writes to the source tree.
//
// A rule is `term => placeholder`. A term written in one case (brand, BRAND or Brand: the same rule) matches its
// lowercase, UPPERCASE and Capitalized spellings and keeps that case in its placeholder, which is written in lowercase.
// A term in any other spelling (BrandName) is exact: it matches that spelling only, and its placeholder is used and
// reversed exactly as written. Redaction fails if a term is still there in any spelling, except inside an integrity
// hash or base64 data, and if the copy would not come back exactly with --unredact.
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const unredactMode = flag('--unredact');
const checkOnly = flag('--check-only');
const inDir = resolve(opt('--in', join(root, '.work/redacted')));
const out = resolve(
  root,
  opt('--out', unredactMode ? '.work/unredacted' : '.work/redacted')
);
// .local/ is read first, so its rules override the same terms in scripts/.
const ruleFiles = [
  join(root, '.local/redact-rules.txt'),
  join(root, 'scripts/redact-rules.txt'),
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const capitalized = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** The three spellings a one-case term matches: lowercase, UPPERCASE and Capitalized. */
const spellings = (s) => [
  s.toLowerCase(),
  s.toUpperCase(),
  capitalized(s.toLowerCase()),
];
/** A term written in one of its three spellings is matched in all three; any other spelling only as written. */
const isExact = (term) => !spellings(term).includes(term);

function loadRules() {
  const literals = [];
  const oneWay = [];
  for (const file of ruleFiles) {
    if (!existsSync(file)) continue;
    const name = relative(root, file);
    const seenHere = new Map();
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith('#')) return;
        const [lhs, rhs] = line.split(/\s+=>\s+/);
        const re = lhs.match(/^\/(.+)\/([a-z]*)$/);
        if (re) {
          const flags = re[2].includes('g') ? re[2] : re[2] + 'g';
          oneWay.push({
            label: `regex ${lhs}`,
            re: new RegExp(re[1], flags),
            to: rhs ?? 'REDACTED',
          });
          return;
        }
        if (!rhs)
          throw new Error(
            `${name}:${i + 1}: literal rule needs a placeholder: ${lhs}`
          );
        const exact = isExact(lhs);
        const key = exact ? lhs : lhs.toLowerCase();
        if (seenHere.has(key))
          throw new Error(
            `${name}:${i + 1}: ${lhs} repeats the rule on line ${seenHere.get(key)}`
          );
        seenHere.set(key, i + 1);
        if (literals.some((l) => l.key === key)) return; // .local overrides
        if (!exact && rhs !== rhs.toLowerCase())
          throw new Error(
            `${name}:${i + 1}: the placeholder of ${lhs} must be lowercase (${rhs.toLowerCase()}): it takes the case ` +
              'of each spelling it replaces, so any other case could not be reversed'
          );
        literals.push({ key, term: key, placeholder: rhs, exact });
      });
  }
  if (!literals.length && !oneWay.length)
    throw new Error('no redaction rules found');
  const seen = new Set();
  for (const { placeholder } of literals) {
    const p = placeholder.toLowerCase();
    if (seen.has(p))
      throw new Error(
        `placeholder used twice (not reversible): ${placeholder}`
      );
    if (literals.some((l) => p.includes(l.term.toLowerCase())))
      throw new Error(`placeholder contains a term: ${placeholder}`);
    seen.add(p);
  }
  return { literals, oneWay };
}

/** Each spelling a rule replaces, and what replaces it: a one-case rule's three spellings, an exact rule's one. */
function spellingPairs(literals, reverse) {
  return literals.flatMap((l, rule) => {
    const pairs = l.exact
      ? [[l.term, l.placeholder]]
      : spellings(l.term).map((s, i) => [s, spellings(l.placeholder)[i]]);
    return pairs.map(([term, placeholder]) =>
      reverse ? [placeholder, term, rule] : [term, placeholder, rule]
    );
  });
}

// Single pass, longest spelling first, so overlapping keys cannot chain into each other. Only the listed spellings
// match, so every replacement reverses exactly.
function translator(pairs) {
  const map = new Map(pairs.map(([from, to, rule]) => [from, { to, rule }]));
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(keys.map(escape).join('|'), 'g') : null;
  return (text, counts) =>
    re
      ? text.replace(re, (m) => {
          const { to, rule } = map.get(m);
          if (counts) counts.set(rule, (counts.get(rule) ?? 0) + 1);
          return to;
        })
      : text;
}

/** Every match of `words` in `text` in any case, with its 1-based line. */
function occurrences(words, text) {
  if (!words.length) return [];
  const re = new RegExp(
    [...words]
      .sort((a, b) => b.length - a.length)
      .map(escape)
      .join('|'),
    'gi'
  );
  return [...text.matchAll(re)].map((m) => ({
    found: m[0],
    start: m.index,
    end: m.index + m[0].length,
    line: text.slice(0, m.index).split('\n').length,
  }));
}

const BASE64 = /[A-Za-z0-9+/=]/;
/**
 * Whether text[start, end) lies inside an integrity hash (`sha512-...`) or base64 data (`base64,...`), where letters of
 * a term in random case are noise, not a name.
 */
function inEncodedData(text, start, end) {
  if (![...text.slice(start, end)].every((c) => BASE64.test(c))) return false;
  let a = start;
  while (a > 0 && BASE64.test(text[a - 1])) a--;
  let b = end;
  while (b < text.length && BASE64.test(text[b])) b++;
  return (
    b - a >= 20 &&
    /(?:sha(?:1|256|384|512)-|base64,)$/.test(text.slice(Math.max(0, a - 8), a))
  );
}

function guardOut() {
  const rel = relative(root, out);
  const outsideRepo = rel.startsWith('..') || resolve(rel) === rel;
  if (!outsideRepo && !rel.startsWith('.work' + sep))
    throw new Error(`output must be under .work/ or outside the repo: ${out}`);
  if (existsSync(out)) {
    if (!flag('--force'))
      throw new Error(`${out} exists; pass --force to replace it`);
    rmSync(out, { recursive: true, force: true });
  }
}

const write = (file, data) => {
  mkdirSync(dirname(join(out, file)), { recursive: true });
  writeFileSync(join(out, file), data);
};
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
const ruleLabel = (rule) =>
  typeof rule === 'number' ? `rule #${rule + 1}` : rule;

const { literals, oneWay } = loadRules();
const forward = translator(spellingPairs(literals, false));
const backward = translator(spellingPairs(literals, true));
const redact = (text, counts) => {
  text = forward(text, counts);
  for (const r of oneWay) {
    const n = text.match(r.re)?.length ?? 0;
    if (n && counts) counts.set(r.label, (counts.get(r.label) ?? 0) + n);
    text = text.replace(r.re, r.to);
  }
  return text;
};

if (unredactMode) {
  if (!existsSync(inDir)) throw new Error(`input not found: ${inDir}`);
  if (resolve(inDir) === resolve(out))
    throw new Error('--in and --out must differ');
  guardOut();
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory()
        ? walk(join(dir, e.name))
        : e.isFile()
          ? [join(dir, e.name)]
          : []
    );
  const counts = new Map();
  const unrestored = [];
  const restorable = literals.map((l) => l.placeholder);
  let n = 0;
  for (const abs of walk(inDir)) {
    const file = relative(inDir, abs);
    const buf = readFileSync(abs);
    const target = backward(file, counts);
    const text = isBinary(buf)
      ? undefined
      : backward(buf.toString('utf8'), counts);
    write(target, text === undefined ? buf : Buffer.from(text, 'utf8'));
    // A placeholder that came back in a spelling no rule lists (a model wrote it so) is not restored.
    for (const o of occurrences(
      restorable,
      text === undefined ? target : `${text}\n${target}`
    ))
      unrestored.push(`${target}:${o.line}: ${o.found}`);
    n++;
  }
  console.log(`${n} files restored from ${inDir}`);
  for (const [rule, c] of counts)
    console.log(`  ${String(c).padStart(5)}  ${ruleLabel(rule)}`);
  console.log(`wrote ${out}`);
  if (unrestored.length) {
    console.warn(
      `note: placeholder left in a spelling --unredact cannot restore in ${unrestored.length} place(s); review:`
    );
    for (const u of unrestored) console.warn(`  ${u}`);
  }
  if (oneWay.length)
    console.log(
      `note: ${oneWay.length} one-way regex rule(s) are not reversed`
    );
  console.log(
    'diff or copy files back yourself, e.g. diff -ru <repo>/src <out>/src'
  );
  process.exit(0);
}

const files = execFileSync(
  'git',
  ['ls-files', '-z', '-co', '--exclude-standard'],
  { cwd: root }
)
  .toString()
  .split('\0')
  .filter(
    (f) =>
      f &&
      !f.startsWith('.local/') &&
      !f.startsWith('.work/') &&
      f !== 'scripts/redact-rules.txt'
  )
  .filter((f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile());

const terms = literals.map((l) => l.term);
const replaced = spellingPairs(literals, false).map(([spelling]) => spelling);
const placeholders = literals.map((l) => l.placeholder.toLowerCase());
const collisions = [];
const leftovers = [];
const encoded = [];
const notReversible = [];
const counts = new Map();

// A placeholder already in the source would be "restored" to a term by --unredact.
for (const file of files) {
  const text = (
    file +
    '\n' +
    readFileSync(join(root, file)).toString('latin1')
  ).toLowerCase();
  const hit = placeholders.find((p) => text.includes(p));
  if (hit)
    collisions.push(`${file} (placeholder #${placeholders.indexOf(hit) + 1})`);
}
if (collisions.length) {
  console.error(
    'placeholder(s) already occur in the source; pick different ones in the rules file:'
  );
  for (const c of collisions) console.error(`  ${c}`);
  process.exit(1);
}

if (!checkOnly) guardOut();

let binary = 0;
for (const file of files) {
  const buf = readFileSync(join(root, file));
  const bin = isBinary(buf);
  const target = redact(file, counts);
  const source = bin ? '' : buf.toString('utf8');
  const redacted = bin ? '' : redact(source, counts);
  if (bin) binary++;
  for (const o of occurrences(terms, target))
    leftovers.push({ where: `${target} (path)`, found: o.found });
  if (bin) {
    // A binary is copied as it is: a spelling a rule replaces is a leak, any other case is noted.
    for (const o of occurrences(terms, buf.toString('latin1'))) {
      if (replaced.includes(o.found))
        leftovers.push({
          where: `${target} (binary, copied as it is)`,
          found: o.found,
        });
      else encoded.push(`${target} (binary): ${o.found}`);
    }
  } else {
    for (const o of occurrences(terms, redacted)) {
      if (inEncodedData(redacted, o.start, o.end))
        encoded.push(`${target}:${o.line}: ${o.found}`);
      else leftovers.push({ where: `${target}:${o.line}`, found: o.found });
    }
  }
  if (
    !oneWay.length &&
    (backward(target) !== file || (!bin && backward(redacted) !== source))
  )
    notReversible.push(target);
  if (!checkOnly) write(target, bin ? buf : Buffer.from(redacted, 'utf8'));
}

console.log(
  `${files.length} files scanned (${binary} binary, copied as-is), ${literals.length} literal + ${oneWay.length} regex rules`
);
for (const [rule, c] of counts) {
  const l = literals[rule];
  console.log(
    `  ${String(c).padStart(5)}  ${l ? `${ruleLabel(rule)} -> ${l.placeholder}` : rule}`
  );
}
if (!checkOnly) console.log(`wrote ${out}`);
if (encoded.length) {
  console.warn(
    `note: ${encoded.length} mixed-case match(es) left in encoded data (hashes, base64, binaries), unchanged:`
  );
  for (const e of encoded) console.warn(`  ${e}`);
}
let failed = false;
if (notReversible.length) {
  console.error(
    `${notReversible.length} file(s) would not come back exactly with --unredact:`
  );
  for (const f of notReversible) console.error(`  ${f}`);
  failed = true;
}
if (leftovers.length) {
  const missing = [
    ...new Set(
      leftovers.map((l) => l.found).filter((found) => !replaced.includes(found))
    ),
  ];
  console.error(`LEFTOVER terms in ${leftovers.length} place(s):`);
  for (const l of leftovers) console.error(`  ${l.where}: ${l.found}`);
  if (missing.length)
    console.error(
      `add an exact rule for each spelling: ${missing.map((s) => `${s} => <placeholder>`).join(', ')}`
    );
  failed = true;
}
if (failed) process.exit(1);
console.log('check: no rule terms remain');
