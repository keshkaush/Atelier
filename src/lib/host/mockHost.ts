/* ============================================================
   MockHost — the only HostBridge implementation in Milestone 1.

   It serves the canned sample projects from samples.ts. Every call
   resolves async (on a short delay) so callers are written against
   the real, asynchronous shape from day one — swapping in a local
   fs/git adapter later changes nothing above this seam.

   It never touches a real path and never writes anything.
   ============================================================ */

import type {
  BranchResult,
  DirListing,
  GitStatus,
  HostBridge,
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
    // Milestone 2 does the real thing. Here we only describe the intent
    // — never write. This keeps the "no mutation before approval"
    // principle literally true in the mock.
    return {
      ok: true,
      branch: name,
      note: `Dry run — the mock host does not create branches. Milestone 2 will run \`git checkout -b ${name}\` in ${resolve(root).listing.root}.`,
    };
  },
};
