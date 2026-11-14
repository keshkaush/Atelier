/* ============================================================
   Write-on-confirm — the one place the sidecar mutates a project.

   The browser sends complete replacement text for the files the user
   explicitly accepted, plus the exact preimage each proposal was based
   on (or `null` when the file must still not exist). Nothing here
   reconstructs content from diff hunks, and nothing trusts the client's
   path handling.

   Order of operations:
     1. validate every path and payload (containment, syntax, limits)
     2. verify every precondition against the real disk — before staging
        a single byte
     3. for each item: stage its write to an exclusive temp file beside
        the target, re-verify the precondition, then commit by rename
        (replace) or exclusive publish (create)

   What this deliberately does NOT claim: multi-file atomicity. A
   process crash or a hostile concurrent directory swap can still
   interrupt a batch. Preflight conflicts write nothing; a commit that
   fails after earlier files landed is reported as `partial` with the
   exact applied paths. We never roll back by rewriting a file — that
   could clobber an edit a user made in the meantime.

   Serialized per process: two applies never interleave.
   ============================================================ */

import {
  closeSync,
  constants as FS,
  copyFileSync,
  fchmodSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { TextDecoder } from 'node:util';

import { badRequest, forbidden } from './errors.mjs';
import { safeJoin } from './allowlist.mjs';

/** Keep a single apply to a review-sized batch. */
export const MAX_EDITS = 8;
/** Per-field ceiling; mirrors the 400 KB read cap in index.mjs. */
export const MAX_FIELD_BYTES = 400 * 1024;

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** Windows device names that can't be used as file names on any drive. */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * A requested write path must be a plain, project-relative file path.
 * Rejects every shape that could escape, alias, or confuse resolution:
 * absolute paths, drive/UNC forms, backslashes, dot segments, empty
 * segments, NUL/ADS colons, `.git` components, and trailing dots/spaces
 * (Windows silently strips those, which would alias another file).
 */
function checkPathSyntax(rel) {
  if (typeof rel !== 'string' || !rel) throw badRequest('Every edit needs a file path.');
  if (rel.length > 1024) throw badRequest('That file path is too long.');
  if (rel.includes('\u0000')) throw badRequest('File paths may not contain NUL bytes.');
  if (path.isAbsolute(rel) || rel.includes('\\')) {
    throw forbidden('File paths must be relative, with POSIX separators.');
  }
  if (/^[A-Za-z]:/.test(rel)) throw forbidden('File paths must not name a drive.');
  if (rel.endsWith('/')) throw badRequest('A file path may not end with a separator.');

  const parts = rel.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..') {
      throw forbidden('That file path contains an ambiguous segment.');
    }
    if (part.includes(':')) throw forbidden('File paths may not contain colons.');
    if (/[. ]$/.test(part)) throw forbidden('File names may not end with a dot or space.');
    if (WINDOWS_RESERVED.test(part)) throw forbidden(`“${part}” is a reserved file name.`);
  }
  if (parts.some((p) => p.toLowerCase() === '.git')) {
    throw forbidden('Refusing to write inside .git.');
  }
  return parts;
}

/** A single payload field: a UTF-8 string within the size cap. */
function checkField(value, label, allowNull) {
  if (value === undefined) throw badRequest(`${label} is required.`);
  if (value === null) {
    if (!allowNull) throw badRequest(`${label} may not be null.`);
    return;
  }
  if (typeof value !== 'string') throw badRequest(`${label} must be text.`);
  if (value.includes('\u0000')) throw badRequest(`${label} may not contain NUL bytes.`);
  if (!value.isWellFormed()) {
    throw badRequest(`${label} is not valid Unicode text.`);
  }
  if (Buffer.byteLength(value, 'utf8') > MAX_FIELD_BYTES) {
    throw badRequest(`${label} exceeds the ${MAX_FIELD_BYTES / 1024} KB apply limit.`);
  }
}

/** Reject batches whose targets alias each other or nest inside one another. */
function checkBatchShape(paths) {
  const seen = new Set();
  for (const rel of paths) {
    const key = rel.toLowerCase();
    if (seen.has(key)) {
      throw badRequest(`“${rel}” appears twice in the same batch.`);
    }
    seen.add(key);
  }
  const sorted = [...seen].sort();
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startsWith(`${sorted[i - 1]}/`)) {
      throw badRequest('One edit targets a path inside another edit’s target.');
    }
  }
}

/**
 * Confirm every ancestor of `rel` is a real directory (never a symlink or
 * junction) and the leaf is either a regular file or absent. Returns the
 * absolute target path.
 *
 * The leaf is lstat'd on the *lexical* join, before realpath. Resolving a
 * symlink first would hide the fact that the path the user reviewed is a
 * link — and publishing through it would rewrite whatever it points at
 * rather than the named file.
 */
function inspectTarget(rootReal, rel) {
  const parts = rel.split('/');
  let current = rootReal;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    let st;
    try {
      st = lstatSync(current);
    } catch {
      throw badRequest(`The folder for “${rel}” doesn’t exist. Create it first.`);
    }
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw forbidden(`Refusing to write through “${current}” — not a real directory.`);
    }
  }

  const lexical = path.join(rootReal, ...parts);
  let leaf = null;
  try {
    leaf = lstatSync(lexical);
  } catch {
    leaf = null;
  }
  if (leaf && (leaf.isSymbolicLink() || !leaf.isFile())) {
    throw forbidden(`Refusing to overwrite “${rel}” — not a regular file.`);
  }

  // Containment: realpath-based check shared with the read path. Runs after
  // the leaf check so an escaping symlink is reported as what it is.
  const abs = safeJoin(rootReal, rel);
  return { abs, leaf };
}

