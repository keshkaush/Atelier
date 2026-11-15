/* ============================================================
   Sidecar tests — run with:  node --test server/test/

   Everything happens in throwaway git repos under a fresh tmp dir, so
   these run in-sandbox (git 2.34 + node 22 both available here) with
   zero effect on the mounted repo. They exercise the real host layer:
   the bounded walk, git-status parsing, branch creation + its dirty-
   tree refusal, the allowlist/traversal guards, file reads, and the
   write-on-confirm apply engine (both directly and over HTTP).
   ============================================================ */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { walk } from '../lib/walk.mjs';
import { parseStatus, isGitRepo, git } from '../lib/git.mjs';
import { createBranch, isValidBranchName } from '../lib/branch.mjs';
import { loadAllowlist, resolveRoot, safeJoin } from '../lib/allowlist.mjs';
import { applyEdits, MAX_EDITS, MAX_FIELD_BYTES } from '../lib/apply.mjs';
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
/* apply — write-on-confirm                                    */
/* ---------------------------------------------------------- */

/** A throwaway project root, canonicalised the way resolveRoot returns it. */
function makeProject() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'atelier-apply-')));
  mkdirSync(path.join(dir, 'src'));
  writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export const x = 1;\n');
  writeFileSync(path.join(dir, 'src', 'index.css'), ':root { color: black; }\n');
  return dir;
}

/** No staged temp file may survive any code path. */
function tempFiles(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((p) => p.includes('.atelier-'));
}

