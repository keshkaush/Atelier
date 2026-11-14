#!/usr/bin/env node
/* Compile the pure workspace machine to ESM in a temp dir, copy its
   test alongside, and run it with node:test. The machine has only TS
   type-imports (erased at compile), so it runs as plain ESM — no React,
   no jsdom, no bundler. This gives the reducer suite a one-command run
   that works in-sandbox despite the win32-only native modules. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
// Run TypeScript's JS entry point under node. The .bin/tsc shim is a .cmd on
// Windows, which execFileSync refuses to launch (EINVAL, CVE-2024-27980).
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const out = mkdtempSync(path.join(tmpdir(), 'atelier-mtest-'));

try {
  execFileSync(
    process.execPath,
    [
      tsc,
      path.join(root, 'src/lib/workspace/machine.ts'),
      '--outDir', out,
      '--module', 'esnext',
      '--target', 'es2020',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
    ],
    { stdio: 'inherit', cwd: root },
  );
  const compiledTestDir = path.join(out, 'workspace');
  copyFileSync(
    path.join(root, 'src/lib/workspace/machine.test.mjs'),
    path.join(compiledTestDir, 'machine.test.mjs'),
  );
  execFileSync(process.execPath, ['--test', 'machine.test.mjs'], {
    stdio: 'inherit',
    cwd: compiledTestDir,
  });
} finally {
  rmSync(out, { recursive: true, force: true });
}
