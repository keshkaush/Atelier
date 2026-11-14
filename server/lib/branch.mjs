/* ============================================================
   Branch-name validation + creation.

   The name is validated against a strict regex BEFORE it ever reaches
   git (which also has its own rules). We use `git checkout -b`, which
   refuses to overwrite an existing branch, and we NEVER auto-stash:
   if the tree is dirty and the caller didn't explicitly opt in, we
   return { ok:false, dirty:true } and stop. The user's uncommitted
   work is never touched.
   ============================================================ */

import { git, isGitRepo } from './git.mjs';

// Git ref rules, bounded to what the UI's slug can produce. Mirrors the
// client-side regex in the branch-prep stage so both agree.
export const BRANCH_RE = /^[a-z0-9][a-z0-9._/-]*$/i;

export function isValidBranchName(name) {
  if (typeof name !== 'string') return false;
  if (!name || name.length > 200) return false;
  if (!BRANCH_RE.test(name)) return false;
  // No path-traversal-ish or git-invalid sequences.
  if (name.includes('..') || name.includes('//')) return false;
  if (name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false;
  return true;
}

/**
 * Create and check out a new branch at `root`.
 * @returns {Promise<{ok:boolean, branch?:string, dirty?:boolean, note?:string}>}
 */
export async function createBranch(root, name, opts = {}) {
  if (!isValidBranchName(name)) {
    return { ok: false, note: `“${name}” is not a valid branch name.` };
  }
  if (!(await isGitRepo(root))) {
    return { ok: false, note: 'This folder is not a git repository.' };
  }

  // Dirty-tree check first — never auto-stash.
  const status = await git(['-C', root, 'status', '--porcelain=v2', '--branch']);
  if (status.code !== 0) {
    return { ok: false, note: 'Could not read git status.' };
  }
  const dirty = status.stdout
    .split('\n')
    .some((l) => l.length > 0 && !l.startsWith('#'));
  if (dirty && !opts.allowDirty) {
    return {
      ok: false,
      dirty: true,
      note: 'The working tree has uncommitted changes. Atelier never stashes — commit or set them aside, or explicitly proceed on the current tree.',
    };
  }

  // Refuse if the branch already exists (checkout -b would anyway, but
  // we want a clean message).
  const exists = await git(['-C', root, 'rev-parse', '--verify', '--quiet', `refs/heads/${name}`]);
  if (exists.code === 0) {
    return { ok: false, note: `Branch “${name}” already exists.` };
  }

  const created = await git(['-C', root, 'checkout', '-b', name]);
  if (created.code !== 0) {
    return { ok: false, note: created.stderr.trim() || 'git checkout failed.' };
  }
  return { ok: true, branch: name, note: `Created and switched to “${name}”.` };
}
