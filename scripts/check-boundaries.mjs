#!/usr/bin/env node
// Layer boundaries of src/ (plan §5.2, docs/architecture.md). No dependencies: reads every import specifier with a
// regular expression, resolves aliases and relative paths to a layer, and prints one line per violation.
//
//   domain    imports nothing from Angular, rxjs, node:, core, ui, features or testing.
//   ui        imports domain, ui, Angular and third-party packages; never core, features or testing.
//   core      imports domain, core and Angular; never ui, features or testing (core/mock may import testing).
//   features  import domain, ui and core; a feature never imports another feature.
//   testing   may import anything; production code (anything but specs and testing/) never imports testing.
//
// Usage: node scripts/check-boundaries.mjs [root]   (root defaults to the repository root)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(
  process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
);
const srcDir = join(root, 'src');

/** tsconfig path aliases, mirrored here so the script stays dependency-free. */
const ALIASES = {
  '@domain/': 'src/app/domain/',
  '@core/': 'src/app/core/',
  '@ui/': 'src/app/ui/',
  '@features/': 'src/app/features/',
  '@testing/': 'src/testing/',
};

/** Lists every .ts file under a directory. */
function listTs(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listTs(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** Returns the import and re-export specifiers of a source file, comments removed. */
function specifiers(text) {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const found = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?[^'";]*?\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const re of patterns)
    for (const m of code.matchAll(re)) found.push(m[1]);
  return found;
}

/** Maps a specifier to a repository-relative path (POSIX), or null for packages. */
function target(fromFile, spec) {
  for (const [alias, dir] of Object.entries(ALIASES))
    if (spec.startsWith(alias)) return dir + spec.slice(alias.length);
  if (spec.startsWith('.'))
    return relative(root, resolve(dirname(fromFile), spec))
      .split(sep)
      .join('/');
  return null;
}

/** Describes where a repository-relative path sits: layer and, for features, which one. */
function layerOf(path) {
  const m = /^src\/app\/(domain|core|ui|features)(?:\/([^/]+))?/.exec(path);
  if (m) return { layer: m[1], sub: m[2] ?? '' };
  if (path.startsWith('src/testing/')) return { layer: 'testing', sub: '' };
  if (path.startsWith('src/environments/'))
    return { layer: 'environments', sub: '' };
  if (path.startsWith('src/')) return { layer: 'app', sub: '' };
  return { layer: 'outside', sub: '' };
}

/** Returns why an import breaks a boundary, or null when it is allowed. */
function violation(fromPath, spec) {
  const from = layerOf(fromPath);
  const isSpec = fromPath.endsWith('.spec.ts');
  const to = target(join(root, fromPath), spec);

  if (to === null) {
    if (
      from.layer === 'domain' &&
      (/^@angular\//.test(spec) ||
        /^rxjs(\/|$)/.test(spec) ||
        spec.startsWith('node:'))
    )
      return 'domain is pure TypeScript: no Angular, rxjs or node: imports';
    return null;
  }

  const dest = layerOf(to);
  if (dest.layer === 'testing' && from.layer !== 'testing' && !isSpec) {
    const mockSeam =
      (from.layer === 'core' && from.sub === 'mock') ||
      fromPath === 'src/environments/environment.mock.ts';
    if (!mockSeam) return 'production code never imports src/testing';
  }
  if (dest.layer === 'outside') return 'imports from outside src/';

  switch (from.layer) {
    case 'domain':
      return dest.layer === 'domain'
        ? null
        : `domain imports only domain, not ${dest.layer}`;
    case 'ui':
      return dest.layer === 'domain' || dest.layer === 'ui'
        ? null
        : `ui imports only domain and ui, not ${dest.layer}`;
    case 'core':
      if (
        dest.layer === 'domain' ||
        dest.layer === 'core' ||
        dest.layer === 'testing'
      )
        return null;
      return `core imports only domain and core, not ${dest.layer}`;
    case 'features':
      if (dest.layer === 'features' && dest.sub !== from.sub)
        return `feature ${from.sub} imports feature ${dest.sub}`;
      if (dest.layer === 'app' || dest.layer === 'environments')
        return `features never import ${dest.layer} files`;
      return null;
    default:
      return null;
  }
}

const problems = [];
for (const file of listTs(srcDir)) {
  const fromPath = relative(root, file).split(sep).join('/');
  for (const spec of specifiers(readFileSync(file, 'utf8'))) {
    const why = violation(fromPath, spec);
    if (why) problems.push(`${fromPath}: "${spec}": ${why}`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`check-boundaries: ${p}`);
  console.error(`check-boundaries: ${problems.length} violation(s)`);
  process.exit(1);
}
console.log('check-boundaries: ok');
