#!/usr/bin/env node
// Smoke test of the Ahoy API against a LOCAL API running with `npm run dev -- --simulate` in ahoy-hosted (0 AIU).
// It answers one question: does a real API answer these calls the way the contract and this app's client expect?
// It is not the contract test (`contract.spec.ts`) and checks only the few fields it needs. No dependencies.
//
//   npm start                                   # this repository; its proxy adds X-Ahoy-Actor
//   node scripts/smoke-api.mjs --confirm-simulate [--base http://localhost:4200/api/v1] [--actor you@example.com]
//
// Safety, because Ahoy spends real AIU when it is not simulated:
//   - it only talks to this machine (localhost, 127.0.0.1, [::1]): never the TEST environment, never a remote host;
//   - it needs --confirm-simulate, your statement that the API behind it runs with `--simulate`, never `--live`;
//   - it never sends Authorization. Talk to the API through the dev proxy (default), or pass --actor to name yourself
//     as `X-Ahoy-Actor` when you call the API on port 8080 directly (AHOY_AUTH=dev);
//   - the only thing it creates is one story, DEMO-<time>, which the simulated agents take through intake. It answers
//     no question, approves nothing and stops nothing.
// Not meant for cloud sessions: they have no API to talk to. Exit status 0 when every check passed.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://localhost:4200/api/v1' },
    actor: { type: 'string' },
    'confirm-simulate': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
});

/** Prints a message and exits with status 1. */
function die(message) {
  console.error(`smoke-api: ${message}`);
  process.exit(1);
}

if (values.help) {
  console.log(
    'usage: node scripts/smoke-api.mjs --confirm-simulate [--base <url>] [--actor <id>]\nsee the comment at the top of the file'
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

/** Calls the API and returns the status, the headers and the body as JSON (or as text when it is not JSON). Never throws. */
async function call(method, path, body) {
  try {
    const res = await fetch(`${root}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(values.actor ? { 'X-Ahoy-Actor': values.actor } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, headers: res.headers, json, text };
  } catch (e) {
    return {
      status: 0,
      headers: new Headers(),
      json: undefined,
      text: e instanceof Error ? e.message : String(e),
    };
  }
}

let failed = 0;
let total = 0;

/** Records one check and prints it. */
function check(name, pass, detail = '') {
  total += 1;
  if (!pass) failed += 1;
  console.log(
    `${pass ? 'ok  ' : 'FAIL'} ${name}${!pass && detail ? `: ${detail}` : ''}`
  );
}

const isCount = (v) => Number.isSafeInteger(v) && v >= 0;
const key = `DEMO-${Date.now()}`;
const BUDGET = 30_000_000_000;

console.log(
  `smoke-api: ${root} as ${values.actor ?? 'whoever the proxy names'}; story ${key}`
);

// 1. getHealth
const health = await call('GET', '/health');
check(
  'getHealth answers 200',
  health.status === 200,
  `status ${health.status} ${health.status === 0 ? health.text : ''}`
);
check(
  'getHealth says the API and its database are ok',
  health.json?.status === 'ok' && health.json?.database === 'ok',
  JSON.stringify(health.json)
);
if (health.status !== 200)
  die(
    'the API is not reachable; start `npm start` and `npm run dev -- --simulate` first'
  );

// 2. startStory
const started = await call('POST', '/stories', {
  key,
  title: 'Smoke test of the Ahoy front end',
  budgetNanoAiu: BUDGET,
});
check(
  'startStory answers 201',
  started.status === 201,
  `status ${started.status} ${started.text.slice(0, 200)}`
);
check(
  'startStory gives the new story at intake',
  started.json?.key === key && started.json?.phase === 'intake'
);
check(
  'startStory gives whole-number AIU and a version',
  started.json?.budgetNanoAiu === BUDGET &&
    started.json?.spentNanoAiu === 0 &&
    isCount(started.json?.version)
);
check(
  'startStory points to the story in Location',
  started.headers.get('location')?.endsWith(`/stories/${key}`) === true
);
const version = started.json?.version;

// 3. getStory
const story = await call('GET', `/stories/${key}`);
check(
  'getStory answers 200 with the same key',
  story.status === 200 && story.json?.key === key
);
check(
  'getStory gives what the app reads of a story',
  typeof story.json?.owner === 'string' &&
    typeof story.json?.phase === 'string' &&
    typeof story.json?.status === 'string' &&
    isCount(story.json?.version) &&
    isCount(story.json?.spentNanoAiu) &&
    typeof story.json?.createdAt === 'string' &&
    typeof story.json?.updatedAt === 'string'
);

// 4. listStories: the new story is in the first pages
let found = false;
let cursor;
let pages = 0;
let listStatus = 0;
do {
  const page = await call(
    'GET',
    `/stories?limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
  );
  listStatus = page.status;
  pages += 1;
  found =
    Array.isArray(page.json?.items) &&
    page.json.items.some((s) => s?.key === key);
  cursor =
    typeof page.json?.nextCursor === 'string'
      ? page.json.nextCursor
      : undefined;
} while (!found && cursor && pages < 5);
check('listStories answers 200', listStatus === 200, `status ${listStatus}`);
check(
  'listStories includes the new story',
  found,
  `looked in ${pages} page(s)`
);

// 5. Errors come as problem+json (the same calls the client's problem handling is written for). None changes anything.
const missing = await call('GET', '/stories/NOPE-0');
check(
  'an unknown story is 404 problem+json with code not_found',
  missing.status === 404 &&
    (missing.headers.get('content-type') ?? '').includes(
      'application/problem+json'
    ) &&
    missing.json?.code === 'not_found',
  `status ${missing.status}`
);
const invalid = await call('GET', '/stories/lower-1');
check(
  'a malformed key is 400 validation_failed with errors',
  invalid.status === 400 &&
    invalid.json?.code === 'validation_failed' &&
    Array.isArray(invalid.json?.errors),
  `status ${invalid.status}`
);
const stale = await call('POST', `/stories/${key}/stop`, {
  expectedVersion: 999_999,
  reason: 'smoke test: stale version',
});
check(
  'a stale version is 409 stale_version carrying currentVersion',
  stale.status === 409 &&
    stale.json?.code === 'stale_version' &&
    stale.json?.currentVersion === version,
  `status ${stale.status} ${JSON.stringify(stale.json)}`
);

console.log(`smoke-api: ${total - failed}/${total} checks passed`);
if (failed > 0) process.exit(1);
