/* ============================================================
   LocalHost — the real HostBridge, backed by the Node sidecar.

   Every method is a thin `fetch('/api/...')` against the sidecar the
   Vite dev server proxies to 127.0.0.1:5179. The browser never holds
   the sidecar token — Vite injects it on the proxy hop — and the SPA
   only ever names allowlisted roots. So this file sets no secrets and
   carries no path logic: the security lives in server/.

   Selected when VITE_HOST=local (see index.ts). If the sidecar isn't
   running, calls reject with a clear message and the app falls back to
   MockHost, so a demo never hard-breaks.
   ============================================================ */

import type {
  BranchResult,
  DirListing,
  FileContent,
  GitStatus,
  HostBridge,
  VerifyReport,
} from './types';

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error(
      'The local host sidecar is not reachable. Start it with `npm run host` (or the provided script) and reload.',
    );
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = body.error;
    } catch {
      /* keep the status-only message */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

const q = (root: string) => `root=${encodeURIComponent(root)}`;

export const localHost: HostBridge = {
  kind: 'local',

  listProject(root: string): Promise<DirListing> {
    return getJson<DirListing>(`/api/list?${q(root)}`);
  },

  gitStatus(root: string): Promise<GitStatus> {
    return getJson<GitStatus>(`/api/git-status?${q(root)}`);
  },

  createBranch(root: string, name: string): Promise<BranchResult> {
    return getJson<BranchResult>('/api/branch', {
      method: 'POST',
      body: JSON.stringify({ root, name }),
    });
  },

  readFile(root: string, path: string): Promise<FileContent> {
    return getJson<FileContent>('/api/read', {
      method: 'POST',
      body: JSON.stringify({ root, path }),
    });
  },

  verify(root: string): Promise<VerifyReport> {
    return getJson<VerifyReport>('/api/verify', {
      method: 'POST',
      body: JSON.stringify({ root }),
    });
  },
};
