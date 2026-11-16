/* ============================================================
   Implementation generator — deterministic dry-run diffs.

   This is the "implementation" step the milestone is emphatic about:
   generate a PROPOSED change, show it for review, never write.

   Two generators live here:

   · `generateImplementation` — deterministic. For each file a workstream
     touches, read the real current contents through the host, then
     synthesise a small, honest, legible change grounded in the
     workstream's mandate (ops adds a decision-log header, content leaves
     a marked TODO, ui appends a token note). This is the fallback: it
     runs when no model is configured or the model call fails.

   · `generateImplementationWithModel` — asks the model to write the real
     change. The safety invariant is that the MODEL NEVER CHOOSES A PATH:
     candidates come from `candidateOwners` here, every returned path is
     filtered against that set, and diffs are re-derived locally from the
     full text the model supplies. Hunks are never trusted.

   Either way, nothing is written — the apply gate owns that.
   ============================================================ */

import type { Workstream } from './decompose';
import type { DeskId } from '../studio';
import type { HostBridge, FileEdit } from '../host/types';
import { diffFiles, diffNewFile, type FileDiff } from './diff';
import { ignoreReason } from './analyze';
import { complete, type ModelConfig } from '../model';
import { isRecord, parseJsonReply, str } from './modelJson';

/** How many files we'll read + diff. Keeps the review stage to a screen. */
const MAX_FILES = 12;

/** Per-file ceiling for a model-supplied replacement (mirrors the apply cap). */
const MAX_EDIT_BYTES = 400 * 1024;

/**
 * Total prompt budget for the files we send a model. Per-file reads can be
 * up to MAX_EDIT_BYTES each, so without this twelve large files would mean
 * a multi-megabyte request that no model accepts. Files are read in plan
 * order and the overflow is reported in `skipped`, never silently dropped.
 */
const MAX_PROMPT_BYTES = 96 * 1024;

/** Rough byte cost of a string in a prompt (content is UTF-8 on the wire). */
const bytesOf = (s: string): number => new TextEncoder().encode(s).length;

