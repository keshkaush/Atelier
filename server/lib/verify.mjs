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
const IS_WIN = process.platform === 'win32';

/**
 * On Windows `npm`/`pnpm`/`yarn` are `.cmd` shims, and Node's execFile
 * cannot launch them: the bare name is ENOENT (no PATHEXT lookup) and the
 * `.cmd` path is EINVAL (CVE-2024-27980 hardening). Resolve the package
 * manager's real JS entry point and run it under node instead. Falls back
 * to a shell only when the CLI file can't be located next to the runtime —
 * and even then every argument is a fixed literal, never user text.
 */
function pmLauncher(pm) {
  if (!IS_WIN) return { cmd: pm, prefix: [], useShell: false };
  const globalModules = path.join(path.dirname(process.execPath), 'node_modules');
  const cli = {
    npm: path.join(globalModules, 'npm', 'bin', 'npm-cli.js'),
    pnpm: path.join(globalModules, 'pnpm', 'bin', 'pnpm.cjs'),
    yarn: path.join(globalModules, 'yarn', 'bin', 'yarn.js'),
  }[pm];
  if (cli && existsSync(cli)) return { cmd: process.execPath, prefix: [cli], useShell: false };
  // Last resort: let cmd.exe resolve the shim. Args below are literals.
  return { cmd: pm, prefix: [], useShell: true };
}

function run(cmd, args, cwd, timeout, useShell = false) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { cwd, timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: useShell },
      (err, stdout, stderr) => {
        // execFile sets err.killed on timeout, err.code on non-zero exit.
        const timedOut = Boolean(err && err.killed);
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        // Spawn failures carry a string code ('ENOENT', 'EINVAL'); a script
        // that exits non-zero carries a numeric one. The distinction matters:
        // "we couldn't launch npm" must never be reported as "your tests failed".
        const spawnFailed = Boolean(err && typeof err.code === 'string');
        resolve({
          code,
          timedOut,
          spawnFailed,
          spawnMessage: spawnFailed ? `${err.code}: ${err.message}` : undefined,
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

/**
 * Which command actually typechecks this project?
 * Order: an explicit script, then the project's own tsc binary. Note the
 * fallback runs tsc *directly* — `npm run tsc -b` would be parsed as the
 * npm subcommand "tsc", which npm rejects ("Unknown command: tsc").
 */
function typecheckCommand(rootReal, scripts) {
  if (scripts.typecheck) return { label: 'typecheck', args: ['run', 'typecheck'] };
  if (scripts['type-check']) return { label: 'type-check', args: ['run', 'type-check'] };
  if (!existsSync(path.join(rootReal, 'tsconfig.json'))) return null;

  // Prefer the tsc JS entry point: it runs under node on every platform,
  // whereas node_modules/.bin/tsc is a .cmd shim on Windows (unlaunchable
  // from execFile) and a symlink to a shell script elsewhere.
  const tscJs = path.join(rootReal, 'node_modules', 'typescript', 'bin', 'tsc');
  if (existsSync(tscJs)) return { label: 'tsc -b', cmd: process.execPath, prefix: [tscJs], args: ['-b'] };

  const tscShim = path.join(rootReal, 'node_modules', '.bin', IS_WIN ? 'tsc.cmd' : 'tsc');
  if (existsSync(tscShim)) {
    return IS_WIN
      ? { label: 'tsc -b', cmd: tscShim, useShell: true, args: ['-b'] }
      : { label: 'tsc -b', cmd: tscShim, args: ['-b'] };
  }
  return null;
}

function looksLikePlatformError(out) {
  return /cannot find module .*rollup|@esbuild\/|\.node\b.*win32|win32-x64|Exec format error/i.test(
    out,
  );
}

async function runStep(pm, spec, rootReal, timeoutMs) {
  if (!spec) {
    return { id: null, status: 'skipped' };
  }
  const started = Date.now();
  let result;
  if (spec.cmd) {
    // Already a fully-resolved launcher (e.g. node + typescript/bin/tsc).
    result = await run(spec.cmd, [...spec.prefix ?? [], ...spec.args], rootReal, timeoutMs, spec.useShell);
  } else {
    const launcher = pmLauncher(pm);
    result = await run(
      launcher.cmd,
      [...launcher.prefix, ...spec.args],
      rootReal,
      timeoutMs,
      launcher.useShell,
    );
  }
  const elapsedMs = Date.now() - started;
  const combined = `${result.stdout}\n${result.stderr}`;

  let status;
  let note;
  if (result.spawnFailed) {
    // We never ran the command — that is our limitation, not a red X for the
    // project. Report it honestly instead of inventing a 'fail'.
    status = 'unavailable';
    note = `Could not launch ${pm}: ${result.spawnMessage}`;
  } else if (result.timedOut) {
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
