/* ============================================================
   Dry-run diffs — the shape the review stage renders, and the
   diff engine that produces it.

   Milestone 2 NEVER writes. The implementation stage reads the real
   files it plans to touch (through the host), synthesises a proposed
   change deterministically, and hands back a per-file old→new diff for
   review. "Applying" happens only by a human in their editor; this
   module is honest about that.

   The engine is a plain line LCS → unified hunks. No dependencies.
   ============================================================ */

export type DiffLineKind = 'context' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** 1-based line number in the old file (context + del). */
  oldNo?: number;
  /** 1-based line number in the new file (context + add). */
  newNo?: number;
}

export interface DiffHunk {
  /** The @@ header, e.g. "@@ -1,3 +1,4 @@". */
  header: string;
  lines: DiffLine[];
}

/** How a proposed change relates to what's on disk. */
export type FileDiffStatus =
  | 'modified' // file exists and the proposal changes some lines
  | 'added' // file named by the proposal doesn't exist yet
  | 'unchanged'; // file exists but the plan leaves it as-is (shown for transparency)

export interface FileDiff {
  path: string;
  status: FileDiffStatus;
  hunks: DiffHunk[];
  adds: number;
  dels: number;
  /** Human note, e.g. "new file — proposed scaffold" or "no change proposed". */
  note?: string;
}

/* ---------------------------------------------------------- */
/* Line LCS                                                    */
/* ---------------------------------------------------------- */

/** Classic dynamic-programming LCS over two line arrays. Returns the
    edit script as a flat list of {kind,text} with no grouping. O(n·m),
    which is fine for source files (and we cap inputs upstream). */
function lcsScript(
  oldLines: string[],
  newLines: string[],
): { kind: DiffLineKind; text: string }[] {
  const n = oldLines.length;
  const m = newLines.length;
  // dp[i][j] = LCS length of oldLines[i:] and newLines[j:]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        oldLines[i] === newLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { kind: DiffLineKind; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push({ kind: 'context', text: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'del', text: oldLines[i] });
      i++;
    } else {
      out.push({ kind: 'add', text: newLines[j] });
      j++;
    }
  }
  while (i < n) out.push({ kind: 'del', text: oldLines[i++] });
  while (j < m) out.push({ kind: 'add', text: newLines[j++] });
  return out;
}

const CONTEXT = 3;

/** Turn a flat edit script into unified hunks with @@ headers. */
function toHunks(
  script: { kind: DiffLineKind; text: string }[],
): DiffHunk[] {
  // Index of every line that is not pure context → cluster around them.
  const changed = script
    .map((l, idx) => (l.kind === 'context' ? -1 : idx))
    .filter((idx) => idx >= 0);
  if (changed.length === 0) return [];

  const ranges: [number, number][] = [];
  for (const idx of changed) {
    const start = Math.max(0, idx - CONTEXT);
    const end = Math.min(script.length, idx + CONTEXT + 1);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }

  const hunks: DiffHunk[] = [];
  // Track running old/new line numbers across the whole script.
  let oldNo = 1;
  let newNo = 1;
  const lineNos: { oldNo?: number; newNo?: number }[] = script.map((l) => {
    if (l.kind === 'context') {
      const r = { oldNo, newNo };
      oldNo++;
      newNo++;
      return r;
    }
    if (l.kind === 'del') {
      const r = { oldNo };
      oldNo++;
      return r;
    }
    const r = { newNo };
    newNo++;
    return r;
  });

  for (const [start, end] of ranges) {
    const lines: DiffLine[] = [];
    let oldCount = 0;
    let newCount = 0;
    for (let k = start; k < end; k++) {
      const l = script[k];
      lines.push({ kind: l.kind, text: l.text, ...lineNos[k] });
      if (l.kind !== 'add') oldCount++;
      if (l.kind !== 'del') newCount++;
    }
    const oldStart = lines.find((l) => l.oldNo != null)?.oldNo ?? 1;
    const newStart = lines.find((l) => l.newNo != null)?.newNo ?? 1;
    hunks.push({
      header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
      lines,
    });
  }
  return hunks;
}

/** Build a FileDiff from old + new full file text. */
export function diffFiles(path: string, oldText: string, newText: string): FileDiff {
  const oldLines = oldText.length ? oldText.replace(/\n$/, '').split('\n') : [];
  const newLines = newText.length ? newText.replace(/\n$/, '').split('\n') : [];
  const script = lcsScript(oldLines, newLines);
  const adds = script.filter((l) => l.kind === 'add').length;
  const dels = script.filter((l) => l.kind === 'del').length;
  return {
    path,
    status: adds || dels ? 'modified' : 'unchanged',
    hunks: toHunks(script),
    adds,
    dels,
    note: adds || dels ? undefined : 'No change proposed — matches the current file.',
  };
}

/** Build a FileDiff for a file the proposal would create from scratch. */
export function diffNewFile(path: string, newText: string, note?: string): FileDiff {
  const newLines = newText.length ? newText.replace(/\n$/, '').split('\n') : [];
  const lines: DiffLine[] = newLines.map((text, idx) => ({
    kind: 'add',
    text,
    newNo: idx + 1,
  }));
  return {
    path,
    status: 'added',
    hunks: lines.length
      ? [{ header: `@@ -0,0 +1,${lines.length} @@`, lines }]
      : [],
    adds: lines.length,
    dels: 0,
    note: note ?? 'New file — proposed scaffold.',
  };
}
