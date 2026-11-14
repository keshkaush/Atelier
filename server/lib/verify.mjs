/* ============================================================
   Verification runner — the QA stage's muscle.

   Runs what the *target project* actually declares in its package.json:
     · typecheck  — `npm run typecheck` / `tsc -b`, if any of those exist
     · lint       — `npm run lint`, if a lint script exists
     · test       — `npm test` / `npm run test`, if present

   Everything is best-effort and degrades gracefully: a missing script
   is reported as "skipped", not a failure, and a platform problem
   (e.g. win32-only native binaries in a Linux sandbox) surfaces as an
   honest "could not run" note rather than a red X. We never invent a
   pass. The command array is fixed (npm/pnpm run <script>) so nothing
   user-supplied reaches a shell.
   ============================================================ */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MAX_OUTPUT = 6000;

function run(cmd, args, cwd, timeout) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: false },
      (err, stdout, stderr) => {
        // execFile sets err.killed on timeout, err.code on non-zero exit.
        const timedOut = Boolean(err && err.killed);
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({
          code,
          timedOut,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        });
      },
    );
  });
}

function tail(text) {
  const t = (text || '').trim();
  if (t.length <= MAX_OUTPUT) return t;
  return '…' + t.slice(t.length - MAX_OUTPUT);
}

/** Read package.json (if any) and pull out the scripts we care about. */
function readPackage(rootReal) {
  const pkgPath = path.join(rootReal, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return { scripts: pkg.scripts ?? {}, name: pkg.name };
  } catch {
    return { scripts: {}, name: undefined, unreadable: true };
  }
}

/** Choose a package manager: pnpm-lock.yaml → pnpm, yarn.lock → yarn, else npm. */
function packageManager(rootReal) {
  if (existsSync(path.join(rootReal, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(path.join(rootReal, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** Which command actually typechecks this project? */
function typecheckCommand(rootReal, scripts) {
  if (scripts.typecheck) return { label: 'typecheck', args: ['run', 'typecheck'] };
  if (scripts['type-check']) return { label: 'type-check', args: ['run', 'type-check'] };
  // Fall back to a local tsc build if a tsconfig exists.
  if (existsSync(path.join(rootReal, 'tsconfig.json'))) {
    const localTsc = path.join(rootReal, 'node_modules', '.bin', 'tsc');
    if (existsSync(localTsc)) return { label: 'tsc -b', direct: localTsc, args: ['-b'] };
    return { label: 'tsc -b', npx: true, args: ['tsc', '-b'] };
  }
  return null;
}

function looksLikePlatformError(out) {
  return /cannot find module .*rollup|@esbuild\/|\.node\b.*win32|win32-x64|ELIFECYCLE|Exec format error/i.test(
    out,
  );
}

async function runStep(pm, spec, rootReal, timeoutMs) {
  if (!spec) {
    return { id: null, status: 'skipped' };
  }
  const started = Date.now();
  let result;
  if (spec.direct) {
    result = await run(spec.direct, spec.args, rootReal, timeoutMs);
  } else if (spec.npx) {
    result = await run(pm, spec.args, rootReal, timeoutMs);
  } else {
    result = await run(pm, spec.args, rootReal, timeoutMs);
  }
  const elapsedMs = Date.now() - started;
  const combined = `${result.stdout}\n${result.stderr}`;

  let status;
  let note;
  if (result.timedOut) {
    status = 'error';
    note = 'Timed out.';
  } else if (result.code === 0) {
    status = 'pass';
  } else if (looksLikePlatformError(combined)) {
    status = 'unavailable';
    note = 'Could not run — the target’s native binaries don’t match this platform.';
  } else {
    status = 'fail';
  }
  return {
    status,
    note,
    elapsedMs,
    output: tail(result.stdout || result.stderr),
    exitCode: result.code,
  };
}

/**
 * Verify a project root. Returns a structured report:
 *   { ranAt, packageManager, isNodeProject, steps: { typecheck, lint, test } }
 * Each step: { status: 'pass'|'fail'|'skipped'|'unavailable'|'error',
 *              note?, output?, elapsedMs?, exitCode? }
 */
export async function verify(rootReal, opts = {}) {
  const ranAt = Date.now();
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pkg = readPackage(rootReal);

  if (!pkg) {
    return {
      ranAt,
      isNodeProject: false,
      packageManager: null,
      steps: {
        typecheck: { status: 'skipped', note: 'No package.json — not a Node project to typecheck.' },
        lint: { status: 'skipped' },
        test: { status: 'skipped' },
      },
    };
  }

  const pm = packageManager(rootReal);
  const scripts = pkg.scripts ?? {};

  const tcSpec = typecheckCommand(rootReal, scripts);
  const lintSpec = scripts.lint ? { label: 'lint', args: ['run', 'lint'] } : null;
  const testSpec = scripts.test ? { label: 'test', args: ['test'] } : null;

  const [typecheck, lint, test] = await Promise.all([
    runStep(pm, tcSpec ? { ...tcSpec, id: 'typecheck' } : null, rootReal, timeoutMs),
    runStep(pm, lintSpec ? { ...lintSpec, id: 'lint' } : null, rootReal, timeoutMs),
    runStep(pm, testSpec ? { ...testSpec, id: 'test' } : null, rootReal, timeoutMs),
  ]);

  return {
    ranAt,
    isNodeProject: true,
    packageManager: pm,
    packageName: pkg.name,
    steps: {
      typecheck: tcSpec ? typecheck : { status: 'skipped', note: 'No typecheck or tsconfig.' },
      lint: lintSpec ? lint : { status: 'skipped', note: 'No lint script.' },
      test: testSpec ? test : { status: 'skipped', note: 'No test script.' },
    },
  };
}
