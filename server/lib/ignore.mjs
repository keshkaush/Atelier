/* ============================================================
   Shared ignore manifest loader.

   `src/lib/project/ignore-dirs.json` is the single source of truth for
   which directory names are never project source: dependencies and build
   output. The browser-side analyzer (analyze.ts) imports the same file
   through the bundler; the sidecar reads it here. One file, two readers,
   so the walk, the analysis and the write guard can never disagree.

   Read once at module load — the manifest is static data, not config.
   ============================================================ */

import { readFileSync } from 'node:fs';

const MANIFEST_URL = new URL('../../src/lib/project/ignore-dirs.json', import.meta.url);

/** @type {Record<string, string[]>} reason → directory names */
export const IGNORE_DIRS = JSON.parse(readFileSync(MANIFEST_URL, 'utf8'));

/** Every ignored directory name, lower-cased, with its reason. */
export const IGNORE_DIR_REASONS = new Map(
  Object.entries(IGNORE_DIRS).flatMap(([reason, names]) =>
    names.map((name) => [name.toLowerCase(), reason]),
  ),
);

/** Flat set of ignored directory names (lower-cased). */
export const IGNORE_DIR_NAMES = new Set(IGNORE_DIR_REASONS.keys());

/**
 * Why a project-relative path is off-limits, or null if it's real source.
 * Matches on any path segment, so `a/.venv/b.py` is caught as well as
 * `.venv/b.py`.
 */
export function ignoreReasonForPath(rel) {
  for (const part of String(rel).split('/')) {
    const reason = IGNORE_DIR_REASONS.get(part.toLowerCase());
    if (reason) return reason;
  }
  return null;
}
