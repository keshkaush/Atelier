/* ============================================================
   Sidecar tests — run with:  node --test server/test/

   Everything happens in throwaway git repos under a fresh tmp dir, so
   these run in-sandbox (git 2.34 + node 22 both available here) with
   zero effect on the mounted repo. They exercise the real host layer:
   the bounded walk, git-status parsing, branch creation + its dirty-
   tree refusal, the allowlist/traversal guards, and file reads.
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { walk } from '../lib/walk.mjs';
import { parseStatus, isGitRepo, git } from '../lib/git.mjs';
import { createBranch, isValidBranchName } from '../lib/branch.mjs';
import { loadAllowlist, resolveRoot, safeJoin } from '../lib/allowlist.mjs';
import { verify } from '../lib/verify.mjs';

/* ---------------------------------------------------------- */
/* fixtures                                                    */
/* ---------------------------------------------------------- */

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'atelier-host-'));
  execFileSync('git', ['-C', dir, 'init', '-q', '-b', 'main'], { windowsHide: true });
  execFileSync('git', ['-C', dir, 'config', 'user.email', 'test@example.com']);
  execFileSync('git', ['-C', dir, 'config', 'user.name', 'Test']);
  writeFileSync(path.join(dir, 'README.md'), '# hi\n');
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export const x = 1;\n');
  execFileSync('git', ['-C', dir, 'add', '-A']);
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', 'init']);
  return dir;
}

/* ---------------------------------------------------------- */
/* walk                                                        */
/* ---------------------------------------------------------- */

test('walk returns entries with kinds, ext and posix paths', () => {
  const dir = makeRepo();
  const { entries, truncated } = walk(dir);
  assert.equal(truncated, false);
  const readme = entries.find((e) => e.path === 'README.md');
  assert.ok(readme, 'README.md listed');
  assert.equal(readme.kind, 'file');
  assert.equal(readme.ext, '.md');
  const src = entries.find((e) => e.path === 'src');
  assert.equal(src?.kind, 'dir');
  const app = entries.find((e) => e.path === 'src/App.tsx');
  assert.equal(app?.kind, 'file');
  assert.equal(app?.ext, '.tsx');
  // No backslashes even on win32-style separators.
  assert.ok(entries.every((e) => !e.path.includes('\\')), 'posix separators');
});

test('walk does not descend into node_modules but still lists it', () => {
  const dir = makeRepo();
  mkdirSync(path.join(dir, 'node_modules', 'react'), { recursive: true });
  writeFileSync(path.join(dir, 'node_modules', 'react', 'index.js'), '// deep\n');
  const { entries } = walk(dir);
  const nm = entries.find((e) => e.path === 'node_modules');
  assert.equal(nm?.kind, 'dir', 'node_modules itself listed');
  // Its children are NOT walked.
  assert.ok(
    !entries.some((e) => e.path.startsWith('node_modules/')),
    'did not descend into node_modules',
  );
});

test('walk respects the entry cap', () => {
  const dir = makeRepo();
  for (let i = 0; i < 20; i++) writeFileSync(path.join(dir, `f${i}.txt`), 'x');
  const { entries, truncated } = walk(dir, { maxEntries: 5 });
  assert.ok(entries.length <= 5, 'capped');
  assert.equal(truncated, true, 'reports truncation');
});

/* ---------------------------------------------------------- */
/* git status                                                  */
/* ---------------------------------------------------------- */

test('parseStatus detects clean vs dirty and reads branch', async () => {
  const dir = makeRepo();
  const clean = await git(['-C', dir, 'status', '--porcelain=v2', '--branch']);
  const cs = parseStatus(clean.stdout, true);
  assert.equal(cs.isRepo, true);
  assert.equal(cs.dirty, false);
  assert.ok(cs.branch, 'has a branch');

  writeFileSync(path.join(dir, 'README.md'), '# changed\n');
  const dirty = await git(['-C', dir, 'status', '--porcelain=v2', '--branch']);
  const ds = parseStatus(dirty.stdout, true);
  assert.equal(ds.dirty, true, 'detects uncommitted change');
});

test('isGitRepo is true in a repo, false outside one', async () => {
  const dir = makeRepo();
  assert.equal(await isGitRepo(dir), true);
  const plain = mkdtempSync(path.join(tmpdir(), 'atelier-plain-'));
  assert.equal(await isGitRepo(plain), false);
});

/* ---------------------------------------------------------- */
/* branch creation                                             */
/* ---------------------------------------------------------- */

test('branch name validation matches the client regex', () => {
  for (const ok of ['feat/onboarding', 'fix-123', 'a.b/c_d']) {
    assert.equal(isValidBranchName(ok), true, `${ok} valid`);
  }
  for (const bad of ['', '-x', '../evil', 'has space', 'a//b', 'trail/', 'x.lock', 'UPPER..x']) {
    assert.equal(isValidBranchName(bad), false, `${bad} invalid`);
  }
});

