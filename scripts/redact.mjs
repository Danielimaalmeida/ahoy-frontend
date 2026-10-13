#!/usr/bin/env node
// Copy the repo with proprietary terms replaced, for sharing with external models,
// and reverse the replacement on code that comes back.
//   node scripts/redact.mjs [--out DIR] [--force] [--check-only]
//   node scripts/redact.mjs --unredact [--in DIR] [--out DIR] [--force]
// Redact copies only tracked and untracked-but-not-ignored files, so .local/, .work/,
// node_modules/ and dist/ never leave. Neither mode ever writes to the source tree.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const unredactMode = flag("--unredact");
const checkOnly = flag("--check-only");
const inDir = resolve(opt("--in", join(root, ".work/redacted")));
const out = resolve(root, opt("--out", unredactMode ? ".work/unredacted" : ".work/redacted"));
const ruleFiles = [join(root, ".local/redact-rules.txt"), join(root, "scripts/redact-rules.txt")];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isUpper = (s) => s === s.toUpperCase() && s !== s.toLowerCase();
const isCapitalized = (s) => s[0] !== s[0].toLowerCase() && s.slice(1) === s.slice(1).toLowerCase();
const matchCase = (found, repl) => {
  if (isUpper(found)) return repl.toUpperCase();
  if (isCapitalized(found)) return repl[0].toUpperCase() + repl.slice(1);
  return repl;
};

function loadRules() {
  const literals = [];
  const oneWay = [];
  for (const file of ruleFiles) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const [lhs, rhs] = line.split(/\s+=>\s+/);
      const re = lhs.match(/^\/(.+)\/([a-z]*)$/);
      if (re) {
        const flags = re[2].includes("g") ? re[2] : re[2] + "g";
        oneWay.push({ label: `regex ${lhs}`, re: new RegExp(re[1], flags), to: rhs ?? "REDACTED" });
      } else {
        if (!rhs) throw new Error(`literal rule needs a placeholder: ${lhs}`);
        if (literals.some((l) => l.term === lhs.toLowerCase())) continue; // .local overrides
        literals.push({ term: lhs.toLowerCase(), placeholder: rhs });
      }
    }
  }
  if (!literals.length && !oneWay.length) throw new Error("no redaction rules found");
  const seen = new Set();
  for (const { placeholder } of literals) {
    const p = placeholder.toLowerCase();
    if (seen.has(p)) throw new Error(`placeholder used twice (not reversible): ${placeholder}`);
    if (literals.some((l) => p.includes(l.term))) throw new Error(`placeholder contains a term: ${placeholder}`);
    seen.add(p);
  }
  return { literals, oneWay };
}

// Single pass, longest key first, so overlapping keys cannot chain into each other.
function translator(pairs) {
  const map = new Map(pairs.map(([from, to]) => [from.toLowerCase(), to]));
  // Only lower, UPPER and Capitalized spellings match, so random mixed case (e.g. in
  // base64 hashes) is left alone and every replacement reverses exactly.
  const variants = [...map.keys()].flatMap((k) => [k, k.toUpperCase(), k[0].toUpperCase() + k.slice(1)]);
  const keys = [...new Set(variants)].sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(keys.map(escape).join("|"), "g") : null;
  return (text, counts) =>
    re
      ? text.replace(re, (m) => {
          const key = m.toLowerCase();
          if (counts) counts.set(key, (counts.get(key) ?? 0) + 1);
          return matchCase(m, map.get(key));
        })
      : text;
}

function guardOut() {
  const rel = relative(root, out);
  const outsideRepo = rel.startsWith("..") || resolve(rel) === rel;
  if (!outsideRepo && !rel.startsWith(".work" + sep))
    throw new Error(`output must be under .work/ or outside the repo: ${out}`);
  if (existsSync(out)) {
    if (!flag("--force")) throw new Error(`${out} exists; pass --force to replace it`);
    rmSync(out, { recursive: true, force: true });
  }
}

const write = (file, data) => {
  mkdirSync(dirname(join(out, file)), { recursive: true });
  writeFileSync(join(out, file), data);
};
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

