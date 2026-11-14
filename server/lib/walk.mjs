/* ============================================================
   Bounded directory walk → DirListing.

   Produces the same shape MockHost/SAMPLE_PROJECTS hand us, but from a
   real tree. Two hard caps keep this cheap on a huge repo:
     · depth  — do not descend past MAX_DEPTH segments
     · total  — stop after MAX_ENTRIES entries, set truncated

   It deliberately does NOT apply the analysis ignore rules — analyze.ts
   owns those, and surfacing the noise (node_modules, dist, .env) is the
   point of the Analyze stage. It only skips DESCENDING into the two
   directories that would blow the budget instantly (node_modules/.git);
   their top-level entries are still listed so the tally is honest.
   ============================================================ */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const MAX_DEPTH = 6;
export const MAX_ENTRIES = 5000;

/** Descend into these but don't recurse (keeps the walk cheap). */
const NO_DESCEND = new Set(['node_modules', '.git']);

/** Lower-case extension including the dot, files only. */
function extOf(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : undefined;
}

/**
 * Walk `rootReal`, returning { entries, truncated }. `entries` are sorted
 * by path with directories interleaved, POSIX separators, paths relative
 * to the root — exactly what analyze.ts expects.
 */
export function walk(rootReal, opts = {}) {
  const maxDepth = opts.maxDepth ?? MAX_DEPTH;
  const maxEntries = opts.maxEntries ?? MAX_ENTRIES;
  const entries = [];
  let truncated = false;

  // Iterative BFS-ish DFS so deep trees can't blow the stack.
  const stack = [{ abs: rootReal, rel: '', depth: 0 }];

  while (stack.length) {
    if (entries.length >= maxEntries) {
      truncated = true;
      break;
    }
    const { abs, rel, depth } = stack.pop();

    let dirents;
    try {
      dirents = readdirSync(abs, { withFileTypes: true });
    } catch {
      continue; // unreadable dir — skip quietly
    }

    // Stable, readable order: directories first, then by name.
    dirents.sort((a, b) => {
      const ad = a.isDirectory() ? 0 : 1;
      const bd = b.isDirectory() ? 0 : 1;
      return ad - bd || a.name.localeCompare(b.name);
    });

    // Push children (so DFS visits in the sorted order above after we
    // have recorded the current level's entries) — we record entries
    // now and descend in reverse so the sort reads naturally.
    const toDescend = [];
    for (const d of dirents) {
      if (entries.length >= maxEntries) {
        truncated = true;
        break;
      }
      const childRel = rel ? `${rel}/${d.name}` : d.name;
      const isDir = d.isDirectory();
      let size;
      if (!isDir) {
        try {
          size = statSync(path.join(abs, d.name)).size;
        } catch {
          size = undefined;
        }
      }
      entries.push({
        name: d.name,
        path: childRel,
        kind: isDir ? 'dir' : 'file',
        ...(isDir ? {} : { ext: extOf(d.name) }),
        ...(size != null ? { size } : {}),
      });
      const canDescend =
        isDir && depth + 1 <= maxDepth && !NO_DESCEND.has(d.name);
      if (canDescend) toDescend.push({ abs: path.join(abs, d.name), rel: childRel, depth: depth + 1 });
    }

    // Reverse so the LIFO stack pops them in sorted order.
    for (let i = toDescend.length - 1; i >= 0; i--) stack.push(toDescend[i]);
  }

  return { entries, truncated };
}
