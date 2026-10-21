// Tests for scripts/redact.mjs, run on throwaway repositories with fictional terms (never real ones).
//   node --test scripts/redact.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'redact.mjs');

/** A git repository holding `files` and the script, with `rules` in scripts/redact-rules.txt (and `local` in .local/). */
function repo(t, files, rules, local) {
  const dir = mkdtempSync(join(tmpdir(), 'redact-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet', dir]);
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(SCRIPT, join(dir, 'scripts/redact.mjs'));
  writeFileSync(join(dir, 'scripts/redact-rules.txt'), rules);
  if (local !== undefined) {
    mkdirSync(join(dir, '.local'));
    writeFileSync(join(dir, '.local/redact-rules.txt'), local);
    writeFileSync(join(dir, '.gitignore'), '.local/\n.work/\n');
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}

/** Runs the script in `dir`; returns its exit status and output. */
function run(dir, ...args) {
  const r = spawnSync('node', ['scripts/redact.mjs', ...args], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { status: r.status, out: r.stdout + r.stderr };
}

const read = (dir, path) => readFileSync(join(dir, path), 'utf8');

describe('redact.mjs', () => {
  it('replaces a lowercase term in lowercase, UPPERCASE and Capitalized spellings, inside words too, and restores them', (t) => {
    const text =
      'zentravo Zentravo ZENTRAVO myZentravoApp ZENTRAVO_DB notzentravoatall\n';
    const dir = repo(
      t,
      { 'a.txt': text, 'zentravo/b.txt': 'x\n' },
      'zentravo => plimbert\n'
    );
    const redacted = run(dir, '--force');
    assert.equal(redacted.status, 0, redacted.out);
    assert.equal(
      read(dir, '.work/redacted/a.txt'),
      'plimbert Plimbert PLIMBERT myPlimbertApp PLIMBERT_DB notplimbertatall\n'
    );
    assert.ok(
      existsSync(join(dir, '.work/redacted/plimbert/b.txt')),
      'paths are redacted too'
    );
    const restored = run(dir, '--unredact', '--force');
    assert.equal(restored.status, 0, restored.out);
    assert.equal(read(dir, '.work/unredacted/a.txt'), text);
    assert.ok(existsSync(join(dir, '.work/unredacted/zentravo/b.txt')));
  });

  it('reads a term written UPPERCASE or Capitalized as the same rule as its lowercase spelling', (t) => {
    const dir = repo(
      t,
      { 'a.txt': 'zentravo Zentravo ZENTRAVO\n' },
      'Zentravo => plimbert\n'
    );
    assert.equal(run(dir, '--force').status, 0);
    assert.equal(
      read(dir, '.work/redacted/a.txt'),
      'plimbert Plimbert PLIMBERT\n'
    );
  });

  it('replaces a mixed-case term only in that spelling, with its placeholder as written, and restores it exactly', (t) => {
    const text = 'VanDrell vandrell VANDRELL Vandrell VanDrellClient\n';
    const dir = repo(
      t,
      { 'a.txt': text },
      'vandrell => tolmerin\nVanDrell => SkorVan\n'
    );
    const redacted = run(dir, '--force');
    assert.equal(redacted.status, 0, redacted.out);
    assert.equal(
      read(dir, '.work/redacted/a.txt'),
      'SkorVan tolmerin TOLMERIN Tolmerin SkorVanClient\n'
    );
    assert.equal(run(dir, '--unredact', '--force').status, 0);
    assert.equal(read(dir, '.work/unredacted/a.txt'), text);
  });

  it('fails, naming the file, line and spelling, when a term is left in a spelling no rule matches', (t) => {
    const dir = repo(
      t,
      { 'src/a.ts': 'const a = 1;\nconst client = new VanDrellClient();\n' },
      'vandrell => tolmerin\n'
    );
    const redacted = run(dir, '--force');
    assert.equal(redacted.status, 1, redacted.out);
    assert.match(redacted.out, /src\/a\.ts:2: VanDrell/);
    assert.match(
      redacted.out,
      /add an exact rule for each spelling: VanDrell => <placeholder>/
    );
    assert.equal(
      run(dir, '--check-only').status,
      1,
      'a check fails the same way'
    );
  });

  it('only notes a mixed-case match inside an integrity hash or base64 data, which it leaves as it is', (t) => {
    const hash =
      'sha512-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789VaNdReLlAbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd==';
    const data =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAVAnDrElLAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';
    const text = `"integrity": "${hash}"\nconst img = "${data}";\n`;
    const dir = repo(t, { 'lock.json': text }, 'vandrell => tolmerin\n');
    const redacted = run(dir, '--force');
    assert.equal(redacted.status, 0, redacted.out);
    assert.match(redacted.out, /left in encoded data .*lock\.json:1/s);
    assert.equal(read(dir, '.work/redacted/lock.json'), text);
  });

  it('refuses the same term twice in one rules file, whatever its case', (t) => {
    const dir = repo(
      t,
      { 'a.txt': 'x\n' },
      'zentravo => plimbert\nZENTRAVO => quorvex\n'
    );
    const refused = run(dir, '--force');
    assert.equal(refused.status, 1);
    assert.match(
      refused.out,
      /scripts\/redact-rules\.txt:2: ZENTRAVO repeats the rule on line 1/
    );
    const exact = repo(
      t,
      { 'a.txt': 'x\n' },
      'VanDrell => skorvan\nVanDrell => quorvex\n'
    );
    assert.match(
      run(exact, '--force').out,
      /redact-rules\.txt:2: VanDrell repeats the rule on line 1/
    );
  });

  it('lets a rule in .local/ override the same term in scripts/', (t) => {
    const dir = repo(
      t,
      { 'a.txt': 'zentravo\n' },
      'zentravo => plimbert\n',
      'Zentravo => quorvex\n'
    );
    const redacted = run(dir, '--force');
    assert.equal(redacted.status, 0, redacted.out);
    assert.equal(read(dir, '.work/redacted/a.txt'), 'quorvex\n');
  });

  it('refuses a placeholder that could not be reversed exactly', (t) => {
    const upper = repo(t, { 'a.txt': 'x\n' }, 'zentravo => QuorVex\n');
    assert.match(
      run(upper, '--force').out,
      /the placeholder of zentravo must be lowercase/
    );
    const twice = repo(
      t,
      { 'a.txt': 'x\n' },
      'zentravo => plimbert\nVanDrell => Plimbert\n'
    );
    assert.match(
      run(twice, '--force').out,
      /placeholder used twice \(not reversible\): Plimbert/
    );
    const inside = repo(
      t,
      { 'a.txt': 'x\n' },
      'zentravo => plimbert\nvandrell => myzentravo\n'
    );
    assert.match(
      run(inside, '--force').out,
      /placeholder contains a term: myzentravo/
    );
  });

  it('refuses a placeholder that already occurs in the source, in any case', (t) => {
    const dir = repo(t, { 'a.txt': 'PlimBert\n' }, 'zentravo => plimbert\n');
    const refused = run(dir, '--force');
    assert.equal(refused.status, 1);
    assert.match(refused.out, /placeholder\(s\) already occur in the source/);
  });

  it('notes a placeholder that comes back in a spelling it cannot restore, and writes nothing to the source tree', (t) => {
    const dir = repo(t, { 'a.txt': 'zentravo\n' }, 'zentravo => plimbert\n');
    mkdirSync(join(dir, 'back'));
    writeFileSync(join(dir, 'back/a.txt'), 'plimbert PlImBeRt\n');
    const restored = run(dir, '--unredact', '--in', 'back', '--force');
    assert.equal(restored.status, 0, restored.out);
    assert.equal(read(dir, '.work/unredacted/a.txt'), 'zentravo PlImBeRt\n');
    assert.match(
      restored.out,
      /placeholder left in a spelling --unredact cannot restore.*a\.txt:1: PlImBeRt/s
    );
    assert.equal(read(dir, 'a.txt'), 'zentravo\n');
  });
});
