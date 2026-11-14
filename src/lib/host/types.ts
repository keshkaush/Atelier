/* ============================================================
   Host bridge — the one seam between the UI and "the machine".

   A browser SPA cannot read a folder or run git. So every disk/git
   touchpoint goes through this interface. Today the only
   implementation is MockHost (canned sample projects). A real
   local adapter (Node companion / Tauri) implements the same
   surface later — and because analyze.ts consumes only a
   DirListing, the analysis engine runs unchanged against a real
   folder the day that adapter lands.
   ============================================================ */

/** One entry in a project's file tree. Paths are relative to the root. */
export interface DirEntry {
  name: string;
  /** Relative to the project root, POSIX separators. */
  path: string;
  kind: 'file' | 'dir';
  /** Lower-case extension including the dot, e.g. '.tsx'. Files only. */
  ext?: string;
  /** Bytes. Files only, best-effort. */
  size?: number;
}

export interface GitStatus {
  isRepo: boolean;
  branch?: string;
  /** Uncommitted changes present. */
  dirty: boolean;
  ahead?: number;
  behind?: number;
}

/** A flat listing of a project directory, already trimmed to a sane depth. */
export interface DirListing {
  /** Display name only — the mock never exposes a real absolute path. */
  root: string;
  entries: DirEntry[];
  /** True if the host capped the walk (very large repos). */
  truncated?: boolean;
}

export interface BranchResult {
  ok: boolean;
  branch?: string;
  /** Human-readable note, e.g. a dry-run explanation in mock mode. */
  note?: string;
}

/**
 * The single surface the workspace UI talks to.
 * Milestone 1 ships MockHost only. `createBranch` exists now so the
 * state machine and proposal decisions are shaped for Milestone 2;
 * the mock returns a dry-run note and never writes anything.
 */
export interface HostBridge {
  readonly kind: 'mock' | 'local';
  listProject(root: string): Promise<DirListing>;
  gitStatus(root: string): Promise<GitStatus>;
  createBranch(root: string, name: string): Promise<BranchResult>;
}