/** lstat without throwing — distinguishes absent from inaccessible. */
function lstatExists(p) {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

test('apply rejects malformed batches before touching disk', async () => {
  const dir = makeProject();
  const edit = { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'x\n' };

  await assert.rejects(() => applyEdits(dir, 'nope'), /must be an array/i);
  await assert.rejects(() => applyEdits(dir, []), /no edits/i);
  await assert.rejects(
    () => applyEdits(dir, Array.from({ length: MAX_EDITS + 1 }, (_, i) => ({ ...edit, path: `f${i}.txt` }))),
    /too many files/i,
  );
  await assert.rejects(() => applyEdits(dir, [null]), /must be an object/i);
  await assert.rejects(() => applyEdits(dir, ['x']), /must be an object/i);
  await assert.rejects(() => applyEdits(dir, [[edit]]), /must be an object/i);
  await assert.rejects(() => applyEdits(dir, [{ ...edit, path: 42 }]), /needs a file path/i);
  await assert.rejects(() => applyEdits(dir, [{ ...edit, content: 42 }]), /must be text/i);
  await assert.rejects(() => applyEdits(dir, [{ ...edit, original: 42 }]), /must be text/i);
  await assert.rejects(
    () => applyEdits(dir, [{ ...edit, original: undefined }]),
    /is required/i,
    'the preimage must be explicit (a string, or null for a new file)',
  );

  assert.equal(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8'), 'export const x = 1;\n');
  assert.deepEqual(tempFiles(dir), []);
});

test('apply enforces the per-field byte cap and well-formed text', async () => {
  const dir = makeProject();
  const base = { path: 'src/App.tsx', original: 'export const x = 1;\n' };

  await assert.rejects(
    () => applyEdits(dir, [{ ...base, content: 'a'.repeat(MAX_FIELD_BYTES + 1) }]),
    /apply limit/i,
  );
  await assert.rejects(() => applyEdits(dir, [{ ...base, content: 'a\u0000b' }]), /NUL/i);
  await assert.rejects(() => applyEdits(dir, [{ ...base, content: '\uD800' }]), /valid Unicode/i);
  // Exactly at the cap is allowed through validation.
  const ok = await applyEdits(dir, [{ path: 'src/fits.txt', original: null, content: 'a'.repeat(MAX_FIELD_BYTES) }]);
  assert.equal(ok.status, 'applied');
});

test('apply refuses every unsafe path shape', async () => {
  const dir = makeProject();
  const bad = [
    ['/etc/passwd', /relative/i],
    ['C:/Windows/win.ini', /drive|relative/i],
    ['//server/share/x.txt', /relative/i],
    ['src\\App.tsx', /relative|POSIX/i],
    ['src/../escape.txt', /ambiguous/i],
    ['src/./App.tsx', /ambiguous/i],
    ['src//App.tsx', /ambiguous/i],
    ['src/App.tsx/', /separator/i],
    ['src/App.tsx.', /dot or space/i],
    ['src/App.tsx ', /dot or space/i],
    ['src/a:b.txt', /colons/i],
    ['src/a\u0000b.txt', /NUL/i],
    ['.git/config', /\.git/i],
    ['src/.git/hooks/pre-commit', /\.git/i],
    ['nul.txt', /reserved/i],
    ['SRC/CON', /reserved/i],
    ['lpt1.md', /reserved/i],
  ];
  for (const [p, pattern] of bad) {
    await assert.rejects(
      () => applyEdits(dir, [{ path: p, original: null, content: 'x' }]),
      pattern,
      `expected ${JSON.stringify(p)} to be refused`,
    );
  }
  assert.deepEqual(tempFiles(dir), []);
});

test('apply rejects duplicate and nested targets in one batch', async () => {
  const dir = makeProject();
  await assert.rejects(
    () =>
      applyEdits(dir, [
        { path: 'src/App.tsx', original: null, content: 'a' },
        { path: 'SRC/app.tsx', original: null, content: 'b' },
      ]),
    /twice/i,
  );
  await assert.rejects(
    () =>
      applyEdits(dir, [
        { path: 'src/new', original: null, content: 'a' },
        { path: 'src/new/x.txt', original: null, content: 'b' },
      ]),
    /inside another/i,
  );
});

test('apply creates new files and rewrites existing ones', async () => {
  const dir = makeProject();
  const r = await applyEdits(dir, [
    { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'export const x = 2;\n' },
    { path: 'src/New.tsx', original: null, content: 'export const n = 1;\n' },
    { path: '.gitignore', original: null, content: 'node_modules\n' },
  ]);

  assert.equal(r.status, 'applied');
  assert.deepEqual(r.applied.sort(), ['.gitignore', 'src/App.tsx', 'src/New.tsx']);
  assert.deepEqual(r.issues, []);
  assert.equal(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8'), 'export const x = 2;\n');
  assert.equal(readFileSync(path.join(dir, 'src', 'New.tsx'), 'utf8'), 'export const n = 1;\n');
  assert.equal(readFileSync(path.join(dir, '.gitignore'), 'utf8'), 'node_modules\n');
  assert.deepEqual(tempFiles(dir), []);
});

test('apply keeps an existing file’s permission bits', async (t) => {
  if (process.platform === 'win32') return t.skip('chmod is a readonly flag on Windows');
  const dir = makeProject();
  const abs = path.join(dir, 'src', 'App.tsx');
  chmodSync(abs, 0o600);
  const r = await applyEdits(dir, [
    { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'export const x = 2;\n' },
  ]);
  assert.equal(r.status, 'applied');
  assert.equal(statSync(abs).mode & 0o777, 0o600);
});

test('apply refuses a read-only target on Windows without corrupting it', async (t) => {
  // Windows cannot rename over a read-only file. The failure must be total
  // (nothing applied), leave the original intact, and clean up its temp.
  if (process.platform !== 'win32') return t.skip('POSIX renames over read-only files');
  const dir = makeProject();
  const abs = path.join(dir, 'src', 'App.tsx');
  chmodSync(abs, 0o444);
  const r = await applyEdits(dir, [
    { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'export const x = 2;\n' },
  ]);
  assert.equal(r.status, 'failed');
  assert.deepEqual(r.applied, []);
  assert.equal(readFileSync(abs, 'utf8'), 'export const x = 1;\n');
  assert.deepEqual(tempFiles(dir), []);
});

test('apply writes nothing when a preimage no longer matches', async () => {
  const dir = makeProject();
  // Simulate an edit that landed after the proposal was generated.
  writeFileSync(path.join(dir, 'src', 'App.tsx'), 'export const x = 99;\n');

  const r = await applyEdits(dir, [
    { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'export const x = 2;\n' },
    { path: 'src/New.tsx', original: null, content: 'n\n' },
  ]);

  assert.equal(r.status, 'conflict');
  assert.deepEqual(r.applied, []);
  assert.match(r.issues[0].reason, /changed on disk/i);
  // The conflict aborted the WHOLE batch — the untouched create never ran.
  assert.equal(lstatExists(path.join(dir, 'src', 'New.tsx')), false);
  assert.equal(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8'), 'export const x = 99;\n');
  assert.deepEqual(tempFiles(dir), []);
});

test('apply rejects a create whose target appeared, and a modify whose target vanished', async () => {
  const dir = makeProject();
  const appeared = await applyEdits(dir, [
    { path: 'src/App.tsx', original: null, content: 'clobber\n' },
  ]);
  assert.equal(appeared.status, 'conflict');
  assert.match(appeared.issues[0].reason, /already exists/i);
  assert.equal(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8'), 'export const x = 1;\n');

  const vanished = await applyEdits(dir, [
    { path: 'src/Gone.tsx', original: 'old\n', content: 'new\n' },
  ]);
  assert.equal(vanished.status, 'conflict');
  assert.match(vanished.issues[0].reason, /no longer exists/i);
});

test('apply refuses symlink leaves, symlinked parents and non-file targets', async (t) => {
  const dir = makeProject();
  const outside = mkdtempSync(path.join(tmpdir(), 'atelier-outside-'));
  writeFileSync(path.join(outside, 'secret.txt'), 'secret\n');

  let linked = true;
  try {
    symlinkSync(path.join(outside, 'secret.txt'), path.join(dir, 'link.txt'));
    symlinkSync(outside, path.join(dir, 'outdir'));
  } catch {
    linked = false;
  }
  if (linked) {
    await assert.rejects(
      () => applyEdits(dir, [{ path: 'link.txt', original: 'secret\n', content: 'pwn\n' }]),
      /not a regular file/i,
    );
    await assert.rejects(
      () => applyEdits(dir, [{ path: 'outdir/x.txt', original: null, content: 'pwn\n' }]),
      /not a real directory/i,
    );
    assert.equal(readFileSync(path.join(outside, 'secret.txt'), 'utf8'), 'secret\n');
  } else {
    t.diagnostic('symlinks unsupported here — skipped those two assertions');
  }

  await assert.rejects(
    () => applyEdits(dir, [{ path: 'src', original: null, content: 'x' }]),
    /not a regular file/i,
  );
  await assert.rejects(
    () => applyEdits(dir, [{ path: 'missing/x.txt', original: null, content: 'x' }]),
    /doesn’t exist|doesn't exist/i,
  );
});

test('apply refuses to rewrite a file that is not valid UTF-8', async () => {
  const dir = makeProject();
  writeFileSync(path.join(dir, 'src', 'latin1.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
  const r = await applyEdits(dir, [
    { path: 'src/latin1.txt', original: 'café', content: 'cafe\n' },
  ]);
  assert.equal(r.status, 'conflict');
  assert.match(r.issues[0].reason, /not valid UTF-8/i);
  assert.deepEqual(readFileSync(path.join(dir, 'src', 'latin1.txt')), Buffer.from([0x63, 0x61, 0x66, 0xe9]));
});

test('apply only writes the paths it was given — skipped files stay untouched', async () => {
  const dir = makeProject();
  // The user accepted App.tsx and skipped index.css; the client sends only
  // the accepted subset, and the server must not infer the rest.
  const r = await applyEdits(dir, [
    { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'export const x = 2;\n' },
  ]);
  assert.equal(r.status, 'applied');
  assert.deepEqual(r.applied, ['src/App.tsx']);
  assert.equal(readFileSync(path.join(dir, 'src', 'index.css'), 'utf8'), ':root { color: black; }\n');
});

test('apply reports an exact partial result and cleans up after a mid-batch failure', async () => {
  const dir = makeProject();
  writeFileSync(path.join(dir, 'src', 'b.txt'), 'b-old\n');
  const realRoot = dir;

  const origin = fs.renameSync;
  fs.renameSync = (from, to) => {
    if (String(to).endsWith('b.txt')) {
      const e = new Error('injected failure');
      e.code = 'EIO';
      throw e;
    }
    return origin(from, to);
  };
  syncBuiltinESMExports();
  try {
    const r = await applyEdits(realRoot, [
      { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'export const x = 2;\n' },
      { path: 'src/b.txt', original: 'b-old\n', content: 'b-new\n' },
    ]);
    assert.equal(r.status, 'partial');
    assert.deepEqual(r.applied, ['src/App.tsx'], 'reports exactly what landed');
    assert.equal(r.issues[0].path, 'src/b.txt');
    assert.match(r.note, /1 of 2/);
  } finally {
    fs.renameSync = origin;
    syncBuiltinESMExports();
  }

  assert.equal(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8'), 'export const x = 2;\n');
  assert.equal(readFileSync(path.join(dir, 'src', 'b.txt'), 'utf8'), 'b-old\n');
  assert.deepEqual(tempFiles(dir), []);
});

test('a failed batch does not poison the serialized apply queue', async () => {
  const dir = makeProject();
  await assert.rejects(() => applyEdits(dir, []));
  const r = await applyEdits(dir, [
    { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'after\n' },
  ]);
  assert.equal(r.status, 'applied');
});

/* ---------------------------------------------------------- */
/* apply over HTTP — token gate, allowlist, limits, round trip  */
/* ---------------------------------------------------------- */

const SERVER_ENTRY = fileURLToPath(new URL('../index.mjs', import.meta.url));
const HTTP_TOKEN = 'test-token';
const children = [];

after(() => {
  for (const c of children) c.kill();
});

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createNetServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on('error', reject);
  });
}

/** Boot the real sidecar on an ephemeral port and wait for /api/health. */
async function startSidecar(roots) {
  const port = await freePort();
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: {
      ...process.env,
      ATELIER_ROOTS: roots,
      ATELIER_TOKEN: HTTP_TOKEN,
      ATELIER_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.push(child);
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += String(d);
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${url}/api/health`);
      if (r.ok) return url;
    } catch {
      /* not up yet */
    }
    if (child.exitCode != null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  child.kill();
  throw new Error(`sidecar did not start: ${stderr}`);
}

function postApply(url, body, token = HTTP_TOKEN) {
  return fetch(`${url}/api/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { 'x-atelier-token': token } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('HTTP apply requires the sidecar token', async () => {
  const dir = makeProject();
  const url = await startSidecar(dir);
  const r = await postApply(url, { root: dir, edits: [] }, '');
  assert.equal(r.status, 401);
  assert.match((await r.json()).error, /token/i);
});

test('HTTP apply refuses a root outside the allowlist', async () => {
  const dir = makeProject();
  const other = makeProject();
  const url = await startSidecar(dir);
  const r = await postApply(url, {
    root: other,
    edits: [{ path: 'src/App.tsx', original: null, content: 'x' }],
  });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /outside the allowlist/i);
  assert.equal(readFileSync(path.join(other, 'src', 'App.tsx'), 'utf8'), 'export const x = 1;\n');
});

test('HTTP apply rejects malformed JSON and an oversized body', async () => {
  const dir = makeProject();
  const url = await startSidecar(dir);

  const bad = await postApply(url, '{"root":');
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /valid JSON/i);

  // Larger than MAX_APPLY_BODY (8 MB) but within the drain window.
  const huge = await postApply(url, { root: dir, pad: 'x'.repeat(9 * 1024 * 1024) });
  assert.equal(huge.status, 413);
  assert.match((await huge.json()).error, /too large/i);
});

test('HTTP apply round trip writes only the accepted files', async () => {
  const dir = makeProject();
  writeFileSync(path.join(dir, 'src', 'keep.txt'), 'keep\n');
  const url = await startSidecar(dir);

  const r = await postApply(url, {
    root: dir,
    edits: [
      { path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'export const x = 2;\n' },
      { path: 'src/New.tsx', original: null, content: 'export const n = 1;\n' },
    ],
  });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.status, 'applied');
  assert.deepEqual(out.applied.sort(), ['src/App.tsx', 'src/New.tsx']);

  assert.equal(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8'), 'export const x = 2;\n');
  assert.equal(readFileSync(path.join(dir, 'src', 'New.tsx'), 'utf8'), 'export const n = 1;\n');
  // The file the user skipped never left the client, and is untouched.
  assert.equal(readFileSync(path.join(dir, 'src', 'keep.txt'), 'utf8'), 'keep\n');
  assert.equal(readFileSync(path.join(dir, 'src', 'index.css'), 'utf8'), ':root { color: black; }\n');
  assert.deepEqual(tempFiles(dir), []);
});

test('HTTP apply reports a preflight conflict without writing', async () => {
  const dir = makeProject();
  const url = await startSidecar(dir);
  writeFileSync(path.join(dir, 'src', 'App.tsx'), 'edited elsewhere\n');

  const r = await postApply(url, {
    root: dir,
    edits: [{ path: 'src/App.tsx', original: 'export const x = 1;\n', content: 'x\n' }],
  });
  assert.equal(r.status, 200);
  const out = await r.json();
  assert.equal(out.status, 'conflict');
  assert.deepEqual(out.applied, []);
  assert.equal(readFileSync(path.join(dir, 'src', 'App.tsx'), 'utf8'), 'edited elsewhere\n');
  assert.deepEqual(tempFiles(dir), []);
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

test('verify reports a failing script as fail, never unavailable', async () => {
  // Regression: `ELIFECYCLE` in the npm output once matched the platform-error
  // probe, which relabelled every genuinely failing script as 'unavailable'.
  const dir = mkdtempSync(path.join(tmpdir(), 'atelier-verify3-'));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(3)"' } }),
  );
  const r = await verify(dir, { timeoutMs: 20000 });
  assert.equal(r.steps.test.status, 'fail');
  assert.equal(r.steps.test.exitCode, 3);
});

test('verify launches the package manager on Windows', async () => {
  // Regression: execFile('npm') is ENOENT on Windows (npm is a .cmd shim) and
  // execFile('npm.cmd') is EINVAL, so every step falsely reported 'fail'.
  if (process.platform !== 'win32') return;
  const dir = mkdtempSync(path.join(tmpdir(), 'atelier-verify4-'));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(0)"' } }),
  );
  const r = await verify(dir, { timeoutMs: 20000 });
  assert.notEqual(r.steps.test.status, 'unavailable', r.steps.test.note ?? '');
  assert.equal(r.steps.test.status, 'pass');
});

test('verify falls back to the local tsc binary, not `npm tsc`', async () => {
  // Regression: the fallback built `npm tsc -b`, which npm parses as the
  // unknown subcommand "tsc" and exits non-zero on every TS project without
  // an explicit typecheck script.
  const dir = mkdtempSync(path.join(tmpdir(), 'atelier-verify5-'));
  mkdirSync(path.join(dir, 'node_modules', 'typescript', 'bin'), { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));
  writeFileSync(path.join(dir, 'tsconfig.json'), '{}');
  // Stand-in for tsc: asserts it was invoked with -b and exits clean.
  writeFileSync(
    path.join(dir, 'node_modules', 'typescript', 'bin', 'tsc'),
    'process.exit(process.argv.slice(2).join(",") === "-b" ? 0 : 9);\n',
  );
  const r = await verify(dir, { timeoutMs: 20000 });
  assert.equal(r.steps.typecheck.status, 'pass');
});