/** Read a file as strict UTF-8; refuse to rewrite anything we can't round-trip. */
function readStrictText(abs) {
  let buf;
  try {
    buf = readFileSync(abs);
  } catch (e) {
    throw badRequest(`Could not read the current contents of this file: ${e.code ?? 'error'}.`);
  }
  try {
    return UTF8.decode(buf);
  } catch {
    throw forbidden('That file is not valid UTF-8 — refusing to rewrite it.');
  }
}

/**
 * Validate + preflight the whole batch. Throws HttpError for malformed
 * requests; returns the resolved plan, or a conflict report with no writes.
 */
function preflight(rootReal, edits) {
  if (!Array.isArray(edits)) throw badRequest('Edits must be an array.');
  if (edits.length === 0) throw badRequest('No edits were submitted.');
  if (edits.length > MAX_EDITS) {
    throw badRequest(`Too many files in one apply (max ${MAX_EDITS}).`);
  }

  const issues = [];
  const plan = [];

  for (const edit of edits) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
      throw badRequest('Every edit must be an object.');
    }
    const rel = edit.path;
    checkPathSyntax(rel);
    checkField(edit.content, `The new contents of “${rel}”`, false);
    checkField(edit.original, `The original contents of “${rel}”`, true);
    plan.push({ rel, original: edit.original, content: edit.content });
  }

  checkBatchShape(plan.map((p) => p.rel));

  for (const item of plan) {
    const { abs, leaf } = inspectTarget(rootReal, item.rel);
    item.abs = abs;

    if (item.original === null) {
      // Proposing a new file — it must still be absent.
      if (leaf) issues.push({ path: item.rel, reason: 'This file already exists now.' });
      // `null` mode means "respect the umask" — a brand-new file should not
      // be forced to 0666 just because we staged it.
      item.mode = null;
      continue;
    }

    if (!leaf) {
      issues.push({ path: item.rel, reason: 'This file no longer exists.' });
      continue;
    }
    let current;
    try {
      current = readStrictText(abs);
    } catch (e) {
      issues.push({ path: item.rel, reason: e.message });
      continue;
    }
    if (current !== item.original) {
      issues.push({
        path: item.rel,
        reason: 'The file changed on disk after the proposal was generated.',
      });
      continue;
    }
    item.mode = leaf.mode & 0o7777;
  }

  if (issues.length) {
    return {
      status: 'conflict',
      applied: [],
      issues,
      note: 'Nothing was written — the reviewed files no longer match what was proposed.',
    };
  }
  return { plan };
}

/** Write one edit through a staged temp file in the target's directory. */
function commit(item) {
  const dir = path.dirname(item.abs);
  const tmp = path.join(dir, `.atelier-${randomBytes(6).toString('hex')}.tmp`);

  try {
    // A replacement keeps the target's existing permission bits; a new file
    // gets normal umask-governed defaults (no fchmod, so 0666 is not forced).
    const fd = openSync(tmp, 'wx', item.mode ?? 0o666);
    try {
      writeSync(fd, item.content, 0, 'utf8');
      if (item.mode !== null) fchmodSync(fd, item.mode);
    } finally {
      closeSync(fd);
    }

    // Re-check the precondition right before publishing: the batch can be
    // stale by the time earlier files were committed.
    let leaf = null;
    try {
      leaf = lstatSync(item.abs);
    } catch {
      leaf = null;
    }
    if (item.original === null) {
      if (leaf) throw new Error('This file appeared on disk during the apply.');
      // Exclusive publish — never overwrite a file that showed up.
      try {
        linkSync(tmp, item.abs);
        unlinkSync(tmp);
        return;
      } catch (e) {
        if (e.code !== 'EPERM' && e.code !== 'ENOSYS' && e.code !== 'EXDEV') throw e;
      }
      copyFileSync(tmp, item.abs, FS.COPYFILE_EXCL);
      unlinkSync(tmp);
      return;
    }
    if (!leaf) throw new Error('This file disappeared during the apply.');
    if (leaf.isSymbolicLink() || !leaf.isFile()) {
      throw new Error('This path is no longer a regular file.');
    }
    if (readStrictText(item.abs) !== item.original) {
      throw new Error('This file changed on disk during the apply.');
    }
    renameSync(tmp, item.abs);
  } catch (e) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* best effort — a stray temp file is better than a lost error */
    }
    throw e;
  }
}

let queue = Promise.resolve();

/**
 * Apply a validated batch, serialized against other applies.
 * Returns { status, applied, issues, note? }.
 */
export function applyEdits(rootReal, edits) {
  const run = async () => {
    const checked = preflight(rootReal, edits);
    if (!checked.plan) return checked;

    const applied = [];
    for (const item of checked.plan) {
      try {
        commit(item);
        applied.push(item.rel);
      } catch (e) {
        const reason = e instanceof Error ? e.message : 'Write failed.';
        if (applied.length === 0) {
          return {
            status: 'failed',
            applied,
            issues: [{ path: item.rel, reason }],
            note: 'Nothing was written.',
          };
        }
        return {
          status: 'partial',
          applied,
          issues: [{ path: item.rel, reason }],
          note: `Wrote ${applied.length} of ${checked.plan.length} files before stopping. Re-read the project and generate a fresh proposal before applying again.`,
        };
      }
    }

    return {
      status: 'applied',
      applied,
      issues: [],
      note: `Wrote ${applied.length} file${applied.length === 1 ? '' : 's'}.`,
    };
  };

  const result = queue.then(run, run);
  // Keep the chain alive regardless of this batch's outcome.
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
