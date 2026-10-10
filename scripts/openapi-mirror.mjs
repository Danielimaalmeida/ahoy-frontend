#!/usr/bin/env node
// JSON mirror of the Ahoy API contract, for tests (lane 2A). A spec cannot read `openapi/ahoy-v1.yaml` itself (no `node:fs`
// in specs, and `check-boundaries` forbids imports from outside `src/`), but it can import JSON. So the YAML, parsed with
// `yaml`, is written to `src/testing/fixtures/openapi.json`, and `contract.spec.ts` validates the fixtures against it.
//
//   node scripts/openapi-mirror.mjs           writes the mirror from openapi/ahoy-v1.yaml
//   node scripts/openapi-mirror.mjs --check   exits 1 when the mirror is missing or no longer equals the YAML
//
// `npm run api:types` writes it next to `schema.d.ts`, `npm run api:check` checks both, and `scripts/sync-openapi.mjs`
// writes it whenever it vendors a new contract. Nobody edits the mirror by hand.
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CONTRACT_PATH = join(root, 'openapi', 'ahoy-v1.yaml');
export const MIRROR_PATH = join(
  root,
  'src',
  'testing',
  'fixtures',
  'openapi.json'
);

/** Parses the contract. Throws on invalid YAML, and on a key that appears twice in one mapping. */
export function parseContract(yamlText) {
  const document = parse(yamlText, { uniqueKeys: true });
  if (
    document === null ||
    typeof document !== 'object' ||
    Array.isArray(document)
  )
    throw new Error('the contract is not a YAML mapping');
  return document;
}

/** Returns the text of the mirror for a contract: the parsed document as JSON, two-space indent, final newline. */
export function buildMirror(yamlText) {
  return `${JSON.stringify(parseContract(yamlText), null, 2)}\n`;
}

/** Writes the mirror of the vendored contract (atomically) and returns its path relative to the repository. */
export function writeMirror(yamlText = readFileSync(CONTRACT_PATH, 'utf8')) {
  const text = buildMirror(yamlText);
  writeFileSync(`${MIRROR_PATH}.tmp`, text);
  renameSync(`${MIRROR_PATH}.tmp`, MIRROR_PATH);
  return relative(root, MIRROR_PATH);
}

/** Returns why the mirror no longer matches the vendored contract, or null when it does. Compares values, not bytes. */
export function mirrorProblem() {
  let mirror;
  try {
    mirror = JSON.parse(readFileSync(MIRROR_PATH, 'utf8'));
  } catch (e) {
    return `${relative(root, MIRROR_PATH)} cannot be read as JSON (${e instanceof Error ? e.message : String(e)})`;
  }
  const contract = parseContract(readFileSync(CONTRACT_PATH, 'utf8'));
  return isDeepStrictEqual(mirror, contract)
    ? null
    : `${relative(root, MIRROR_PATH)} does not equal ${relative(root, CONTRACT_PATH)}`;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--check')) {
    console.error('usage: node scripts/openapi-mirror.mjs [--check]');
    process.exit(1);
  }
  if (args.includes('--check')) {
    const problem = mirrorProblem();
    if (problem) {
      console.error(`openapi-mirror: ${problem}. Run \`npm run api:types\`.`);
      process.exit(1);
    }
    console.log('openapi-mirror: ok');
  } else {
    console.log(`openapi-mirror: wrote ${writeMirror()}`);
  }
}
