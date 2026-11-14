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
  /** Set when the tree was dirty and the caller didn't opt in. */
  dirty?: boolean;
  /** Human-readable note, e.g. a dry-run explanation in mock mode. */
  note?: string;
}

/** Contents of one file, read read-only through the host for the diff view. */
export interface FileContent {
  path: string;
  exists: boolean;
  content: string;
  size?: number;
  /** True if the host clipped a very large file. */
  truncated?: boolean;
}

/** Outcome of one verification step (typecheck / lint / test). */
export type StepStatus = 'pass' | 'fail' | 'skipped' | 'unavailable' | 'error';

export interface VerifyStep {
  status: StepStatus;
  note?: string;
  /** Tail of the command output (bounded by the host). */
  output?: string;
  elapsedMs?: number;
  exitCode?: number;
}

/** The QA stage's structured report. */
export interface VerifyReport {
  ranAt: number;
  isNodeProject: boolean;
  packageManager: string | null;
  packageName?: string;
  steps: { typecheck: VerifyStep; lint: VerifyStep; test: VerifyStep };
}

/**
 * The single surface the workspace UI talks to.
 *
 * Milestone 1 shipped MockHost only. Milestone 2 adds LocalHost (a Node
 * sidecar behind `/api`). Both implement the same surface, so analysis,
 * diff-shaping and QA run unchanged against either. `createBranch`
 * mutates disk — it is ONLY called after the user's explicit confirm in
 * the branch-prep stage; nothing else here writes.
 */
export interface HostBridge {
  readonly kind: 'mock' | 'local';
  listProject(root: string): Promise<DirListing>;
  gitStatus(root: string): Promise<GitStatus>;
  createBranch(root: string, name: string): Promise<BranchResult>;
  /** Read one file read-only (for the dry-run diff). Never writes. */
  readFile(root: string, path: string): Promise<FileContent>;
  /** Run the target project's typecheck/lint/test. Never writes. */
  verify(root: string): Promise<VerifyReport>;
}
