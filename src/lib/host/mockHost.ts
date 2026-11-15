/* ============================================================
   MockHost — the only HostBridge implementation in Milestone 1.

   It serves the canned sample projects from samples.ts. Every call
   resolves async (on a short delay) so callers are written against
   the real, asynchronous shape from day one — swapping in a local
   fs/git adapter later changes nothing above this seam.

   It never touches a real path and never writes anything.
   ============================================================ */

import type {
  ApplyResult,
  BranchResult,
  DirListing,
  FileContent,
  FileEdit,
  GitStatus,
  HostBridge,
  RootCandidate,
  VerifyReport,
} from './types';
import { sampleById, SAMPLE_PROJECTS } from './samples';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve a sample by id. The workspace passes the sample id as the
 * "root" (there is no real path in mock mode). Falls back to the
 * first sample so a stray id never hard-fails the demo.
 */
function resolve(root: string) {
  return sampleById(root) ?? SAMPLE_PROJECTS[0];
}

export const mockHost: HostBridge = {
  kind: 'mock',

  async listRoots(): Promise<RootCandidate[]> {
    await delay(120);
    // In mock mode the "roots" are the canned sample ids.
    return SAMPLE_PROJECTS.map((p) => ({ path: p.id, name: p.label }));
  },

  async listProject(root: string): Promise<DirListing> {
    await delay(420);
    const { listing } = resolve(root);
    // Return a copy so callers can't mutate the module-level sample.
    return {
      root: listing.root,
      truncated: listing.truncated,
      entries: listing.entries.map((e) => ({ ...e })),
    };
  },

  async gitStatus(root: string): Promise<GitStatus> {
    await delay(180);
    return { ...resolve(root).git };
  },

  async createBranch(root: string, name: string): Promise<BranchResult> {
    await delay(120);
    // The mock never writes. It describes the intent so the UI flow is
    // exercisable without a sidecar — the "no mutation" principle stays
    // literally true here.
    return {
      ok: true,
      branch: name,
      note: `Dry run — the mock host does not create branches. The local host would run \`git checkout -b ${name}\` in ${resolve(root).listing.root}.`,
    };
  },

  async readFile(root: string, filePath: string): Promise<FileContent> {
    await delay(60);
    // No real bytes in mock mode — synthesise a small, honest stub so the
    // diff view has an "old" side to render against, labelled as such.
    const base = filePath.split('/').pop() ?? filePath;
    const stub = `/* ${base} — mock contents of ${resolve(root).listing.root}/${filePath} (no real file read) */\n`;
    return { path: filePath, exists: true, content: stub, size: stub.length };
  },

  async applyEdits(_root: string, edits: FileEdit[]): Promise<ApplyResult> {
    await delay(300);
    // The mock never writes. Say so plainly — the UI must not present this
    // as a real application of changes.
    return {
      status: 'simulated',
      applied: [],
      issues: [],
      note: `Dry run — the mock host did not write ${edits.length} file${edits.length === 1 ? '' : 's'}. Start the local sidecar to apply changes to disk.`,
    };
  },

  async verify(root: string): Promise<VerifyReport> {
    await delay(900);
    // A canned, all-green report so the QA stage is walkable offline.
    const pass = { status: 'pass' as const, elapsedMs: 420, exitCode: 0, output: '' };
    return {
      ranAt: Date.now(),
      isNodeProject: true,
      packageManager: 'npm',
      packageName: resolve(root).listing.root,
      steps: {
        typecheck: { ...pass, output: 'tsc -b — 0 errors (simulated)' },
        lint: { status: 'skipped', note: 'No lint script (mock).' },
        test: { ...pass, output: 'tests passed (simulated)' },
      },
    };
  },
};