function stamp(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Comment syntax for a path, so generated notes stay legal in that file. */
function commentFor(path: string): (s: string) => string {
  if (/\.(css|scss|less)$/.test(path)) return (s) => `/* ${s} */`;
  if (/\.(html?)$/.test(path)) return (s) => `<!-- ${s} -->`;
  if (/\.(md|txt)$/.test(path)) return (s) => s;
  // js/ts/tsx/jsx default
  return (s) => `// ${s}`;
}

/**
 * The deterministic "edit" for one file, given the desk that's acting
 * on it. Returns the new full text. Real files are only ever *read*.
 */
function proposedEditFor(
  desk: DeskId,
  file: string,
  original: string,
  brief: string,
  now: Date,
): { text: string; note: string } {
  const c = commentFor(file);
  const briefLine = brief.trim().replace(/\s+/g, ' ').slice(0, 100);

  switch (desk) {
    case 'ops': {
      // Prepend a decision-log header (idempotent: skip if already there).
      const marker = c('Atelier change log');
      if (original.includes(marker)) {
        return { text: original, note: 'Decision log already present — no change.' };
      }
      const header =
        `${marker}\n` +
        `${c(`Brief: ${briefLine || '(no brief)'}`)}\n` +
        `${c(`Prepared: ${stamp(now)} — proposed by Atelier, not applied`)}\n\n`;
      return { text: header + original, note: 'Adds a decision-log header above the file.' };
    }
    case 'content': {
      // Append a clearly-marked copy TODO block (never fake real strings).
      const marker = c('ATELIER COPY TODO');
      if (original.includes(marker)) {
        return { text: original, note: 'Copy marker already present — no change.' };
      }
      const block =
        `\n\n${marker}\n` +
        `${c(`Write the interface strings for: ${briefLine || 'this change'}.`)}\n` +
        `${c('Keep terminology consistent with the rest of the product.')}\n`;
      return { text: original + block, note: 'Appends a marked copy-TODO block.' };
    }
    case 'ui': {
      const marker = c('ATELIER UI NOTE');
      if (original.includes(marker)) {
        return { text: original, note: 'UI note already present — no change.' };
      }
      const block =
        `\n\n${marker}\n` +
        `${c('Map this change onto the existing token scale; avoid hard-coded values.')}\n` +
        `${c('Specify hover / focus / disabled states for anything interactive.')}\n`;
      return { text: original + block, note: 'Appends a token-aware UI note.' };
    }
    case 'ux': {
      const marker = c('ATELIER UX NOTE');
      if (original.includes(marker)) {
        return { text: original, note: 'UX note already present — no change.' };
      }
      const block =
        `\n\n${marker}\n` +
        `${c('Structure / flow change expected here — see the proposal for the intended states.')}\n`;
      return { text: original + block, note: 'Appends a structure note.' };
    }
    default:
      return { text: original, note: 'No file-level change from this desk.' };
  }
}

export interface ImplementationPlan {
  diffs: FileDiff[];
  /** Complete write payloads for changed files; never derived from hunks. */
  edits: FileEdit[];
  /** Files we wanted to diff but couldn't read (missing/too big). */
  skipped: { path: string; reason: string }[];
  totals: { files: number; adds: number; dels: number };
  generatedAt: number;
}

/**
 * The files this plan may touch, with the desk that owns each.
 *
 * This is the ONLY place paths are chosen, and it is deliberately local:
 * the model is never asked which files to change, only what to write in
 * the files already chosen here. Ignored paths (dependencies, build
 * output, secrets) are dropped even if a workstream named one.
 */
export function candidateOwners(workstreams: Workstream[]): Map<string, DeskId> {
  const owners = new Map<string, DeskId>();
  for (const w of workstreams) {
    for (const p of w.touches) {
      if (owners.has(p)) continue;
      if (ignoreReason({ name: p.split('/').pop() ?? p, path: p, kind: 'file' })) continue;
      owners.set(p, w.desk);
    }
  }
  return new Map(Array.from(owners).slice(0, MAX_FILES));
}

/**
 * Generate the dry-run diff set for a proposal's workstreams.
 * Reads real files via the host; produces old→new diffs; writes nothing.
 */
export async function generateImplementation(
  host: HostBridge,
  root: string,
  brief: string,
  workstreams: Workstream[],
  now: Date = new Date(),
): Promise<ImplementationPlan> {
  const owners = candidateOwners(workstreams);
  const paths = Array.from(owners.keys());
  const skipped: { path: string; reason: string }[] = [];
  const diffs: FileDiff[] = [];
  const edits: FileEdit[] = [];

  for (const path of paths) {
    const desk = owners.get(path)!;
    let content: string;
    try {
      const file = await host.readFile(root, path);
      if (!file.exists) {
        // Named by the plan but absent — propose a small new-file scaffold.
        const c = commentFor(path);
        const scaffold =
          `${c(`Proposed new file for: ${brief.trim().slice(0, 80) || 'the change'}`)}\n` +
          `${c('Created by Atelier as a dry-run proposal — not written to disk.')}\n`;
        diffs.push(diffNewFile(path, scaffold));
        edits.push({ path, original: null, content: scaffold });
        continue;
      }
      if (file.truncated) {
        skipped.push({ path, reason: 'File too large to diff safely.' });
        continue;
      }
      content = file.content;
    } catch (e) {
      skipped.push({
        path,
        reason: e instanceof Error ? e.message : 'Could not read file.',
      });
      continue;
    }

    const { text, note } = proposedEditFor(desk, path, content, brief, now);
    const d = diffFiles(path, content, text);
    d.note = d.status === 'unchanged' ? note : `${desk.toUpperCase()} · ${note}`;
    diffs.push(d);
    if (d.status === 'modified') edits.push({ path, original: content, content: text });
  }

  const totals = {
    files: diffs.filter((d) => d.status !== 'unchanged').length,
    adds: diffs.reduce((n, d) => n + d.adds, 0),
    dels: diffs.reduce((n, d) => n + d.dels, 0),
  };

  return { diffs, edits, skipped, totals, generatedAt: now.getTime() };
}

/* ----------------------------------------------------------------
   Model-backed implementation.

   The safety invariant, in one sentence: the model never chooses a
   path. Candidates are computed here with `candidateOwners` (ignored
   paths already dropped, capped at MAX_FILES), the model is handed
   their current contents, and any path it returns that is not in that
   set is discarded and recorded. Diffs are re-derived locally from the
   full text the model supplies — hunks are never trusted or parsed.
   ---------------------------------------------------------------- */

interface ModelEdit {
  path: string;
  content: string;
  note?: string;
}

function validateEdits(v: unknown, allowed: Set<string>): ModelEdit[] {
  if (!isRecord(v) || !Array.isArray(v.edits)) {
    throw new Error('Expected { "edits": [...] }.');
  }
  const out: ModelEdit[] = [];
  for (const raw of v.edits) {
    if (!isRecord(raw)) continue;
    const path = str(raw.path, 300);
    if (!path || !allowed.has(path)) continue; // never trust a path we didn't offer
    if (typeof raw.content !== 'string') continue;
    if (bytesOf(raw.content) > MAX_EDIT_BYTES) continue;
    out.push({ path, content: raw.content, note: str(raw.note, 200) ?? undefined });
  }
  if (out.length === 0) throw new Error('The model proposed no usable edits.');
  return out;
}

/**
 * Ask the model to write the actual change for the files already in
 * scope. Throws on an unusable reply; the caller falls back to
 * `generateImplementation()`.
 */
export async function generateImplementationWithModel(
  cfg: ModelConfig,
  host: HostBridge,
  root: string,
  brief: string,
  workstreams: Workstream[],
  now: Date = new Date(),
  signal?: AbortSignal,
): Promise<ImplementationPlan> {
  const owners = candidateOwners(workstreams);
  const skipped: { path: string; reason: string }[] = [];

  // Read the candidates first — the model needs the real current text.
  const files: { path: string; desk: DeskId; content: string }[] = [];
  let budget = MAX_PROMPT_BYTES;
  for (const [path, desk] of owners) {
    try {
      const file = await host.readFile(root, path);
      if (!file.exists) {
        skipped.push({ path, reason: 'File no longer exists — skipped.' });
        continue;
      }
      if (file.truncated) {
        skipped.push({ path, reason: 'File too large to diff safely.' });
        continue;
      }
      const cost = bytesOf(file.content);
      if (cost > budget) {
        // Reading it and then trimming would produce a broken "complete
        // file" for the model to rewrite, so this file is out of scope.
        skipped.push({
          path,
          reason: `Over the ${Math.round(MAX_PROMPT_BYTES / 1024)} KB prompt budget for this run.`,
        });
        continue;
      }
      budget -= cost;
      files.push({ path, desk, content: file.content });
    } catch (e) {
      skipped.push({
        path,
        reason: e instanceof Error ? e.message : 'Could not read file.',
      });
    }
  }
  if (files.length === 0) throw new Error('No readable files in scope.');

  const allowed = new Set(files.map((f) => f.path));

  const system = [
    'You are the implementation desk of a design studio. You are given a',
    'brief and the current contents of the files in scope. Write the change.',
    'Reply with JSON only:',
    '{ "edits": [ { "path": "exactly one of the supplied paths",',
    '  "content": "the COMPLETE new file text", "note": "one line on what changed" } ] }',
    '',
    'Rules:',
    '- `path` MUST be one of the supplied paths. Never invent or rename a file.',
    '- `content` is the whole file, not a patch or a fragment.',
    '- Make a real, specific change that serves the brief. Do not append generic',
    '  TODO comments or boilerplate notes.',
    '- Preserve the file’s existing style, imports and conventions.',
    '- Omit a file entirely if the brief does not require changing it.',
  ].join('\n');

  const user = [
    `BRIEF:\n${brief.trim()}`,
    '',
    'WORKSTREAMS:',
    ...workstreams.map((w) => `- ${w.desk}: ${w.title} — ${w.scope}`),
    '',
    'FILES IN SCOPE:',
    ...files.map(
      (f) =>
        `\n=== ${f.path} (owner: ${f.desk}) ===\n${f.content}`,
    ),
  ].join('\n');

  const reply = await complete(
    cfg,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.2, signal },
  );

  const proposed = parseJsonReply(reply, (v) => validateEdits(v, allowed));

  const diffs: FileDiff[] = [];
  const edits: FileEdit[] = [];
  const byPath = new Map(files.map((f) => [f.path, f]));

  for (const p of proposed) {
    const file = byPath.get(p.path)!;
    const d = diffFiles(p.path, file.content, p.content);
    const desk = owners.get(p.path) ?? 'ops';
    d.note =
      d.status === 'unchanged'
        ? p.note ?? 'No change proposed.'
        : `${desk.toUpperCase()} · ${p.note ?? 'Implements the brief.'}`;
    diffs.push(d);
    if (d.status === 'modified') {
      edits.push({ path: p.path, original: file.content, content: p.content });
    }
  }

  // Files the model left alone are still reported, so review shows the
  // full scope rather than only what changed.
  for (const f of files) {
    if (proposed.some((p) => p.path === f.path)) continue;
    const d = diffFiles(f.path, f.content, f.content);
    d.note = `${f.desk.toUpperCase()} · No change proposed for this file.`;
    diffs.push(d);
  }

  const totals = {
    files: diffs.filter((d) => d.status !== 'unchanged').length,
    adds: diffs.reduce((n, d) => n + d.adds, 0),
    dels: diffs.reduce((n, d) => n + d.dels, 0),
  };

  return { diffs, edits, skipped, totals, generatedAt: now.getTime() };
}