test('createBranch succeeds on a clean tree', async () => {
  const dir = makeRepo();
  const r = await createBranch(dir, 'feat/test');
  assert.equal(r.ok, true);
  const branch = await git(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']);
  assert.equal(branch.stdout.trim(), 'feat/test');
});

test('createBranch refuses on a dirty tree without opt-in, never stashes', async () => {
  const dir = makeRepo();
  writeFileSync(path.join(dir, 'README.md'), '# dirty\n');
  const r = await createBranch(dir, 'feat/dirty');
  assert.equal(r.ok, false);
  assert.equal(r.dirty, true);
  // The dirty change is still there — nothing was stashed or reverted.
  const status = await git(['-C', dir, 'status', '--porcelain']);
  assert.match(status.stdout, /README\.md/, 'uncommitted change preserved');
});

test('createBranch refuses when the branch already exists', async () => {
  const dir = makeRepo();
  await createBranch(dir, 'feat/dup');
  await git(['-C', dir, 'checkout', 'main']);
  const r = await createBranch(dir, 'feat/dup');
  assert.equal(r.ok, false);
  assert.match(r.note ?? '', /already exists/i);
});

/* ---------------------------------------------------------- */
/* allowlist + traversal                                       */
/* ---------------------------------------------------------- */

test('resolveRoot rejects a path outside the allowlist', () => {
  const allowed = makeRepo();
  const outside = makeRepo();
  const allowlist = loadAllowlist({ ATELIER_ROOTS: allowed });
  assert.equal(allowlist.length, 1);
  assert.doesNotThrow(() => resolveRoot(allowed, allowlist));
  assert.throws(() => resolveRoot(outside, allowlist), /outside the allowlist/i);
});

test('resolveRoot rejects relative and missing paths', () => {
  const allowed = makeRepo();
  const allowlist = loadAllowlist({ ATELIER_ROOTS: allowed });
  assert.throws(() => resolveRoot('relative/path', allowlist), /absolute/i);
  assert.throws(() => resolveRoot(path.join(allowed, 'nope'), allowlist), /does not exist|not readable/i);
});

test('resolveRoot accepts a nested directory inside an allowed root', () => {
  const allowed = makeRepo();
  mkdirSync(path.join(allowed, 'packages', 'app'), { recursive: true });
  const allowlist = loadAllowlist({ ATELIER_ROOTS: allowed });
  const nested = path.join(allowed, 'packages', 'app');
  assert.doesNotThrow(() => resolveRoot(nested, allowlist));
});

test('loadAllowlist splits multiple roots and drops non-existent ones', () => {
  const a = makeRepo();
  const b = makeRepo();
  const allowlist = loadAllowlist({ ATELIER_ROOTS: `${a};${b};/does/not/exist` });
  assert.equal(allowlist.length, 2, 'two real roots, missing one dropped');
  assert.ok(allowlist.includes(realpathSync(a)));
  assert.ok(allowlist.includes(realpathSync(b)));
});

test('safeJoin blocks .. escapes and absolute paths', () => {
  const allowed = realpathSync(makeRepo());
  assert.doesNotThrow(() => safeJoin(allowed, 'src/App.tsx'));
  assert.throws(() => safeJoin(allowed, '../etc/passwd'), /escapes the project root/i);
  assert.throws(() => safeJoin(allowed, path.join(allowed, 'abs.txt')), /relative/i);
});

test('safeJoin blocks a symlink inside the root that points outside it', () => {
  // A symlink planted inside an allowlisted root (e.g. by an untrusted
  // clone) that escapes to a file outside — must be refused after realpath.
  const allowed = realpathSync(makeRepo());
  const secretDir = mkdtempSync(path.join(tmpdir(), 'atelier-secret-'));
  const secret = path.join(secretDir, 'passwd');
  writeFileSync(secret, 'root:x:0:0\n');
  const link = path.join(allowed, 'escape');
  try {
    symlinkSync(secret, link);
  } catch {
    return; // symlinks unsupported on this platform/user — skip
  }
  assert.throws(() => safeJoin(allowed, 'escape'), /outside the project root/i);
});

test('safeJoin allows a symlink that stays inside the root', () => {
  const allowed = realpathSync(makeRepo());
  const link = path.join(allowed, 'alias');
  try {
    symlinkSync(path.join(allowed, 'src', 'App.tsx'), link);
  } catch {
    return; // symlinks unsupported — skip
  }
  assert.doesNotThrow(() => safeJoin(allowed, 'alias'));
});

/* ---------------------------------------------------------- */
/* verify — degrades gracefully                                */
/* ---------------------------------------------------------- */

test('verify reports skipped steps for a non-Node project', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'atelier-verify-'));
  writeFileSync(path.join(dir, 'index.html'), '<h1>hi</h1>');
  const r = await verify(dir, { timeoutMs: 5000 });
  assert.equal(r.isNodeProject, false);
  assert.equal(r.steps.typecheck.status, 'skipped');
});

test('verify runs a passing test script when present', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'atelier-verify2-'));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(0)"' } }),
  );
  const r = await verify(dir, { timeoutMs: 20000 });
  assert.equal(r.isNodeProject, true);
  assert.equal(r.steps.test.status, 'pass');
  assert.equal(r.steps.lint.status, 'skipped');
});
