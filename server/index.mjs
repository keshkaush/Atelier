#!/usr/bin/env node
/* ============================================================
   Atelier sidecar — a zero-dependency local host for the workspace.

   The browser SPA can't read folders or run git, so it talks to this
   tiny Node process over `fetch('/api/...')` (Vite proxies /api here).
   This is the real implementation behind the HostBridge seam; the mock
   stays for demos, this one touches the actual disk — carefully.

   Security posture (all non-negotiable):
     · binds 127.0.0.1 only — never a routable interface
     · requires a shared token header (printed on boot; Vite passes it)
     · only reads/runs git inside ATELIER_ROOTS (realpath allowlist)
     · every path is resolved + realpath'd, `..` escapes rejected
     · shells out to git via execFile with argument ARRAYS, never a shell
     · branch creation checks for a dirty tree and NEVER auto-stashes

   Start:
     ATELIER_ROOTS="/abs/path/to/project" node server/index.mjs
   Optional:
     ATELIER_PORT=5179  ATELIER_TOKEN=<fixed>  (else one is generated)
   ============================================================ */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { HttpError, badRequest, unauthorized, notFound } from './lib/errors.mjs';
import { loadAllowlist, resolveRoot, safeJoin } from './lib/allowlist.mjs';
import { walk } from './lib/walk.mjs';
import { git, isGitRepo, parseStatus } from './lib/git.mjs';
import { createBranch } from './lib/branch.mjs';
import { verify } from './lib/verify.mjs';

const HOST = '127.0.0.1';
const PORT = Number(process.env.ATELIER_PORT ?? 5179);
const TOKEN = process.env.ATELIER_TOKEN || randomBytes(24).toString('hex');
const MAX_BODY = 1 * 1024 * 1024; // 1 MB is plenty for our JSON bodies
const MAX_FILE_READ = 400 * 1024; // don't ship huge files to the diff view

const allowlist = loadAllowlist(process.env, (m) => console.warn(`[atelier] ${m}`));

/* ---------------------------------------------------------- */
/* helpers                                                     */
/* ---------------------------------------------------------- */

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(json),
    'cache-control': 'no-store',
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Request body too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(badRequest('Body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

/* ---------------------------------------------------------- */
/* route handlers                                              */
/* ---------------------------------------------------------- */

async function handleList(req, res, url) {
  const root = url.searchParams.get('root');
  const { real, name } = resolveRoot(root, allowlist);
  const { entries, truncated } = walk(real);
  send(res, 200, { root: name, entries, truncated });
}

async function handleRoots(req, res) {
  // The folders the user declared at boot. This is NOT an arbitrary folder
  // browser — it only ever returns what ATELIER_ROOTS allowlisted, so the
  // UI can offer them as attach candidates without widening access.
  const roots = allowlist.map((real) => ({
    path: real,
    name: path.basename(real) || real,
  }));
  send(res, 200, { roots });
}

async function handleGitStatus(req, res, url) {
  const root = url.searchParams.get('root');
  const { real } = resolveRoot(root, allowlist);
  if (!(await isGitRepo(real))) {
    return send(res, 200, { isRepo: false, dirty: false });
  }
  const r = await git(['-C', real, 'status', '--porcelain=v2', '--branch']);
  if (r.code !== 0) {
    return send(res, 200, { isRepo: true, dirty: false, branch: undefined });
  }
  send(res, 200, parseStatus(r.stdout, true));
}

async function handleBranch(req, res) {
  const body = await readBody(req);
  const { real } = resolveRoot(body.root, allowlist);
  if (typeof body.name !== 'string') throw badRequest('A branch name is required.');
  const result = await createBranch(real, body.name, { allowDirty: Boolean(body.allowDirty) });
  send(res, 200, result);
}

async function handleRead(req, res) {
  const body = await readBody(req);
  const { real } = resolveRoot(body.root, allowlist);
  if (typeof body.path !== 'string') throw badRequest('A file path is required.');
  const abs = safeJoin(real, body.path);
  let st;
  try {
    st = statSync(abs);
  } catch {
    return send(res, 200, { path: body.path, exists: false, content: '' });
  }
  if (!st.isFile()) throw badRequest('That path is not a file.');
  const tooBig = st.size > MAX_FILE_READ;
  const content = tooBig
    ? readFileSync(abs, 'utf8').slice(0, MAX_FILE_READ)
    : readFileSync(abs, 'utf8');
  send(res, 200, {
    path: body.path,
    exists: true,
    size: st.size,
    truncated: tooBig,
    content,
  });
}

async function handleVerify(req, res) {
  const body = await readBody(req);
  const { real } = resolveRoot(body.root, allowlist);
  const report = await verify(real, { timeoutMs: body.timeoutMs ?? 120_000 });
  send(res, 200, report);
}

const ROUTES = {
  'GET /api/list': handleList,
  'GET /api/roots': handleRoots,
  'GET /api/git-status': handleGitStatus,
  'POST /api/branch': handleBranch,
  'POST /api/read': handleRead,
  'POST /api/verify': handleVerify,
};

/* ---------------------------------------------------------- */
/* server                                                      */
/* ---------------------------------------------------------- */

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);

    // Health is unauthenticated so a client can probe liveness cheaply.
    if (url.pathname === '/api/health') {
      return send(res, 200, { ok: true, roots: allowlist.length });
    }

    if (!url.pathname.startsWith('/api/')) {
      throw notFound('Unknown endpoint.');
    }

    // Token gate — constant-ish comparison is overkill on loopback+token,
    // but keep it simple and total.
    const token = req.headers['x-atelier-token'];
    if (token !== TOKEN) throw unauthorized('Missing or invalid sidecar token.');

    const key = `${req.method} ${url.pathname}`;
    const handler = ROUTES[key];
    if (!handler) throw notFound(`No route for ${key}.`);

    await handler(req, res, url);
  } catch (err) {
    if (err instanceof HttpError) {
      if (!res.headersSent) send(res, err.status, { error: err.message });
      return;
    }
    console.error('[atelier] unhandled error:', err);
    if (!res.headersSent) send(res, 500, { error: 'Internal sidecar error.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[atelier] sidecar listening on http://${HOST}:${PORT}`);
  console.log(`[atelier] token: ${TOKEN}`);
  if (allowlist.length === 0) {
    console.warn(
      '[atelier] WARNING: no ATELIER_ROOTS set — every path will be refused. ' +
        'Start with ATELIER_ROOTS="/path/to/your/project".',
    );
  } else {
    console.log(`[atelier] allowlisted roots (${allowlist.length}):`);
    for (const r of allowlist) console.log(`  · ${r}`);
  }
});

// Graceful shutdown so Vite restarts don't leave the port bound.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  });
}

export { server };
