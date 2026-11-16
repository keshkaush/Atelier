#!/usr/bin/env node
/* Compile the pure workspace machine to ESM in a temp dir, copy its
   test alongside, and run it with node:test. The machine has only TS
   type-imports (erased at compile), so it runs as plain ESM — no React,
   no jsdom, no bundler. This gives the reducer suite a one-command run
   that works in-sandbox despite the win32-only native modules.

   The compile goes through a generated tsconfig rather than bare CLI
   flags: machine.ts only type-imports its neighbours, but tsc still
   type-checks them, and those reach `import.meta.env` via model.ts. The
   ambient Vite types (src/vite-env.d.ts) have to be in the program, and
   pinning `rootDir` keeps the emitted layout stable no matter which
   files the program picks up. */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
// Run TypeScript's JS entry point under node. The .bin/tsc shim is a .cmd on
// Windows, which execFileSync refuses to launch (EINVAL, CVE-2024-27980).
const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const out = mkdtempSync(path.join(tmpdir(), 'atelier-mtest-'));

// Emitted layout mirrors src/: out/lib/workspace/machine.js
const toPosix = (p) => p.split(path.sep).join('/');
const tsconfig = path.join(out, 'tsconfig.json');
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2020',
        module: 'ESNext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        skipLibCheck: true,
        strict: true,
        noEmit: false,
        rootDir: toPosix(path.join(root, 'src')),
        outDir: toPosix(out),
      },
      files: [
        toPosix(path.join(root, 'src/lib/workspace/machine.ts')),
        toPosix(path.join(root, 'src/vite-env.d.ts')),
      ],
    },
    null,
    2,
  ),
);

try {
  execFileSync(process.execPath, [tsc, '--project', tsconfig], {
    stdio: 'inherit',
    cwd: root,
  });
  const compiledTestDir = path.join(out, 'lib', 'workspace');
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
