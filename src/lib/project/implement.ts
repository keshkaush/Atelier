/* ============================================================
   Implementation generator — deterministic dry-run diffs.

   This is the "implementation" step the milestone is emphatic about:
   generate a PROPOSED change, show it for review, never write. It is
   deliberately scripted (offline, like decompose/proposal), but the
   `model.ts` seam is left wired conceptually: swap `proposedEditFor`
   for a model call and the rest of the pipeline (diff rendering,
   review UI, QA) is unchanged.

   What it does: for each file a workstream touches, read the real
   current contents through the host, then synthesise a small, honest,
   legible change grounded in the workstream's mandate — e.g. ops adds a
   decision-log header, content leaves a marked TODO where copy goes,
   ui appends a token-aware comment block. It never invents a wholesale
   rewrite it can't justify; the diffs read like a plan, which is the
   point at review time.
   ============================================================ */

import type { Workstream } from './decompose';
import type { DeskId } from '../studio';
import type { HostBridge, FileEdit } from '../host/types';
import { diffFiles, diffNewFile, type FileDiff } from './diff';

/** How many files we'll read + diff. Keeps the review stage to a screen. */
const MAX_FILES = 8;

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
  // Collect touched files with the desk most responsible for each.
  // First desk to name a path owns its edit (deterministic order).
  const owners = new Map<string, DeskId>();
  for (const w of workstreams) {
    for (const p of w.touches) {
      if (!owners.has(p)) owners.set(p, w.desk);
    }
  }

  const paths = Array.from(owners.keys()).slice(0, MAX_FILES);
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
