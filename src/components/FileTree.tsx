import { useMemo } from 'react';
import type { DirEntry } from '../lib/host/types';
import { ignoreReason } from '../lib/project/analyze';

interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'dir';
  ext?: string;
  ignored: boolean;
  children: TreeNode[];
}

function build(entries: DirEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', kind: 'dir', ignored: false, children: [] };
  const dirMap = new Map<string, TreeNode>([['', root]]);

  // Sort so dirs precede files, then alphabetical — a stable, readable tree.
  const sorted = [...entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const e of sorted) {
    const parentPath = e.path.includes('/') ? e.path.slice(0, e.path.lastIndexOf('/')) : '';
    const parent = dirMap.get(parentPath);
    if (!parent) continue; // parent dir wasn't listed; skip orphan
    const node: TreeNode = {
      name: e.name,
      path: e.path,
      kind: e.kind,
      ext: e.ext,
      ignored: ignoreReason(e) !== null,
      children: [],
    };
    parent.children.push(node);
    if (e.kind === 'dir') dirMap.set(e.path, node);
  }
  return root.children;
}

/** Depth-first render. Ignored nodes are dimmed, not hidden — the point
    is to *show* what the studio refuses to crawl. */
function Row({ node, depth }: { node: TreeNode; depth: number }) {
  const pad = { paddingLeft: `${depth * 0.9 + 0.15}rem` };
  if (node.kind === 'dir') {
    return (
      <div className="ft__group">
        <div className={`ft__row ft__row--dir ${node.ignored ? 'is-ignored' : ''}`} style={pad}>
          <span className="ft__glyph" aria-hidden>
            ▸
          </span>
          <span className="ft__name">{node.name}</span>
        </div>
        {node.children.map((c) => (
          <Row key={c.path} node={c} depth={depth + 1} />
        ))}
      </div>
    );
  }
  return (
    <div className={`ft__row ${node.ignored ? 'is-ignored' : ''}`} style={pad}>
      <span className="ft__glyph ft__glyph--file" aria-hidden>
        ·
      </span>
      <span className="ft__name">{node.name}</span>
      {node.ignored && <span className="ft__tag">ignored</span>}
    </div>
  );
}

export function FileTree({ entries, max = 40 }: { entries: DirEntry[]; max?: number }) {
  const tree = useMemo(() => build(entries), [entries]);
  const shown = useMemo(() => countShown(tree, max), [tree, max]);

  return (
    <div className="ft" role="tree" aria-label="Project files">
      {shown.nodes.map((n) => (
        <Row key={n.path} node={n} depth={0} />
      ))}
      {shown.hidden > 0 && (
        <div className="ft__more">+ {shown.hidden} more entries not shown</div>
      )}
    </div>
  );
}

/** Cap the visible rows but keep counts honest. */
function countShown(nodes: TreeNode[], max: number): { nodes: TreeNode[]; hidden: number } {
  let budget = max;
  let hidden = 0;
  const walk = (list: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const n of list) {
      if (budget <= 0) {
        hidden += countAll([n]);
        continue;
      }
      budget--;
      if (n.children.length) {
        const kept = walk(n.children);
        out.push({ ...n, children: kept });
      } else {
        out.push(n);
      }
    }
    return out;
  };
  return { nodes: walk(nodes), hidden };
}

function countAll(nodes: TreeNode[]): number {
  let n = 0;
  for (const x of nodes) {
    n++;
    n += countAll(x.children);
  }
  return n;
}
