/* ============================================================
   Git runner — the ONLY place the sidecar shells out to git.

   Uses execFile with an argument array (never a shell string), so a
   crafted branch name or path can never become a second command.
   Every call is rooted with `-C <root>` where <root> is already a
   canonical realpath validated against the allowlist.
   ============================================================ */

import { execFile } from 'node:child_process';

const GIT = 'git';

/** Run git; resolves with { code, stdout, stderr }. Never rejects on a
    non-zero exit — the caller decides what a failure means. */
export function git(args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      GIT,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout ?? 15_000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (err, stdout, stderr) => {
        const code = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });
}

/** True when `root` is inside a git work tree. */
export async function isGitRepo(root) {
  const r = await git(['-C', root, 'rev-parse', '--is-inside-work-tree']);
  return r.code === 0 && r.stdout.trim() === 'true';
}

/**
 * Parse `git status --porcelain=v2 --branch` into a GitStatus.
 * Branch headers (`# branch.head`, `# branch.ab`) carry the branch and
 * ahead/behind; any line not starting with `#` is an uncommitted change.
 */
export function parseStatus(text, isRepo) {
  const out = { isRepo, dirty: false, branch: undefined, ahead: undefined, behind: undefined };
  for (const line of text.split('\n')) {
    if (!line) continue;
    if (line.startsWith('# ')) {
      const rest = line.slice(2);
      if (rest.startsWith('branch.head ')) {
        const head = rest.slice('branch.head '.length).trim();
        out.branch = head === '(detached)' ? undefined : head;
      } else if (rest.startsWith('branch.ab ')) {
        // "# branch.ab +2 -1"
        const m = rest.match(/\+(\d+)\s+-(\d+)/);
        if (m) {
          out.ahead = Number(m[1]);
          out.behind = Number(m[2]);
        }
      }
    } else {
      // Any record line (1/2/u/?/!) means the tree is dirty.
      out.dirty = true;
    }
  }
  return out;
}
