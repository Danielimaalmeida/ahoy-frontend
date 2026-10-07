#!/usr/bin/env node
// Vendors the Ahoy API contract (lane 2A): copies ahoy-hosted's `openapi/ahoy-v1.yaml` to `openapi/ahoy-v1.yaml` and puts
// the commit it came from in a comment header. It also writes the JSON mirror that the contract tests import
// (`scripts/openapi-mirror.mjs`), which needs the `yaml` package. Run `npm run api:types` afterwards for `schema.d.ts`.
//
//   node scripts/sync-openapi.mjs [path-or-url] [--commit <sha>]
//
//   path-or-url  where to read the contract from. Default: ../ahoy-hosted/openapi/ahoy-v1.yaml. A path inside a git
//                checkout gives its own commit. An https URL (for example
//                https://raw.githubusercontent.com/Danielimaalmeida/ahoy-hosted/<sha>/openapi/ahoy-v1.yaml) gives one only
//                when it names a 40-character commit.
//   --commit     the commit the file comes from, when the script cannot tell.
//
// Reading `openapi/ahoy-v1.yaml` itself is allowed and keeps the source and commit its header already records.
//
// The copy is read-only for this repository: change the contract in ahoy-hosted, then run `npm run api:sync`.
import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMirror, writeMirror } from "./openapi-mirror.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "openapi", "ahoy-v1.yaml");
const defaultSource = join(root, "..", "ahoy-hosted", "openapi", "ahoy-v1.yaml");
const MAX_BYTES = 2_000_000;
const SHA = /^[0-9a-f]{40}$/;

/** Prints a message and exits with status 1. */
function die(message) {
  console.error(`sync-openapi: ${message}`);
  process.exit(1);
}

/** Runs git in `dir` and returns its trimmed output, or null when it fails (not a checkout, no git, no remote). */
function git(dir, ...args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

/** Reads `owner/repo` from a GitHub remote URL, dropping any credentials in it; null for anything else. */
function githubName(remote) {
  const m = /github\.com[:/]+([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(remote ?? "");
  return m ? m[1] : null;
}

/** Removes the header an earlier sync wrote (only its own lines), so that syncing from the vendored copy changes nothing. */
function stripHeader(text) {
  const lines = text.split("\n");
  let i = 0;
  while (i < lines.length && /^# (Vendored copy of the Ahoy API contract|Source: |Commit: )/.test(lines[i])) i += 1;
  if (i > 0 && lines[i] === "") i += 1;
  return lines.slice(i).join("\n");
}

/** The source and commit an earlier sync wrote in the first lines of the vendored copy, or null when it has no such header. */
function ownHeader(text) {
  const top = text.split("\n").slice(0, 3);
  const source = top.map((line) => /^# Source: (.+)$/.exec(line)?.[1]).find((value) => value !== undefined);
  const commit = top
    .map((line) => /^# Commit: ([0-9a-f]{40})( \(plus uncommitted changes in the source file\))?$/.exec(line))
    .find((m) => m);
  return source && commit ? { source, commit: commit[1], dirty: commit[2] !== undefined } : null;
}

const args = process.argv.slice(2);
let source = defaultSource;
let commit = null;
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === "--commit") {
    commit = args[++i] ?? "";
    if (!SHA.test(commit)) die("--commit takes a 40-character lowercase commit sha");
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log("usage: node scripts/sync-openapi.mjs [path-or-url] [--commit <sha>]");
    process.exit(0);
  } else positional.push(args[i]);
}
if (positional.length > 1) die("at most one path or URL");
if (positional[0]) source = positional[0];

let text;
let origin = null;
let where;
let dirty = false;
if (/^https?:\/\//i.test(source)) {
  const url = new URL(source);
  if (url.protocol !== "https:") die("only https URLs are read");
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) die(`${source} answered ${res.status}`);
  text = await res.text();
  where = `${url.origin}${url.pathname}`;
  origin = where;
  // raw.githubusercontent.com/<owner>/<repo>/<ref>/<path> and github.com/<owner>/<repo>/(blob|raw)/<ref>/<path>
  const m = /^\/([^/]+\/[^/]+)\/(?:(?:blob|raw)\/)?([^/]+)\/(.+)$/.exec(url.pathname);
  if (m && /(^|\.)github(usercontent)?\.com$/.test(url.hostname)) {
    origin = `github.com/${m[1]} (${m[3]})`;
    if (!commit && SHA.test(m[2])) commit = m[2];
  }
} else {
  const file = resolve(source);
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    die(`cannot read ${file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  where = file;
  const dir = dirname(file);
  const top = git(dir, "rev-parse", "--show-toplevel");
  if (file === target) {
    // Re-reading the vendored copy: it says where it came from, and this checkout's remote is not that place.
    const own = ownHeader(text);
    if (!own && !commit)
      die("the vendored copy has no source and commit header: sync it from ahoy-hosted, or pass --commit");
    if (own) {
      origin = own.source;
      commit ??= own.commit;
      dirty = own.dirty;
    }
  } else if (top) {
    const name = githubName(git(dir, "config", "--get", "remote.origin.url"));
    origin = `${name ? `github.com/${name}` : "a git checkout"} (${relative(top, file).split("\\").join("/")})`;
    if (!commit) commit = git(dir, "rev-parse", "HEAD");
    dirty = (git(dir, "status", "--porcelain", "--", file) ?? "") !== "";
  }
}

if (text.length > MAX_BYTES) die(`${where} is larger than ${MAX_BYTES} bytes: not an API contract`);
text = stripHeader(text);
if (!/^openapi:\s*["']?3\.1/m.test(text)) die(`${where} does not look like an OpenAPI 3.1 document`);
if (!commit) die("cannot tell which commit this is: pass --commit <sha>, or read a file in a git checkout");

const version = /^info:[^\S\n]*\n(?:[ \t]+.*\n|[^\S\n]*\n)*?[ \t]+version:\s*(\S+)/m.exec(text)?.[1] ?? "unknown";
const header = [
  "# Vendored copy of the Ahoy API contract. Do not edit it here: change ahoy-hosted, then run `npm run api:sync`.",
  `# Source: ${origin ?? "a local copy of ahoy-hosted's openapi/ahoy-v1.yaml"}`,
  `# Commit: ${commit}${dirty ? " (plus uncommitted changes in the source file)" : ""}`,
  "",
].join("\n");

const out = `${header}${text.startsWith("\n") ? text.slice(1) : text}`;
try {
  buildMirror(out); // refuses invalid YAML before anything is overwritten
} catch (e) {
  die(`${where} is not valid YAML: ${e instanceof Error ? e.message : String(e)}`);
}
writeFileSync(`${target}.tmp`, out);
renameSync(`${target}.tmp`, target);
const mirrorPath = writeMirror(out);
if (dirty)
  console.warn(
    "sync-openapi: warning: the source file has uncommitted changes; the commit above is not the whole story",
  );
console.log(`sync-openapi: ${relative(root, target)} <- ${where} @ ${commit.slice(0, 7)} (info.version ${version})`);
console.log(`sync-openapi: ${mirrorPath} written; run \`npm run api:types\` for schema.d.ts`);
