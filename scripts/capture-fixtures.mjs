#!/usr/bin/env node
// Captures real answers of a LOCAL API running with `npm run dev -- --simulate` (0 AIU) as JSON files in
// src/testing/fixtures/captured/, to compare with the hand-written fixtures next to them. No dependencies.
//
//   npm start                                   # this repository; its proxy adds X-Ahoy-Actor
//   node scripts/capture-fixtures.mjs --confirm-simulate [--base http://localhost:4200/api/v1] [--actor you@example.com]
//                                     [--story PROJ-123]
//
// Drive a story through the simulation first (README of ahoy-hosted, "Drive a story through the API"): the more of its
// life the story has lived, the more the capture shows. Without --story, the most recently updated story is used.
//
// Safety, as in smoke-api.mjs: this machine only, --confirm-simulate required, no Authorization, and read-only: it makes
// GET requests and nothing else, so it cannot spend, answer, decide, stop or resume anything.
//
// **Review every file before you keep it.** Real answers may hold names, e-mails and story text; CLAUDE.md allows only
// fictional example data in the repository. `captured/` is ignored by git on purpose: after reviewing (and editing)
// a file, `git add -f` it, or move it next to the hand-written fixtures. Never commit tokens or `.env` files.
// Not meant for cloud sessions: they have no API to talk to.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:4200/api/v1' },
    actor: { type: 'string' },
    story: { type: 'string' },
    'confirm-simulate': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
});

/** Prints a message and exits with status 1. */
function die(message) {
  console.error(`capture-fixtures: ${message}`);
  process.exit(1);
}

if (values.help) {
  console.log(
    'usage: node scripts/capture-fixtures.mjs --confirm-simulate [--base <url>] [--actor <id>] [--story <KEY>]\nsee the comment at the top of the file'
  );
  process.exit(0);
}
if (!values['confirm-simulate']) {
  die(
    'add --confirm-simulate to say that the API runs with `npm run dev -- --simulate` (0 AIU). Never --live, never TEST.'
  );
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
let base;
try {
  base = new URL(values.base);
} catch {
  die(`--base is not a URL: ${values.base}`);
}
if (base.protocol !== 'http:' || !LOOPBACK.has(base.hostname)) {
  die(
    `refusing ${base.origin}: this script only talks to this machine over http (localhost, 127.0.0.1, [::1])`
  );
}
const root = base.href.replace(/\/+$/, '');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repo, 'src', 'testing', 'fixtures', 'captured');

/** GETs `path` and returns the status, the headers and the body as text. Never throws. */
async function get(path) {
  try {
    const res = await fetch(`${root}${path}`, {
      headers: { ...(values.actor ? { 'X-Ahoy-Actor': values.actor } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    return { status: res.status, headers: res.headers, text: await res.text() };
  } catch (e) {
    return {
      status: 0,
      headers: new Headers(),
      text: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Parses JSON, or returns undefined. */
function parse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

mkdirSync(outDir, { recursive: true });
const written = [];
const skipped = [];

/** Calls one operation; a 200 with JSON is written as <operationId>.json, anything else is reported. */
async function capture(operationId, path) {
  const res = await get(path);
  const json = parse(res.text);
  if (res.status !== 200 || json === undefined) {
    skipped.push(
      `${operationId}: HTTP ${res.status}${res.status === 0 ? ` ${res.text}` : ''}`
    );
    return undefined;
  }
  writeFileSync(
    join(outDir, `${operationId}.json`),
    `${JSON.stringify(json, null, 2)}\n`
  );
  written.push(operationId);
  return json;
}

const health = await capture('getHealth', '/health');
if (!health)
  die(
    'the API is not reachable; start `npm start` and `npm run dev -- --simulate` first'
  );

const stories = await capture('listStories', '/stories?limit=20');
const key = values.story ?? stories?.items?.[0]?.key;
if (typeof key !== 'string') {
  die(
    'the API has no story yet; drive one through the simulation first (see the comment at the top of this file)'
  );
}
const seg = encodeURIComponent(key);

await capture('getStory', `/stories/${seg}`);
await capture('getStoryModels', `/stories/${seg}/models`);
const runs = await capture('listStoryRuns', `/stories/${seg}/runs`);
const runId = runs?.items?.[0]?.id;
if (typeof runId === 'string')
  await capture('getRun', `/runs/${encodeURIComponent(runId)}`);
else skipped.push('getRun: the story has no run yet');
await capture('listQuestions', `/stories/${seg}/questions`);
await capture('listGateRecords', `/stories/${seg}/gates`);
await capture('getStoryState', `/stories/${seg}/state`);
const artifacts = await capture('listArtifacts', `/stories/${seg}/artifacts`);
await capture('listStoryEvents', `/stories/${seg}/events?limit=500`);

// The text of the plan (or the first artifact), shaped like the hand-written getArtifactContent fixture.
const items = Array.isArray(artifacts?.items) ? artifacts.items : [];
const plan =
  items.find((a) => a?.path === 'implementation-plan.md') ?? items[0];
if (plan && typeof plan.path === 'string') {
  const res = await get(
    `/stories/${seg}/artifacts/content?path=${encodeURIComponent(plan.path)}`
  );
  if (res.status === 200) {
    const content = {
      path: plan.path,
      mediaType: res.headers.get('content-type'),
      etag: res.headers.get('etag'),
      text: res.text,
    };
    writeFileSync(
      join(outDir, 'getArtifactContent.json'),
      `${JSON.stringify(content, null, 2)}\n`
    );
    written.push('getArtifactContent');
  } else skipped.push(`getArtifactContent: HTTP ${res.status}`);
} else skipped.push('getArtifactContent: the story has no artifact yet');

console.log(`capture-fixtures: story ${key} from ${root}`);
console.log(
  `wrote ${written.length} file(s) in ${relative(repo, outDir)}/: ${written.join(', ')}`
);
for (const line of skipped) console.log(`skipped ${line}`);
console.log(
  'Review them before keeping any: real data may hold names, e-mails or story text. The folder is ignored by git.'
);
