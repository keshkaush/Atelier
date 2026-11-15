/* ============================================================
   The active host.

   Two implementations behind one seam:
     · mockHost  — canned sample projects, zero disk/git. The default,
                   so the app demos offline with no sidecar.
     · localHost — the real Node sidecar behind /api (VITE_HOST=local).
                   Reads the actual folder, runs real git, real QA.

   Selection is by `VITE_HOST=local`. If `local` is requested but the
   sidecar isn't reachable at boot, we fall back to the mock so the app
   always opens — the user can start the sidecar and reload to get the
   real host. Nothing above this line changes between the two.
   ============================================================ */

import type { HostBridge } from './types';
import { mockHost } from './mockHost';
import { localHost } from './localHost';

const requested = (import.meta.env?.VITE_HOST ?? '').toLowerCase();

/** Synchronous pick. `local` only takes effect once its health probe
    succeeds — see `resolveHost()` below for the async confirm. */
export let host: HostBridge = requested === 'local' ? localHost : mockHost;

/**
 * Confirm the chosen host is actually usable, falling back to the mock
 * (with a console note) if a local sidecar isn't reachable. Called once
 * at app boot; returns the host to use.
 */
export async function resolveHost(): Promise<HostBridge> {
  if (host.kind !== 'local') return host;
  try {
    const res = await fetch('/api/health');
    if (res.ok) return host;
  } catch {
    /* fall through to mock */
  }
  console.warn(
    '[atelier] VITE_HOST=local but the sidecar is not reachable — falling back to the mock host. Start it with `npm run host` and reload for the real host.',
  );
  host = mockHost;
  return host;
}

export * from './types';
export { SAMPLE_PROJECTS, sampleById } from './samples';
export type { SampleProject } from './samples';
