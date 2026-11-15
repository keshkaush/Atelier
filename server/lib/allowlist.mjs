/* ============================================================
   Allowlist + path safety.

   The sidecar binds loopback and requires a token, but the real
   containment is here: the only directories it will ever read or
   run git in are the roots the user declared when starting it
   (ATELIER_ROOTS). Everything else is refused — no arbitrary path
   reads, ever.

   Two levels of check:
     · resolveRoot(requested)  — a project root the UI asks for must
       resolve (after realpath, so `..` and symlinks are followed) to
       a directory that is exactly, or nested inside, a declared root.
     · safeJoin(rootReal, rel) — a file path the UI names for reading
       must stay inside that root; absolute paths and `..` escapes are
       rejected.
   ============================================================ */

import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { forbidden, badRequest } from './errors.mjs';

/** Split the ATELIER_ROOTS env value on the platform delimiter plus a few
    conveniences so Windows `;` and a stray `,` both work. */
function splitRoots(raw) {
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Resolve the declared roots to canonical realpaths. Missing or non-
 * directory entries are dropped (with a warning) rather than throwing,
 * so a typo in one root doesn't take the whole sidecar down.
 */
export function loadAllowlist(env = process.env, warn = () => {}) {
  const declared = splitRoots(env.ATELIER_ROOTS);
  const roots = [];
  for (const raw of declared) {
    if (!path.isAbsolute(raw)) {
      warn(`ATELIER_ROOTS entry is not absolute, ignoring: ${raw}`);
      continue;
    }
    try {
      const real = realpathSync(raw);
      if (!statSync(real).isDirectory()) {
        warn(`ATELIER_ROOTS entry is not a directory, ignoring: ${raw}`);
        continue;
      }
      roots.push(real);
    } catch {
      warn(`ATELIER_ROOTS entry does not exist, ignoring: ${raw}`);
    }
  }
  return roots;
}

/** True if `child` is the same as, or nested inside, `parent`. */
function isWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Canonicalise a requested project root and confirm it is inside the
 * allowlist. Throws 403 otherwise. Returns { real, name }.
 */
export function resolveRoot(requested, allowlist) {
  if (typeof requested !== 'string' || !requested.trim()) {
    throw badRequest('A project root is required.');
  }
  if (!path.isAbsolute(requested)) {
    throw badRequest('Project root must be an absolute path.');
  }
  let real;
  try {
    real = realpathSync(requested);
  } catch {
    throw forbidden('That path does not exist or is not readable.');
  }
  let st;
  try {
    st = statSync(real);
  } catch {
    throw forbidden('That path is not readable.');
  }
  if (!st.isDirectory()) {
    throw badRequest('Project root must be a directory.');
  }
  const allowed = allowlist.some((root) => isWithin(root, real));
  if (!allowed) {
    throw forbidden(
      'That directory is outside the allowlist. Start the sidecar with ATELIER_ROOTS set to the folders you want to expose.',
    );
  }
  return { real, name: path.basename(real) || real };
}

/**
 * Join a relative path onto a canonical root and guarantee the result
 * stays inside it. Absolute inputs and `..` escapes throw 403.
 *
 * Two checks, because a lexical check alone is not enough:
 *   1. lexical — path.resolve + isWithin catches `..` and absolute paths
 *   2. realpath — resolve symlinks on the FINAL path and re-check, so a
 *      symlink planted inside an allowlisted root that points outside it
 *      (e.g. `project/passwd -> /etc/passwd`) can't be used to read out.
 * The realpath is best-effort for the not-yet-existing case: if the file
 * doesn't exist we realpath its parent directory and re-join the basename,
 * which still catches a symlinked parent escaping the root.
 */
export function safeJoin(rootReal, rel) {
  if (typeof rel !== 'string' || !rel) {
    throw badRequest('A relative file path is required.');
  }
  if (path.isAbsolute(rel)) {
    throw forbidden('File paths must be relative to the project root.');
  }
  // Normalise the root itself too (callers pass an already-real path, but
  // be defensive so the isWithin comparison is apples-to-apples).
  let rootCanon = rootReal;
  try {
    rootCanon = realpathSync(rootReal);
  } catch {
    /* keep the given root */
  }

  const joined = path.resolve(rootCanon, rel);
  if (!isWithin(rootCanon, joined)) {
    throw forbidden('That file path escapes the project root.');
  }

  // Resolve symlinks on the final target (or its parent, if the leaf is
  // absent) and re-verify containment.
  let real = joined;
  try {
    real = realpathSync(joined);
  } catch {
    // Leaf doesn't exist — canonicalise the parent directory instead.
    try {
      const realParent = realpathSync(path.dirname(joined));
      real = path.join(realParent, path.basename(joined));
    } catch {
      /* parent also absent — the read will just 404; lexical check stands */
    }
  }
  if (!isWithin(rootCanon, real)) {
    throw forbidden('That file path resolves outside the project root.');
  }
  return real;
}

export { isWithin };