const { literals, oneWay } = loadRules();
const forward = translator(literals.map((l) => [l.term, l.placeholder]));
const backward = translator(literals.map((l) => [l.placeholder, l.term]));
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
  if (resolve(inDir) === resolve(out)) throw new Error("--in and --out must differ");
  guardOut();
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : e.isFile() ? [join(dir, e.name)] : [],
    );
  const counts = new Map();
  let n = 0;
  for (const abs of walk(inDir)) {
    const file = relative(inDir, abs);
    const buf = readFileSync(abs);
    write(backward(file, counts), isBinary(buf) ? buf : Buffer.from(backward(buf.toString("utf8"), counts), "utf8"));
    n++;
  }
  console.log(`${n} files restored from ${inDir}`);
  for (const [k, c] of counts)
    console.log(
      `  ${String(c).padStart(5)}  placeholder #${literals.findIndex((l) => l.placeholder.toLowerCase() === k) + 1}`,
    );
  console.log(`wrote ${out}`);
  if (oneWay.length) console.log(`note: ${oneWay.length} one-way regex rule(s) are not reversed`);
  console.log("diff or copy files back yourself, e.g. diff -ru <repo>/src <out>/src");
  process.exit(0);
}

const files = execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], { cwd: root })
  .toString()
  .split("\0")
  .filter((f) => f && !f.startsWith(".local/") && !f.startsWith(".work/") && f !== "scripts/redact-rules.txt")
  .filter((f) => existsSync(join(root, f)) && statSync(join(root, f)).isFile());

const terms = literals.map((l) => l.term);
const spellings = terms.flatMap((t) => [t, t.toUpperCase(), t[0].toUpperCase() + t.slice(1)]);
const placeholders = literals.map((l) => l.placeholder.toLowerCase());
const collisions = [];
const leftovers = [];
const notReversible = [];
const mixedCase = [];
const counts = new Map();

// A placeholder already in the source would be "restored" to a term by --unredact.
for (const file of files) {
  const text = (file + "\n" + readFileSync(join(root, file)).toString("latin1")).toLowerCase();
  const hit = placeholders.find((p) => text.includes(p));
  if (hit) collisions.push(`${file} (placeholder #${placeholders.indexOf(hit) + 1})`);
}
if (collisions.length) {
  console.error("placeholder(s) already occur in the source; pick different ones in the rules file:");
  for (const c of collisions) console.error(`  ${c}`);
  process.exit(1);
}

if (!checkOnly) guardOut();

let binary = 0;
for (const file of files) {
  const buf = readFileSync(join(root, file));
  const bin = isBinary(buf);
  const target = redact(file, counts);
  const source = bin ? "" : buf.toString("utf8");
  const redacted = bin ? "" : redact(source, counts);
  if (bin) binary++;
  const scan = (bin ? buf.toString("latin1") : redacted) + "\n" + target;
  if (spellings.some((t) => scan.includes(t))) leftovers.push(target);
  else if (terms.some((t) => scan.toLowerCase().includes(t))) mixedCase.push(target);
  if (!oneWay.length && (backward(target) !== file || (!bin && backward(redacted) !== source)))
    notReversible.push(target);
  if (!checkOnly) write(target, bin ? buf : Buffer.from(redacted, "utf8"));
}

console.log(
  `${files.length} files scanned (${binary} binary, copied as-is), ${literals.length} literal + ${oneWay.length} regex rules`,
);
for (const [k, c] of counts) {
  const i = terms.indexOf(k);
  console.log(`  ${String(c).padStart(5)}  ${i >= 0 ? `rule #${i + 1} -> ${literals[i].placeholder}` : k}`);
}
if (!checkOnly) console.log(`wrote ${out}`);
if (notReversible.length) {
  console.warn(`warning: ${notReversible.length} file(s) will not round-trip exactly:`);
  for (const f of notReversible) console.warn(`  ${f}`);
}
if (mixedCase.length) {
  console.warn(`note: odd mixed-case matches left untouched (often hashes) in ${mixedCase.length} file(s); review:`);
  for (const f of mixedCase) console.warn(`  ${f}`);
}
if (leftovers.length) {
  console.error(`LEFTOVER terms still present in ${leftovers.length} file(s):`);
  for (const f of leftovers) console.error(`  ${f}`);
  process.exit(1);
}
console.log("check: no rule terms remain");
