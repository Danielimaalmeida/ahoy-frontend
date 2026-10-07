#!/usr/bin/env node
// Confirms that a production build carries no trace of the mock backend (plan, lane 2D, deliverable 8): run it after
// `npm run build`. Only the `mock` configuration replaces `environment.ts` with `environment.mock.ts`, so nothing of
// `src/testing/mock-backend/`, `src/app/core/mock/` or the contract mirror may reach `dist/`.
//
// Usage: node scripts/mock-api.dist-check.mjs [dir]   (dir defaults to dist/ahoy-frontend)
// Exit 0: clean. Exit 1: a marker was found (each hit is printed). Exit 2: there is no build to check.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = resolve(root, process.argv[2] ?? "dist/ahoy-frontend");

/** Text that only the mock (or the contract mirror it reads) contains. */
const MARKERS = [
  "ahoy.mock.", // its switches in localStorage and the query string
  "Ahoy mock", // its console banner
  "MockAhoyServer", // its server's own error text
  "mock-backend", // its directory in source maps or paths
  "Internal error in the mock", // its problem detail
  "x-sse-data-schema", // the contract mirror (src/testing/fixtures/openapi.json) it routes with
];

/** Every file under a directory. */
function files(path) {
  return readdirSync(path).flatMap((name) => {
    const full = join(path, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

if (!existsSync(dir)) {
  console.error(`mock-api.dist-check: ${relative(root, dir)} does not exist; run \`npm run build\` first`);
  process.exit(2);
}
const all = files(dir);
const hits = [];
for (const file of all) {
  const text = readFileSync(file, "latin1");
  for (const marker of MARKERS)
    if (text.includes(marker)) hits.push(`${relative(root, file)}: ${JSON.stringify(marker)}`);
}
if (hits.length > 0) {
  for (const hit of hits) console.error(`mock-api.dist-check: ${hit}`);
  console.error(`mock-api.dist-check: the build in ${relative(root, dir)} contains the mock backend`);
  process.exit(1);
}
console.log(`mock-api.dist-check: ok (${all.length} files in ${relative(root, dir)}, no trace of the mock)`);
